import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { adapterManager } from './manager';
import {
  createLaunchContext,
  getInjectedEnv,
  getLaunchStrategy,
  maskEnv
} from './launch';

const TEMPLATE = `// Custom Agent Adapter Template
// Place this file in ~/.model-compass/adapters/
//
// NOTE: 'configFiles' are only written when the user opts in with --global.
// By default MC keeps its own profile under ~/.model-compass and applies the
// routing only when the agent is launched through 'mc code <id>'.

module.exports = {
  id: 'PLACEHOLDER_ID',
  name: 'PLACEHOLDER_NAME',
  type: 'custom',
  description: 'Custom Agent Adapter',
  version: '1.0.0',

  // Environment variables injected into the spawned child process only.
  launchEnv: (ctx) => ({
    API_URL: 'http://localhost:8765/v1',
    API_KEY: 'sk-dummy'
  }),

  // Optional: global config files (only applied with --global).
  configFiles: [
    {
      path: '~/.myagent/config.json',
      template: {
        api: {
          baseUrl: 'http://localhost:8765/v1',
          key: 'sk-dummy'
        }
      },
      merge: true
    }
  ]
};
`;

function getAdaptersDir(): string {
  const home = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, '.model-compass', 'adapters');
}

function createAdapter(id: string, options: { name?: string; type?: string }): void {
  const adaptersDir = getAdaptersDir();

  if (!fs.existsSync(adaptersDir)) {
    fs.mkdirSync(adaptersDir, { recursive: true });
  }

  const fileName = `${id}.js`;
  const filePath = path.join(adaptersDir, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`❌ Adapter ${id} already exists`);
    return;
  }

  let content = TEMPLATE
    .replace(/PLACEHOLDER_ID/g, id)
    .replace(/PLACEHOLDER_NAME/g, options.name || id);

  fs.writeFileSync(filePath, content);

  console.log(`✅ Adapter created: ${filePath}`);
  console.log(`   Install with:`);
  console.log(`   mc adapter install ${id}`);
}

function removeAdapter(id: string): void {
  const adaptersDir = getAdaptersDir();
  const filePath = path.join(adaptersDir, `${id}.js`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Adapter not found: ${id}`);
    return;
  }

  if (adapterManager.isInstalled(id)) {
    console.error(`❌ Please uninstall first: mc adapter uninstall ${id}`);
    return;
  }

  fs.unlinkSync(filePath);
  console.log(`✅ Adapter deleted: ${id}`);
}

function listAdapters(): void {
  const all = adapterManager.getAllAdapters();
  const installed = adapterManager.getInstalled();

  console.log('\n📦 Available Adapters:\n');

  for (const adapter of all) {
    const isInstalled = installed.includes(adapter.id);
    console.log(`  ${isInstalled ? '●' : '○'} ${adapter.id.padEnd(12)} - ${adapter.name}`);
    console.log(`      ${adapter.description}`);
    console.log(`      Type: ${adapter.type} | Version: ${adapter.version}`);
  }
  console.log('');
}

function showInstalled(): void {
  const installed = adapterManager.getInstalled();
  const all = adapterManager.getAllAdapters();

  console.log('\n📦 Installed Adapters:\n');

  if (installed.length === 0) {
    console.log('  None');
  } else {
    for (const id of installed) {
      const adapter = all.find(a => a.id === id);
      const profile = adapterManager.getProfile(id);
      const globalMark = profile?.globalApplied ? '🌐 global config written' : '🔒 isolated';
      if (adapter) {
        console.log(`  ● ${adapter.id.padEnd(12)} - ${adapter.name}  [${globalMark}]`);
      }
    }
  }
  console.log('');
}

/**
 * Print the configuration snippet so the user can apply it manually.
 * Nothing is written to disk.
 */
function exportAdapter(id: string): void {
  const adapter = adapterManager.getAdapter(id);
  if (!adapter) {
    console.error(`❌ Adapter not found: ${id}`);
    console.log('\nAvailable adapters:');
    for (const a of adapterManager.getAllAdapters()) {
      console.log(`  - ${a.id} (${a.name})`);
    }
    return;
  }

  const strategy = getLaunchStrategy(adapter.type);
  const launchCtx = createLaunchContext();

  console.log(`\n📤 ${adapter.name} - manual configuration\n`);

  if (adapter.configFiles && adapter.configFiles.length > 0) {
    console.log('Add the following to your application configuration:\n');
    for (const cf of adapter.configFiles) {
      const fullPath = cf.path.startsWith('~')
        ? cf.path
        : cf.path;
      console.log(`  File: ${fullPath}`);
      console.log(JSON.stringify(cf.template, null, 2).split('\n').map(l => `  ${l}`).join('\n'));
      console.log('');
    }
  }

  if (strategy.mode === 'env') {
    const injected = getInjectedEnv(adapter.type, launchCtx);
    console.log('Or simply launch it through MC (recommended):');
    console.log(`  mc code ${id}\n`);
    console.log('Environment variables MC injects into the child process:');
    for (const [key, value] of Object.entries(maskEnv(injected))) {
      console.log(`  ${key}=${value}`);
    }
    console.log('');
  }

  console.log('To let MC write the configuration file for you:');
  console.log(`  mc adapter install ${id} --global`);
  console.log('');
}

/** Show how each installed adapter is routed. */
function showStatus(): void {
  const installed = adapterManager.getInstalled();

  console.log('\n🧭 Adapter Status:\n');

  if (installed.length === 0) {
    console.log('  No adapters installed.');
    console.log('  You can still launch any agent with: mc code <agent>\n');
    return;
  }

  for (const id of installed) {
    const adapter = adapterManager.getAdapter(id);
    const profile = adapterManager.getProfile(id);
    const type = profile?.type || adapter?.type || 'unknown';
    const strategy = getLaunchStrategy(type);

    console.log(`  ${id}`);
    console.log(`     type:    ${type}`);
    console.log(`     mode:    ${strategy.mode}`);
    console.log(`     global:  ${profile?.globalApplied ? 'yes (config file written)' : 'no (original untouched)'}`);
    if (profile?.globalFiles?.length) {
      for (const f of profile.globalFiles) {
        console.log(`     file:    ${f}`);
      }
    }
    console.log(`     note:    ${strategy.note}`);
    console.log('');
  }
}

function reloadAdapters(): void {
  console.log('\n🔄 Reloading adapters...\n');
  
  const home = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
  const customAdaptersPath = path.join(home, '.model-compass', 'adapters');

  try {
    if (!fs.existsSync(customAdaptersPath)) {
      console.log('  No custom adapters');
    } else {
      const files = fs.readdirSync(customAdaptersPath);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      
      if (jsFiles.length === 0) {
        console.log('  No custom adapters');
      } else {
        console.log(`  Found ${jsFiles.length} custom adapter(s)`);
      }
    }

    const all = adapterManager.getAllAdapters();
    console.log(`\n  Total: ${all.length} adapter(s) (built-in + custom)`);
    console.log('\n✅ Adapters reloaded');
  } catch (err) {
    console.log(`  ⚠️ Reload failed: ${err}`);
  }
  console.log('');
}

export function addAdapterCommands(): void {
  const adapterCmd = program
    .command('adapter')
    .description('Manage Agent adapters (built-in + custom)');

  adapterCmd
    .command('list')
    .description('List all available adapters')
    .action(() => {
      listAdapters();
    });

  adapterCmd
    .command('installed')
    .description('Show installed adapters')
    .action(() => {
      showInstalled();
    });

  adapterCmd
    .command('status')
    .description('Show how each adapter is routed (env injection vs global config)')
    .action(() => {
      showStatus();
    });

  adapterCmd
    .command('install <id>')
    .description('Install adapter')
    .option('--global', 'Also write the application\'s own config file (opt-in)')
    .action(async (id, options) => {
      try {
        await adapterManager.install(id, undefined, undefined, { global: options.global === true });
      } catch (err: any) {
        console.error(`❌ Install failed: ${err.message}`);
      }
    });

  adapterCmd
    .command('uninstall <id>')
    .description('Uninstall adapter')
    .action(async (id) => {
      try {
        await adapterManager.uninstall(id);
      } catch (err: any) {
        console.error(`❌ Uninstall failed: ${err.message}`);
      }
    });

  adapterCmd
    .command('export <id>')
    .description('Print the configuration snippet for manual setup (writes nothing)')
    .action((id) => {
      exportAdapter(id);
    });

  adapterCmd
    .command('reload')
    .description('Reload custom adapters')
    .action(() => {
      reloadAdapters();
    });

  adapterCmd
    .command('create <id>')
    .description('Create custom adapter template')
    .option('-n, --name <name>', 'Adapter name')
    .option('-t, --type <type>', 'Adapter type', 'custom')
    .action((id, options) => {
      createAdapter(id, options);
    });

  adapterCmd
    .command('remove <id>')
    .description('Delete custom adapter')
    .action((id) => {
      removeAdapter(id);
    });

  adapterCmd
    .command('dev')
    .description('Show custom adapter dev guide')
    .action(() => {
      showDevGuide();
    });
}

function showDevGuide(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Custom Adapter Development Guide                    ║
╚══════════════════════════════════════════════════════════════╝

📁 Adapter Directory
   ~/.model-compass/adapters/

🔧 Development Mode

   1️⃣  JavaScript (recommended)
        File: <id>.js
        No compilation needed

   2️⃣  TypeScript
        File: <id>.ts
        Compile manually: tsc <id>.ts

📝 Basic Structure (JavaScript)

   module.exports = {
     id: 'myagent',           // Required: unique identifier
     name: 'My Agent',        // Required: display name
     type: 'custom',          // Required: type
     description: '...',      // Required: description
     version: '1.0.0',        // Required: version

     // Optional: environment variables
     envVars: {
       API_URL: 'http://localhost:8765/v1',
       API_KEY: 'sk-dummy'
     },

     // Optional: config files
     configFiles: [
       {
         path: '~/.myagent/config.json',
         template: { key: 'value' },
         merge: true
       }
     ],

     // Optional: lifecycle hooks
     onInstall: async (ctx) => { ... },
     onActivate: async (ctx) => { ... },
     onUninstall: async (ctx) => { ... },
     onDeactivate: async (ctx) => { ... }
   };

🔄 Development Workflow

   mc adapter create myagent        # Create template
   mc adapter reload                # Reload adapters
   mc adapter install myagent       # Install
   mc adapter uninstall myagent     # Uninstall
   mc adapter remove myagent        # Delete

📋 Context Object

   interface AdapterContext {
     homeDir: string;    // User home directory
     configDir: string;  // MC config directory
     port: number;       // Server port
   }

📚 Full Example

   // See template file:
   ~/.model-compass/adapters/myagent.js

   // Read MC config:
   const config = require('fs').readFileSync(
     process.env.HOME + '/.model-compass/config.json'
   );

✅ Quick Start

   mc adapter create myagent -n "My Agent"
   # Edit: ~/.model-compass/adapters/myagent.js
   mc adapter install myagent
`);
}