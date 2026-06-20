#!/usr/bin/env node

import { program } from 'commander';
import { loadConfig, getConfig, saveConfig } from '../config';
import { providerManager } from '../core/provider-manager';
import { router } from '../core/router';
import { startServer } from '../server';
import { adapterRegistry } from '../providers/registry';
import figlet from 'figlet';

console.log(
  figlet.textSync('Model Compass', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    width: 80,
    whitespaceBreak: true
  })
);
console.log('━'.repeat(60));
console.log('Intelligent LLM Routing System');
console.log('Version: 1.1.1');
console.log('License: Apache-2.0');
console.log('━'.repeat(60));
console.log('');

program
  .name('mc')
  .description('Model Compass CLI - Intelligent LLM routing tool')
  .version('1.1.1');

import { addCommand as addCodeCommands } from './agent-code';
import { addPluginCommands } from './plugin';
import { addAdapterCommands } from '../agents/adapter-commands';
import { addInitCommand } from './init';
import { adapterManager } from '../agents/manager';

addCodeCommands();
addPluginCommands();
addAdapterCommands();
addInitCommand();

program
  .command('start')
  .description('Start Model Compass service')
  .option('-p, --port <port>', 'Service port', '8765')
  .option('-c, --config <path>', 'Config file path')
  .option('-h, --host <host>', 'Service host', '0.0.0.0')
  .action(async (options) => {
    if (options.config) {
      loadConfig(options.config);
    } else {
      loadConfig();
    }

    const config = getConfig();
    config.server.port = parseInt(options.port);
    config.server.host = options.host;

    providerManager.initialize();
    startServer();

    if (adapterManager.getInstalled().length === 0) {
      console.log('');
      console.log('💡 Tip: Run \'mc plugin market list\' to browse installable plugins');
      console.log('   Or:  \'mc init --quick\' to install commonly used plugins');
    }
  });

program
  .command('model')
  .description('Manage model list')
  .argument('[action]', 'Action: list (default)')
  .action((action) => {
    loadConfig();
    const config = getConfig();

    if (action === 'list' || !action) {
      console.log('\nConfigured models:\n');
      for (const p of config.providers) {
        if (p.models.length > 0) {
          console.log(`  ${p.name}:`);
          for (const m of p.models) {
            console.log(`    - ${m}`);
          }
        }
      }
      console.log('\nAdapter-compatible provider types:\n');
      for (const a of adapterRegistry.getAllAdapters()) {
        console.log(`  ${a.metadata.name}: ${a.metadata.providerTypes.join(', ')}`);
      }
      console.log('');
    }
  });

program
  .command('provider')
  .description('Manage providers')
  .argument('[action]', 'Action: list (default), status, add, remove')
  .argument('[name]', 'Provider name')
  .action(async (action, name) => {
    loadConfig();
    const config = getConfig();

    if (action === 'list' || !action) {
      console.log('\nConfigured providers:\n');
      for (const p of config.providers) {
        console.log(`  ${p.name} (${p.type}) - ${p.models.length} models`);
      }
      console.log('\nAvailable adapters:\n');
      for (const a of adapterRegistry.getAllAdapters()) {
        console.log(`  ${a.metadata.name} v${a.metadata.version}`);
        console.log(`      ${a.metadata.description}`);
        console.log(`      Types: ${a.metadata.providerTypes.join(', ')}`);
      }
      console.log('');
    } else if (action === 'status') {
      providerManager.initialize();
      console.log('\nRunning health checks...\n');
      providerManager.runHealthChecks().then(() => {
        const statuses = providerManager.getAllStatuses();
        const available = providerManager.getAvailableProviders();
        const cooldowns = providerManager.getCooldownStatus();
        console.log('Provider status:\n');
        for (const s of statuses) {
          const inCooldown = cooldowns[s.name] ? ` (cooldown ${cooldowns[s.name]}s)` : '';
          const adapter = adapterRegistry.getAdapterByType(config.providers.find(p => p.name === s.name)?.type || '');
          const adapterLabel = adapter ? ` [${adapter.metadata.name}]` : '';
          console.log(`  ${s.name}${adapterLabel}: ${s.online ? '✓ Online' : '✗ Offline'}${inCooldown}`);
          console.log(`      ${s.models.length} model(s) | latency: ${s.latency ? s.latency + 'ms' : 'N/A'}`);
          if (s.error) console.log(`      error: ${s.error}`);
        }
        console.log(`\n  Available: ${available.length} / ${statuses.length} providers`);
        console.log('');
      }).catch(() => {
        console.log('Health check failed');
      });
    } else if (action === 'add' && name) {
      console.log(`Adding provider ${name}... (not implemented)`);
    } else if (action === 'remove' && name) {
      console.log(`Removing provider ${name}... (not implemented)`);
    }
  });

program
  .command('route')
  .description('View/set routes')
  .argument('[type]', 'Route type: default, background, think, longContext')
  .argument('[provider,model]', 'Provider,model')
  .action((type, providerModel) => {
    loadConfig();
    const config = getConfig();

    if (!type) {
      console.log('\nCurrent routes:\n');
      const routes = ['default', 'background', 'think', 'longContext', 'webSearch', 'image'];
      let activeRoutes = 0;
      for (const r of routes) {
        const model = (config.router as any)[r];
        if (model) {
          console.log(`  ${r}: ${model}`);
          activeRoutes++;
        }
      }
      console.log(`\n  ${activeRoutes} / ${routes.length} routes active`);
      console.log('');
    } else if (providerModel) {
      (config.router as any)[type] = providerModel;
      saveConfig();
      console.log(`Set ${type} route: ${providerModel}`);
    } else {
      const model = (config.router as any)[type];
      console.log(`${type}: ${model || '(not set)'}`);
    }
  });

program
  .command('config')
  .description('Open or edit configuration file')
  .option('-e, --edit', 'Edit config file')
  .option('-p, --path', 'Show config file path')
  .action((options) => {
    const configPath = require('path').join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.model-compass',
      'config.json'
    );

    if (options.path) {
      console.log(configPath);
      return;
    }

    if (options.edit) {
      const { spawn } = require('child_process');
      const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vim');
      spawn(editor, [configPath], { stdio: 'inherit' });
    } else {
      console.log(`Config file: ${configPath}`);
      console.log('Use --edit to open');
    }
  });

program.parse(process.argv);

if (process.argv.length === 2) {
  program.help();
}