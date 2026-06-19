import { Request, Response } from 'express';
import { getConfig } from '../../config';
import { providerManager } from '../../core/provider-manager';
import { failoverManager } from '../../core/failover';
import { router } from '../../core/router';
import { ChatCompletionRequest } from '../../providers/base';
import { requestStats } from '../request-stats';

function safeJsonParse(str: string, fallback: any = null): any {
  try { return JSON.parse(str); } catch { return fallback; }
}
function toAnthropicToolId(openaiId: string | undefined, idx: number): string {
  if (!openaiId) return `toolu_${idx}`;
  if (openaiId.startsWith('toolu_')) return openaiId;
  return `toolu_${openaiId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function registerChatRoutes(app: import('express').Application): void {

  app.post('/v1/messages', async (req: Request, res: Response) => {
    try {
      const reqBody = req.body as any;
      const modelHeader = req.headers['x-model'] as string;
      const manualModel = modelHeader || reqBody.model || 'mc';
      const { stream, system, messages: origMessages, tools: anthropicTools, tool_choice: anthropicToolChoice, ...rest } = reqBody;
      const messages = [...(origMessages || [])];
      if (system) {
        messages.unshift({ role: 'system', content: typeof system === 'string' ? system : (system.text || '') });
      }
      for (const msg of messages) {
        if (Array.isArray(msg.content)) {
          const firstText = msg.content.find((b: any) => b.type === 'text');
          msg.content = firstText ? firstText.text : JSON.stringify(msg.content);
        } else if (typeof msg.content === 'object' && msg.content !== null) {
          msg.content = msg.content.text || JSON.stringify(msg.content);
        }
      }
      const tools = anthropicTools?.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.input_schema || t.inputSchema || {}
        }
      }));
      let tool_choice: any = undefined;
      if (anthropicToolChoice) {
        if (anthropicToolChoice.type === 'auto') tool_choice = 'auto';
        else if (anthropicToolChoice.type === 'any') tool_choice = 'required';
        else if (anthropicToolChoice.type === 'tool' && anthropicToolChoice.name) {
          tool_choice = { type: 'function', function: { name: anthropicToolChoice.name } };
        }
      }
      const openaiBody: any = { model: manualModel, messages, ...(tools ? { tools } : {}), ...(tool_choice ? { tool_choice } : {}), ...rest };
      if (stream) {
        const routeType = router.determineRouteType({ model: manualModel, messages } as any);
        const route = router.getRoute(routeType, manualModel);
        if (!route) {
          res.status(500).json({ error: { message: 'No available route', type: 'error' } });
          return;
        }
        const provider = providerManager.getProvider(route.provider);
        if (!provider) {
          res.status(500).json({ error: { message: 'Provider not found', type: 'error' } });
          return;
        }
        openaiBody.stream = true;
        openaiBody.model = route.model;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        let msgId = `msg_${Date.now()}`;
        let sentStart = false;
        let contentBlocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: any }> = [];
        let currentBlockIndex = 0;
        let fullText = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> = new Map();
        await provider.chatCompletionStream(openaiBody, provider.config.api_key, (chunk: any) => {
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens || 0;
          }
          const delta = chunk.choices?.[0]?.delta;
          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (!sentStart) {
            sentStart = true;
            res.write(`event: message_start\ndata: ${JSON.stringify({
              type: 'message_start',
              message: {
                id: msgId,
                type: 'message',
                role: 'assistant',
                content: [],
                model: route.model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: inputTokens, output_tokens: 0 }
              }
            })}\n\n`);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallAccumulators.has(idx)) {
                const toolId = tc.id?.startsWith('toolu_') ? tc.id : `toolu_${tc.id || `call_${idx}`}`;
                toolCallAccumulators.set(idx, { id: toolId, name: tc.function?.name || '', arguments: tc.function?.arguments || '' });
                currentBlockIndex = contentBlocks.length;
                contentBlocks.push({ type: 'tool_use', id: toolId, name: tc.function?.name || '', input: {} });
                res.write(`event: content_block_start\ndata: ${JSON.stringify({
                  type: 'content_block_start',
                  index: currentBlockIndex,
                  content_block: { type: 'tool_use', id: tc.id || `toolu_${idx}`, name: tc.function?.name || '', input: {} }
                })}\n\n`);
              } else {
                const acc = toolCallAccumulators.get(idx)!;
                const argsDelta = tc.function?.arguments || '';
                if (argsDelta) {
                  acc.arguments += argsDelta;
                  const blockIdx = contentBlocks.findIndex(b => b.type === 'tool_use' && b.name === acc.name);
                  if (blockIdx >= 0) {
                    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                      type: 'content_block_delta',
                      index: blockIdx,
                      delta: { type: 'input_json_delta', partial_json: argsDelta }
                    })}\n\n`);
                  }
                }
              }
            }
          }
          if (delta?.role === 'assistant' && !contentBlocks.some(b => b.type === 'text')) {
            contentBlocks.push({ type: 'text', text: '' });
            currentBlockIndex = contentBlocks.length - 1;
            res.write(`event: content_block_start\ndata: ${JSON.stringify({
              type: 'content_block_start',
              index: currentBlockIndex,
              content_block: { type: 'text', text: '' }
            })}\n\n`);
          }
          if (delta?.content) {
            fullText += delta.content;
            if (contentBlocks[currentBlockIndex]?.type === 'text') {
              contentBlocks[currentBlockIndex].text = (contentBlocks[currentBlockIndex].text || '') + delta.content;
            }
            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: currentBlockIndex,
              delta: { type: 'text_delta', text: delta.content }
            })}\n\n`);
          }
          if (finishReason) {
            for (const [, acc] of toolCallAccumulators) {
              const blockIdx = contentBlocks.findIndex(b => b.type === 'tool_use' && b.name === acc.name);
              if (blockIdx >= 0) {
                contentBlocks[blockIdx].input = safeJsonParse(acc.arguments, {});
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: blockIdx,
                  delta: { type: 'input_json_delta', partial_json: acc.arguments }
                })}\n\n`);
                res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: blockIdx })}\n\n`);
              }
            }
            if (contentBlocks.some(b => b.type === 'text')) {
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
            }
            const anthropicStop = finishReason === 'stop' ? 'end_turn' : (finishReason === 'tool_calls' ? 'tool_use' : 'end_turn');
            res.write(`event: message_delta\ndata: ${JSON.stringify({
              type: 'message_delta',
              delta: { stop_reason: anthropicStop, stop_sequence: null },
              usage: { output_tokens: outputTokens || Math.ceil(fullText.length / 4) || 1 }
            })}\n\n`);
            res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
            res.end();
          }
        });
        requestStats.total++;
        const streamTime = new Date().toTimeString().slice(0, 5);
        requestStats.success++;
        requestStats.recent.unshift({ time: streamTime, type: routeType, model: `${route.provider}/${route.model}`, success: true });
        if (requestStats.recent.length > 50) requestStats.recent.pop();
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      const result = await failoverManager.executeWithFailover(
        openaiBody,
        undefined,
        manualModel
      );

      requestStats.total++;
      const time = new Date().toTimeString().slice(0, 5);
      if (result.success) {
        requestStats.success++;
        const response = result.response as any;
        const message = response.choices?.[0]?.message;
        const text = message?.content || '';
        const toolCalls = message?.tool_calls;
        const content: any[] = [];
        if (text) content.push({ type: 'text', text });
        if (toolCalls) {
          for (const tc of toolCalls) {
          const toolId = tc.id?.startsWith('toolu_') ? tc.id : `toolu_${tc.id || `call_${Date.now()}_${content.length}`}`;
          content.push({
            type: 'tool_use',
            id: toolId,
            name: tc.function?.name || '',
            input: safeJsonParse(tc.function?.arguments || '{}', {})
          });
          }
        }
        if (content.length === 0) content.push({ type: 'text', text: '' });
        const finishReason = response.choices?.[0]?.finish_reason;
        const anthropicStop = finishReason === 'stop' ? 'end_turn' : (finishReason === 'tool_calls' ? 'tool_use' : 'end_turn');
        requestStats.recent.unshift({ time, type: router.determineRouteType(openaiBody), model: `${result.provider}/${result.model}`, success: true });
        if (response?.usage) {
          requestStats.promptTokens += response.usage.prompt_tokens || 0;
          requestStats.completionTokens += response.usage.completion_tokens || 0;
          requestStats.totalTokens += response.usage.total_tokens || 0;
        }
        const anthropicResponse = {
          id: response.id || `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content,
          model: response.model,
          stop_reason: anthropicStop,
          usage: {
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0
          }
        };
        res.json(anthropicResponse);
      } else {
        requestStats.failed++;
        requestStats.recent.unshift({ time, type: 'message', model: manualModel, success: false });
        if (requestStats.recent.length > 50) requestStats.recent.pop();
        res.status(500).json({ error: { message: result.error || 'Request failed', type: 'error' } });
      }
    } catch (error: any) {
      console.error('[v1/messages] exception:', error?.message, error?.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: { message: error.message, type: 'error' } });
      } else {
        try {
          res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: "error", stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
          res.end();
        } catch {}
      }
    }
  });

  app.post('/v1/chat/completions', async (req: Request, res: Response) => {
    try {
      const reqBody = req.body as ChatCompletionRequest;
      const modelHeader = req.headers['x-model'] as string;
      const modelQuery = req.query.model as string;
      const modelBody = reqBody.model as string;
      let manualModel: string | undefined;
      if (modelHeader) {
        manualModel = modelHeader;
      } else if (modelQuery) {
        manualModel = modelQuery;
      } else if (modelBody) {
        if (modelBody.includes(',')) {
          manualModel = modelBody;
          reqBody.model = modelBody.split(',')[1] || modelBody;
        } else {
          manualModel = modelBody;
        }
      }
      const routeType = router.determineRouteType(reqBody);
      const result = await failoverManager.executeWithFailover(reqBody, undefined, manualModel);
      requestStats.total++;
      const time = new Date().toTimeString().slice(0, 5);
      const modelName = manualModel || reqBody.model;
      if (result.success) {
        requestStats.success++;
        const response = result.response as any;
        if (response?.usage) {
          requestStats.promptTokens += response.usage.prompt_tokens || 0;
          requestStats.completionTokens += response.usage.completion_tokens || 0;
          requestStats.totalTokens += response.usage.total_tokens || 0;
        }
        requestStats.recent.unshift({ time, type: routeType, model: `${result.provider}/${result.model}`, success: true });
        res.json(result.response);
      } else {
        requestStats.failed++;
        requestStats.recent.unshift({ time, type: routeType, model: modelName, success: false });
        if (requestStats.recent.length > 50) requestStats.recent.pop();
        res.status(500).json({
          error: {
            message: result.error || 'Request failed',
            type: 'invalid_request_error',
            code: 'request_failed'
          }
        });
      }
    } catch (error: any) {
      console.error('Chat completion error:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal error',
          type: 'internal_error',
          code: 'internal_error'
        }
      });
    }
  });

  app.post('/v1/chat/completions/stream', async (req: Request, res: Response) => {
    try {
      const reqBody = req.body as ChatCompletionRequest;
      const timeout = parseInt(req.headers['x-timeout'] as string) || 5000;
      const modelHeader = req.headers['x-model'] as string;
      const manualModel = modelHeader || reqBody.model;
      const routeType = router.determineRouteType(reqBody);
      const route = router.getRoute(routeType, manualModel);
      if (!route) {
        res.status(500).json({ error: { message: 'No available route', type: 'invalid_request_error' } });
        return;
      }
      const provider = providerManager.getProvider(route.provider);
      if (!provider) {
        res.status(500).json({ error: { message: 'Provider not found', type: 'invalid_request_error' } });
        return;
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      let timeoutTriggered = false;
      await provider.chatCompletionStream(reqBody, provider.config.api_key, (chunk) => {
        if (timeoutTriggered) return;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }, {
        timeout,
        onTimeout: () => {
          timeoutTriggered = true;
          res.write(`data: ${JSON.stringify({ timeout: true, message: 'Thinking timeout - decide to continue or stop' })}\n\n`);
        }
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });
}
