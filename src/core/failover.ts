import { getConfig } from '../config';
import { BaseProvider, ChatCompletionRequest } from '../providers/base';
import { providerManager } from './provider-manager';
import { router } from './router';

export interface FailoverResult {
  success: boolean;
  provider: string;
  model: string;
  response?: unknown;
  error?: string;
  attempts: number;
}

export interface ErrorClassification {
  retryable: boolean;
  cooldownSeconds: number;
  message: string;
}

export class FailoverManager {
  private retryCount: Map<string, number> = new Map();

  classifyError(status: number, errorMessage: string): ErrorClassification {
    const config = getConfig();
    const autoSwitchConfig = config.smartRouting.autoSwitch;

    if (!autoSwitchConfig.enabled) {
      return {
        retryable: false,
        cooldownSeconds: 0,
        message: 'Auto switch disabled'
      };
    }

    if (autoSwitchConfig.retryableErrors.includes(status)) {
      return {
        retryable: true,
        cooldownSeconds: autoSwitchConfig.cooldownSeconds,
        message: `Retryable HTTP error: ${status}`
      };
    }

    const lowerMsg = errorMessage.toLowerCase();
    
    if (lowerMsg.includes('rate limit') || lowerMsg.includes('429') || lowerMsg.includes('too many requests')) {
      return {
        retryable: true,
        cooldownSeconds: autoSwitchConfig.cooldownSeconds,
        message: 'Rate limit exceeded'
      };
    }

    if (lowerMsg.includes('timeout') || lowerMsg.includes('etimedout') || lowerMsg.includes('connect timeout')) {
      return {
        retryable: true,
        cooldownSeconds: Math.floor(autoSwitchConfig.cooldownSeconds / 2),
        message: 'Request timeout'
      };
    }

    if (lowerMsg.includes('econnrefused') || lowerMsg.includes('connect error') || lowerMsg.includes('network')) {
      return {
        retryable: true,
        cooldownSeconds: autoSwitchConfig.cooldownSeconds,
        message: 'Network error'
      };
    }

    if (lowerMsg.includes('quota') || lowerMsg.includes('insufficient') || lowerMsg.includes('billing')) {
      return {
        retryable: true,
        cooldownSeconds: autoSwitchConfig.cooldownSeconds * 5,
        message: 'Quota exceeded'
      };
    }

    if (status >= 500) {
      return {
        retryable: true,
        cooldownSeconds: autoSwitchConfig.cooldownSeconds / 2,
        message: `Server error: ${status}`
      };
    }

    return {
      retryable: false,
      cooldownSeconds: 0,
      message: errorMessage
    };
  }

  async executeWithFailover(
    req: ChatCompletionRequest,
    manualProvider?: string,
    manualModel?: string
  ): Promise<FailoverResult> {
    const config = getConfig();
    const autoSwitchConfig = config.smartRouting.autoSwitch;

    if (manualModel) {
      const routeType = router.determineRouteType(req);
      const route = router.getRoute(routeType, manualModel);
      if (route) {
        const provider = providerManager.getProvider(route.provider);
        if (provider) {
          const routedReq = { ...req, model: route.model };
          try {
            const response = await provider.chatCompletion(routedReq, provider.config.api_key);
            return {
              success: true,
              provider: route.provider,
              model: route.model,
              response,
              attempts: 1
            };
          } catch (error: any) {
            const upstreamBody = error?.response?.data ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data).slice(0, 500) : String(error.response.data).slice(0, 500)) : 'no body';
            console.log(`[failover] manualModel first attempt failed: provider=${route.provider} error=${error.message} upstream=${upstreamBody}`);
          }
        }
      }
      // Continue to handleFailover below instead of returning immediately
    }

    const routeType = router.determineRouteType(req);
    const route = router.getRoute(routeType);

    if (!route) {
      const available = router.getAvailableModel(config.autoRoute?.provider, config.autoRoute?.model);
      if (!available) {
        return {
          success: false,
          provider: '',
          model: '',
          error: 'No available model',
          attempts: 0
        };
      }
      
      const routedReq = { ...req, model: available.model };
      try {
        const response = await available.providerInstance.chatCompletion(routedReq, available.providerInstance.config.api_key);
        return {
          success: true,
          provider: available.provider,
          model: available.model,
          response,
          attempts: 1
        };
      } catch (error: any) {
        return await this.handleFailover(req, available.provider, available.model);
      }
    }

    const initialProvider = route.provider;
    const initialModel = route.model;

    return await this.handleFailover(req, initialProvider, initialModel);
  }

  private async handleFailover(req: ChatCompletionRequest, initialProvider: string, initialModel: string): Promise<FailoverResult> {
    const config = getConfig();
    const autoSwitchConfig = config.smartRouting.autoSwitch;
    const maxRetries = autoSwitchConfig.maxRetries;
    
    let currentProvider = initialProvider;
    let currentModel = initialModel;
    let attempts = 0;
    let lastError = '';

    while (attempts < maxRetries) {
      const provider = providerManager.getProvider(currentProvider);
      if (!provider) {
        lastError = 'Provider not found';
        break;
      }

      const status = providerManager.getAllStatuses().find(s => s.name === currentProvider);
      if (!status?.online) {
        const next = router.findNextAvailable(currentProvider, currentModel);
        if (next) {
          currentProvider = next.provider;
          currentModel = next.model;
          attempts++;
          continue;
        }
        lastError = 'No available provider';
        break;
      }

      const routedReq = { ...req, model: currentModel };
      try {
        const response = await provider.chatCompletion(routedReq, provider.config.api_key);
        return {
          success: true,
          provider: currentProvider,
          model: currentModel,
          response,
          attempts: attempts + 1
        };
      } catch (error: any) {
        lastError = error.message || String(error);
        const upBody = error?.response?.data ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data).slice(0, 500) : String(error.response.data).slice(0, 500)) : '';
        if (upBody) console.log(`[failover] upstream ${currentProvider} error body: ${upBody}`);
        const errorInfo = this.classifyError(error.response?.status, error.message);
        
        if (errorInfo.retryable) {
          providerManager.setCooldown(currentProvider, errorInfo.cooldownSeconds * 1000);
        }

        attempts++;

        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, autoSwitchConfig.retryDelay));
          
          const next = router.findNextAvailable(currentProvider, currentModel);
          if (next) {
            currentProvider = next.provider;
            currentModel = next.model;
          } else {
            break;
          }
        }
      }
    }

    const finalAvailable = router.getAvailableModel(config.autoRoute?.provider, config.autoRoute?.model);
    if (finalAvailable && (currentProvider !== finalAvailable.provider || currentModel !== finalAvailable.model)) {
      const routedReq = { ...req, model: finalAvailable.model };
      try {
        const response = await finalAvailable.providerInstance.chatCompletion(routedReq, finalAvailable.providerInstance.config.api_key);
        return {
          success: true,
          provider: finalAvailable.provider,
          model: finalAvailable.model,
          response,
          attempts: attempts + 1
        };
      } catch { }
    }

    return {
      success: false,
      provider: currentProvider,
      model: currentModel,
      error: lastError || 'No available model',
      attempts
    };
  }

  getCooldownStatus(): Record<string, number> {
    return providerManager.getCooldownStatus();
  }
}

export const failoverManager = new FailoverManager();