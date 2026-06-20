import { program } from 'commander';
import { getAllPlugins, getAuthorName, getTypeLabel, installFromMarket } from '../agents/marketplace';

const QUICK_PLUGINS = ['claude', 'opencode', 'cursor'];

export function addInitCommand(): void {
  program
    .command('init')
    .description('Initialize Model Compass with plugins')
    .option('--quick', 'Install commonly used plugins (claude, opencode, cursor)')
    .option('--list', 'List available plugins for setup')
    .action(async (options) => {
      if (options.list) {
        const plugins = getAllPlugins();
        console.log('\nAvailable plugins:\n');
        for (const p of plugins) {
          const typeLabel = getTypeLabel(p.type);
          console.log(`  [${typeLabel}] ${p.id.padEnd(16)} ${p.name}`);
          console.log(`      ${p.description}`);
          console.log(`      Author: ${getAuthorName(p.author)} | Tags: ${p.tags.join(', ')}\n`);
        }
        return;
      }

      if (options.quick) {
        console.log('\n🚀 Quick setup - installing commonly used plugins...\n');
        for (const id of QUICK_PLUGINS) {
          try {
            await installFromMarket(id);
          } catch (err: any) {
            console.error(`  ✗ ${id}: ${err.message}`);
          }
        }
        console.log('\n✅ Quick setup complete!');
        console.log('   Run \'mc start\' to start the server');
        return;
      }

      console.log('\n📦 Model Compass Setup\n');
      console.log('Usage:');
      console.log('  mc init --quick       Install commonly used plugins');
      console.log('  mc init --list        Browse all available plugins');
      console.log('  mc plugin install <id>  Install a specific plugin');
      console.log('');
    });
}
