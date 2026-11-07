import * as fs from 'fs';
import * as path from 'path';
import {
  AgentAdapter,
  AdapterContext,
  builtInAdapters,
  createAdapterContext
} from './types';
import { AgentProfile, loadProfile, removeProfile, saveProfile } from './profiles';
import { createLaunchContext, getLaunchStrategy, getInjectedEnv } from './launch';

export interface InstallOptions {
  /**
   * Write the target application's own configuration file.
   * Defaults to false so that MC never pollutes third-party applications.
   */
  global?: boolean;
}

export class AdapterManager {
  private adapters: Map<string, AgentAdapter> = new Map();
  private customAdaptersPath: string;
  private installedPath: string;

  constructor() {
    const homeDir = process.env.MC_HOME || process.env.HOME || process.env.USERPROFILE || '.';
    this.customAdaptersPath = path.join(homeDir, '.model-compass', 'adapters');
    this.installedPath = path.join(homeDir, '.model-compass', 'adapters.json');
    
    this.loadBuiltInAdapters();
    this.loadCustomAdapters();
  }

  private loadBuiltInAdapters(): void {
    for (const adapter of builtInAdapters) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  private loadCustomAdapters(): void {
    try {
      if (!fs.existsSync(this.customAdaptersPath)) {
        return;
      }

      const files = fs.readdirSync(this.customAdaptersPath);
      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.ts')) {
          continue;
        }

        const filePath = path.join(this.customAdaptersPath, file);
        try {
          const adapter = require(filePath);
          if (adapter && adapter.id) {
            this.adapters.set(adapter.id, adapter);
          }
        } catch (err) {
          // Silent fail
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  addAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  removeAdapter(id: string): boolean {
    return this.adapters.delete(id);
  }

  getAdapter(id: string): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  getAllAdapters(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  getInstalled(): string[] {
    try {
      if (fs.existsSync(this.installedPath)) {
        return JSON.parse(fs.readFileSync(this.installedPath, 'utf-8'));
      }
    } catch {}
    return [];
  }

  setInstalled(installed: string[]): void {
    const dir = path.dirname(this.installedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.installedPath, JSON.stringify(installed, null, 2));
  }

  isInstalled(id: string): boolean {
    return this.getInstalled().includes(id);
  }

  /** Read the MC-owned profile of an adapter. */
  getProfile(id: string): AgentProfile | undefined {
    return loadProfile(id);
  }

  /**
   * Install an adapter.
   *
   * By default nothing outside of ~/.model-compass is touched: MC records a
   * profile and applies the routing when the agent is launched through
   * `mc code <agent>`.
   *
   * Pass `options.global = true` to additionally write the target
   * application's own configuration file (explicit user opt-in).
   */
  async install(
    id: string,
    adapter?: AgentAdapter,
    context?: AdapterContext,
    options?: InstallOptions
  ): Promise<void> {
    const resolvedAdapter = adapter || this.adapters.get(id);
    if (!resolvedAdapter) {
      throw new Error(`Unknown adapter: ${id}`);
    }

    if (this.isInstalled(id)) {
      console.log(`⚠️  ${resolvedAdapter.name} is already installed`);
      return;
    }

    const ctx = context || createAdapterContext();
    const wantsGlobal = options?.global === true;

    console.log(`📦 Installing ${resolvedAdapter.name} adapter...\n`);

    if (resolvedAdapter.onInstall) {
      await resolvedAdapter.onInstall(ctx);
    }

    // 1. Always persist MC's own profile.
    const profile = this.buildProfile(resolvedAdapter, ctx);
    saveProfile(profile);

    // 2. Only write the third-party config when explicitly requested.
    let globalFiles: string[] = [];
    if (wantsGlobal && resolvedAdapter.configFiles && resolvedAdapter.configFiles.length > 0) {
      console.log('  ⚠️  Writing global configuration (--global):');
      for (const cf of resolvedAdapter.configFiles) {
        const written = await this.applyConfigFile(cf.path, cf.template, cf.merge);
        if (written) globalFiles.push(this.expandPath(cf.path));
      }
    } else if (resolvedAdapter.configFiles && resolvedAdapter.configFiles.length > 0) {
      console.log('  ℹ️  Global config not written (use --global to opt in)');
      for (const cf of resolvedAdapter.configFiles) {
        console.log(`     ${this.expandPath(cf.path)}`);
      }
    }

    profile.globalApplied = globalFiles.length > 0;
    profile.globalFiles = globalFiles;
    saveProfile(profile);

    const installed = this.getInstalled();
    installed.push(id);
    this.setInstalled(installed);

    if (resolvedAdapter.onActivate) {
      await resolvedAdapter.onActivate(ctx);
    }

    console.log(`\n✅ ${resolvedAdapter.name} adapter installed!`);
    console.log(`   Launch it with: mc code ${id}`);
    console.log('   Your original application configuration was left untouched.');
  }

  /**
   * Uninstall an adapter.
   *
   * The third-party configuration file is only restored when it was written
   * by MC in global mode.
   */
  async uninstall(id: string, context?: AdapterContext, options?: InstallOptions): Promise<void> {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${id}`);
    }

    if (!this.isInstalled(id)) {
      console.log(`⚠️  ${adapter.name} is not installed`);
      return;
    }

    const ctx = context || createAdapterContext();
    const profile = loadProfile(id);

    if (adapter.onUninstall) {
      await adapter.onUninstall(ctx);
    }

    // Restore global config only if MC wrote it in global mode.
    if (profile?.globalApplied && profile.globalFiles && profile.globalFiles.length > 0) {
      console.log('  ↩️  Restoring global configuration:');
      for (const filePath of profile.globalFiles) {
        this.restoreConfigFile(filePath);
      }
    } else if (adapter.configFiles && adapter.configFiles.length > 0) {
      console.log('  ℹ️  No global configuration was written - nothing to restore');
    }

    if (adapter.onDeactivate) {
      await adapter.onDeactivate(ctx);
    }

    removeProfile(id);

    const installed = this.getInstalled().filter(i => i !== id);
    this.setInstalled(installed);

    console.log(`✅ ${adapter.name} adapter uninstalled`);
  }

  private buildProfile(adapter: AgentAdapter, ctx: AdapterContext): AgentProfile {
    const launchCtx = createLaunchContext();
    let env: Record<string, string> = {};

    try {
      env = adapter.launchEnv ? adapter.launchEnv(ctx) : getInjectedEnv(adapter.type, launchCtx);
    } catch {
      env = {};
    }

    let args: string[] = [];
    try {
      args = adapter.launchArgs ? adapter.launchArgs(ctx) : [];
    } catch {
      args = [];
    }

    return {
      id: adapter.id,
      name: adapter.name,
      type: adapter.type,
      description: adapter.description,
      version: adapter.version,
      env,
      args,
      globalApplied: false,
      globalFiles: [],
      installedAt: Date.now()
    };
  }

  /**
   * Write a config file into the target application's directory.
   * The previous content is backed up once so it can be restored later.
   */
  private async applyConfigFile(filePath: string, template: object, merge?: boolean): Promise<boolean> {
    const fullPath = this.expandPath(filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content = JSON.stringify(template, null, 2);
    const shouldMerge = merge !== false;

    if (fs.existsSync(fullPath)) {
      this.backupConfigFile(fullPath);
      if (shouldMerge) {
        try {
          const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
          const merged = this.deepMerge(existing, template as Record<string, unknown>);
          content = JSON.stringify(merged, null, 2);
          console.log(`  ✓ Merged config: ${fullPath}`);
        } catch {
          console.log(`  ✗ Skipped config (JSON parse failed): ${fullPath}`);
          return false;
        }
      } else {
        console.log(`  ✓ Overwrote config: ${fullPath}`);
      }
    } else {
      console.log(`  ✓ Created config: ${fullPath}`);
    }

    fs.writeFileSync(fullPath, content);
    return true;
  }

  /** Keep the original file around so it can be restored on uninstall. */
  private backupConfigFile(fullPath: string): void {
    const backupPath = `${fullPath}.mc-backup`;
    if (fs.existsSync(backupPath)) return;
    try {
      fs.copyFileSync(fullPath, backupPath);
      console.log(`  💾 Backed up original: ${backupPath}`);
    } catch {
      // ignore backup failures
    }
  }

  /** Restore the original file from the backup created by MC. */
  private restoreConfigFile(fullPath: string): void {
    const backupPath = `${fullPath}.mc-backup`;
    try {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, fullPath);
        fs.unlinkSync(backupPath);
        console.log(`  ✓ Restored: ${fullPath}`);
      } else if (fs.existsSync(fullPath)) {
        // No backup available - only strip the keys MC added.
        const template = { 'model-compass': {} };
        const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
        const cleaned = this.removeTemplateKeys(existing, template);
        fs.writeFileSync(fullPath, JSON.stringify(cleaned, null, 2));
        console.log(`  ✓ Cleaned: ${fullPath}`);
      }
    } catch {
      console.log(`  ✗ Could not restore: ${fullPath}`);
    }
  }

  private expandPath(filePath: string): string {
    if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
      const home = process.env.HOME || process.env.USERPROFILE || '.';
      return path.join(home, filePath.slice(2));
    }
    return filePath;
  }

  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(
          (result[key] as Record<string, unknown>) || {},
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  private removeTemplateKeys(obj: Record<string, unknown>, template: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...obj };
    for (const key of Object.keys(template)) {
      delete result[key];
    }
    return result;
  }
}

export const adapterManager = new AdapterManager();
