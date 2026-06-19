import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { adapterManager } from './manager';

const TEMPLATE = `// Custom Agent Adapter Template
// Place this file in ~/.model-compass/adapters/

module.exports = {
  id: 'PLACEHOLDER_ID',
  name: 'PLACEHOLDER_NAME',
  type: 'custom',
  description: 'Custom Agent Adapter',
  version: '1.0.0',
  
  envVars: {
    API_URL: 'http://localhost:8765/v1',
    API_KEY: 'sk-dummy'
  },

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
      if (adapter) {
        console.log(`  ● ${adapter.id.padEnd(12)} - ${adapter.name}`);
      }
    }
  }
  console.log('');
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
    .command('install <id>')
    .description('Install adapter')
    .action(async (id) => {
      try {
        await adapterManager.install(id);
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