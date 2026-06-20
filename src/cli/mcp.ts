import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getConfig } from '../config';

/**
 * MCP Server setup command
 * Allows users to register Model Compass as an MCP server in Claude Code and Claude Desktop
 */

export function addMcpCommand(): void {
  const mcpCmd = program
    .command('mcp')
    .description('MCP server setup and management');

  mcpCmd
    .command('install')
    .description('Install Model Compass as an MCP server in Claude Code / Claude Desktop')
    .action(() => {
      try {
        const homedir = require('os').homedir();
        const platform = require('os').platform();
        
        // Get MCP server path - when running from dist/cli/mcp.js, __dirname is dist/cli/
        // Use absolute path to avoid working directory issues
        const mcpServerPath = path.resolve(__dirname, '..', 'mcp-server', 'index.js');
        const nodePath = process.execPath; // Full path to current Node.js executable
        
        // On Windows, node.exe lives under "Program Files" which has spaces.
        // Claude Desktop may incorrectly split the command on spaces. Use a wrapper script instead.
        let serverCommand: string;
        let serverArgs: string[];
        
        if (platform === 'win32') {
          const wrapperPath = path.join(homedir, '.model-compass', 'mcp-server.cmd');
          const wrapperDir = path.dirname(wrapperPath);
          if (!fs.existsSync(wrapperDir)) {
            fs.mkdirSync(wrapperDir, { recursive: true });
          }
          // Write a .cmd wrapper that avoids spaces in the command field
          const wrapperContent = `@echo off
"${nodePath}" "${mcpServerPath}"
`;
          fs.writeFileSync(wrapperPath, wrapperContent, 'utf-8');
          serverCommand = wrapperPath;
          serverArgs = [];
        } else {
          serverCommand = nodePath;
          serverArgs = [mcpServerPath];
        }
        
        const mcpConfig = {
          "mcpServers": {
            "model-compass": {
              "command": serverCommand,
              "args": serverArgs,
              "env": {
                "MC_HOME": path.join(homedir, '.model-compass')
              }
            }
          }
        };

        // 1) Write to ~/.config/mcp/model-compass.json (generic MCP config)
        const mcpConfigPath = path.join(homedir, '.config', 'mcp', 'model-compass.json');
        const mcpDir = path.dirname(mcpConfigPath);
        if (!fs.existsSync(mcpDir)) {
          fs.mkdirSync(mcpDir, { recursive: true });
        }
        fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
        console.log('✅ MCP config written to:', mcpConfigPath);

        // 2) Write to Claude Code config (~/.claude/mcp-servers.json)
        const claudeCodeConfigPath = path.join(homedir, '.claude', 'mcp-servers.json');
        if (fs.existsSync(claudeCodeConfigPath)) {
          const claudeConfig = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf-8'));
          claudeConfig.mcpServers = claudeConfig.mcpServers || {};
          claudeConfig.mcpServers['model-compass'] = mcpConfig.mcpServers['model-compass'];
          fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(claudeConfig, null, 2));
          console.log('✅ Claude Code MCP config updated');
        }

        // 3) Write to Claude Desktop config
        // macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
        // Windows: %APPDATA%/Claude/claude_desktop_config.json
        let claudeDesktopConfigPath: string | null = null;

        if (platform === 'darwin') {
          claudeDesktopConfigPath = path.join(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        } else if (platform === 'win32') {
          const appData = process.env.APPDATA;
          if (appData) {
            claudeDesktopConfigPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
          }
        } else {
          // Linux fallback
          claudeDesktopConfigPath = path.join(homedir, '.config', 'Claude', 'claude_desktop_config.json');
        }

        if (claudeDesktopConfigPath) {
          let claudeDesktopConfig: any = {};
          const desktopDir = path.dirname(claudeDesktopConfigPath);
          
          if (fs.existsSync(claudeDesktopConfigPath)) {
            claudeDesktopConfig = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf-8'));
          } else {
            // Ensure parent directory exists
            if (!fs.existsSync(desktopDir)) {
              fs.mkdirSync(desktopDir, { recursive: true });
            }
          }
          
          claudeDesktopConfig.mcpServers = claudeDesktopConfig.mcpServers || {};
          claudeDesktopConfig.mcpServers['model-compass'] = mcpConfig.mcpServers['model-compass'];
          fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(claudeDesktopConfig, null, 2));
          console.log('✅ Claude Desktop MCP config updated');
        }

        console.log('\n🧭 Model Compass MCP Server installed successfully!');
        console.log('\nAvailable tools:');
        console.log('  - mc_model_list: List all available models');
        console.log('  - mc_model_switch: Switch to a specific model (e.g., mc/auto, anthropic/claude-3.5-sonnet)');
        console.log('  - mc_model_current: View the current active model');
        console.log('\n⚠️  Important: Please restart Claude Desktop / Claude Code to load the new tools');
        console.log('   After restart, use natural language to interact with these tools, e.g.:');
        console.log('   - "List all available models"');
        console.log('   - "Switch to anthropic/claude-3.5-sonnet"');
        console.log('   - "Show current model"');

      } catch (error: any) {
        console.error('❌ Failed to install MCP server:', error.message);
      }
    });

  mcpCmd
    .command('uninstall')
    .description('Remove Model Compass MCP server from all configurations')
    .action(() => {
      try {
        const homedir = require('os').homedir();
        const mcpConfigPath = path.join(homedir, '.config', 'mcp', 'model-compass.json');
        const claudeCodeConfigPath = path.join(homedir, '.claude', 'mcp-servers.json');

        if (fs.existsSync(mcpConfigPath)) {
          fs.unlinkSync(mcpConfigPath);
          console.log('✅ MCP config removed');
        }

        if (fs.existsSync(claudeCodeConfigPath)) {
          const claudeConfig = JSON.parse(fs.readFileSync(claudeCodeConfigPath, 'utf-8'));
          if (claudeConfig.mcpServers) {
            delete claudeConfig.mcpServers['model-compass'];
            fs.writeFileSync(claudeCodeConfigPath, JSON.stringify(claudeConfig, null, 2));
            console.log('✅ Claude Code config updated');
          }
        }

        // Remove from Claude Desktop
        const platform = require('os').platform();
        let claudeDesktopConfigPath: string | null = null;

        if (platform === 'darwin') {
          claudeDesktopConfigPath = path.join(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        } else if (platform === 'win32') {
          const appData = process.env.APPDATA;
          if (appData) {
            claudeDesktopConfigPath = path.join(appData, 'Claude', 'claude_desktop_config.json');
          }
        } else {
          claudeDesktopConfigPath = path.join(homedir, '.config', 'Claude', 'claude_desktop_config.json');
        }

        if (claudeDesktopConfigPath && fs.existsSync(claudeDesktopConfigPath)) {
          const claudeDesktopConfig = JSON.parse(fs.readFileSync(claudeDesktopConfigPath, 'utf-8'));
          if (claudeDesktopConfig.mcpServers) {
            delete claudeDesktopConfig.mcpServers['model-compass'];
            fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify(claudeDesktopConfig, null, 2));
            console.log('✅ Claude Desktop config updated');
          }
        }

        console.log('\n🧭 Model Compass MCP Server uninstalled');
        console.log('⚠️  Please restart Claude Desktop / Claude Code for changes to take effect');
      } catch (error: any) {
        console.error('❌ Failed to uninstall MCP server:', error.message);
      }
    });
}
