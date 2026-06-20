import { program } from 'commander';
import { loadConfig, getConfig } from '../config';
import { PluginManager, pluginManager as defaultPluginManager } from '../plugins/plugin-manager';
import { PluginType } from '../plugins/types';

export function getProviderPluginManager(): PluginManager {
  loadConfig();
  const config = getConfig();
  const pluginDir = config.plugins?.pluginDir;
  if (pluginDir) return new PluginManager(pluginDir);
  return defaultPluginManager;
}

export function listProviderPlugins(): void {
  const pm = getProviderPluginManager();
  const plugins = pm.getPluginsByType(PluginType.PROVIDER);

  console.log('\nProvider Plugins:\n');
  if (plugins.length === 0) {
    console.log('  No provider plugins installed');
    console.log('  Install from npm:  mc plugin install-npm @yungkei/model-compass-openai-provider');
    console.log('  Install from GitHub: mc plugin install-github yungkei/model-compass-openai-provider\n');
    return;
  }

  for (const p of plugins) {
    const inst = pm.getInstallation(p.metadata.id);
    const source = inst ? `[${inst.source}]` : '[?]';
    console.log(`  ${'●'} ${p.metadata.id}`);
    console.log(`      ${p.metadata.name} v${p.metadata.version} ${source}`);
    if (p.metadata.description) console.log(`      ${p.metadata.description}`);
  }
  console.log('');
}

export function listAllPlugins(): void {
  const pm = getProviderPluginManager();
  const all = pm.listPlugins();

  console.log('\nAll Plugins:\n');
  if (all.length === 0) {
    console.log('  No plugins installed\n');
    return;
  }

  for (const p of all) {
    const inst = pm.getInstallation(p.metadata.id);
    const source = inst ? `[${inst.source}]` : '[?]';
    const typeIcon = p.type === PluginType.PROVIDER ? 'P' : p.type === PluginType.AGENT ? 'A' : 'R';
    console.log(`  ${typeIcon} ${p.metadata.id}`);
    console.log(`      ${p.metadata.name} v${p.metadata.version} ${source}`);
    if (p.metadata.description) console.log(`      ${p.metadata.description}`);
  }
  console.log(`  Total: ${all.length} plugin(s) (${pm.getPluginsByType(PluginType.PROVIDER).length} provider, ${pm.getPluginsByType(PluginType.AGENT).length} agent, ${pm.getPluginsByType(PluginType.ROUTER).length} router)`);
  console.log('');
}

export async function installNpmPlugin(packageName: string, version?: string): Promise<void> {
  const pm = getProviderPluginManager();
  console.log(`Installing provider plugin: ${packageName}${version ? `@${version}` : ''}...`);
  const result = await pm.installFromNpm(packageName, version);
  if (result.success) {
    console.log(`✅ Installed: ${result.plugin!.metadata.name} v${result.plugin!.metadata.version}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
  }
}

export async function installGitHubPlugin(repo: string, ref?: string): Promise<void> {
  const pm = getProviderPluginManager();
  console.log(`Installing from GitHub: ${repo}${ref ? `#${ref}` : ''}...`);
  const result = await pm.installFromGitHub(repo, ref);
  if (result.success) {
    console.log(`✅ Installed: ${result.plugin!.metadata.name} v${result.plugin!.metadata.version}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
  }
}

export async function uninstallPlugin(id: string): Promise<void> {
  const pm = getProviderPluginManager();
  const success = await pm.unregisterPlugin(id);
  if (success) {
    console.log(`✅ Uninstalled: ${id}`);
  } else {
    console.error(`❌ Not found: ${id}`);
  }
}

export async function loadLocalPlugin(pluginPath: string): Promise<void> {
  const pm = getProviderPluginManager();
  console.log(`Loading plugin from: ${pluginPath}...`);
  const result = await pm.loadPlugin(pluginPath);
  if (result.success && result.plugin) {
    await pm.registerPlugin(result.plugin, 'file');
    console.log(`✅ Loaded: ${result.plugin.metadata.name} v${result.plugin.metadata.version}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
  }
}

export function addProviderPluginCommands(): void {
  const pluginCmd = program
    .command('plugin-provider')
    .description('Manage provider plugins (install from npm/GitHub)');

  pluginCmd
    .command('list')
    .description('List installed provider plugins')
    .action(() => listProviderPlugins());

  pluginCmd
    .command('list-all')
    .description('List all installed plugins (provider, agent, router)')
    .action(() => listAllPlugins());

  pluginCmd
    .command('install <package> [version]')
    .description('Install a provider plugin from npm registry')
    .action(async (pkg, ver) => await installNpmPlugin(pkg, ver));

  pluginCmd
    .command('install-github <repo> [ref]')
    .description('Install a provider plugin from GitHub')
    .action(async (repo, ref) => await installGitHubPlugin(repo, ref));

  pluginCmd
    .command('load <path>')
    .description('Load a provider plugin from local path')
    .action(async (pluginPath) => await loadLocalPlugin(pluginPath));

  pluginCmd
    .command('uninstall <id>')
    .description('Uninstall a provider plugin')
    .action(async (id) => await uninstallPlugin(id));

  pluginCmd
    .command('reload')
    .description('Reload all plugins from plugin directory')
    .action(async () => {
      const pm = getProviderPluginManager();
      const all = pm.listPlugins();
      for (const p of all) {
        await pm.unregisterPlugin(p.metadata.id);
      }
      await pm.loadAllPlugins();
      console.log('✅ Plugins reloaded');
    });
}
