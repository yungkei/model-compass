import * as fs from 'fs';
import * as path from 'path';
import {
  AgentAdapter,
  AdapterContext,
  builtInAdapters,
  createAdapterContext
} from './types';

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

  async install(id: string, adapter?: AgentAdapter, context?: AdapterContext): Promise<void> {
    const resolvedAdapter = adapter || this.adapters.get(id);
    if (!resolvedAdapter) {
      throw new Error(`Unknown adapter: ${id}`);
    }

    if (this.isInstalled(id)) {
      console.log(`⚠️  ${resolvedAdapter.name} is already installed`);
      return;
    }

    const ctx = context || createAdapterContext();
    console.log(`📦 Installing ${resolvedAdapter.name} adapter...\n`);

    if (resolvedAdapter.onInstall) {
      await resolvedAdapter.onInstall(ctx);
    }

    if (resolvedAdapter.configFiles) {
      for (const cf of resolvedAdapter.configFiles) {
        await this.applyConfigFile(cf.path, cf.template, cf.merge);
      }
    }

    const installed = this.getInstalled();
    installed.push(id);
    this.setInstalled(installed);

    if (resolvedAdapter.onActivate) {
      await resolvedAdapter.onActivate(ctx);
    }

    console.log(`\n✅ ${resolvedAdapter.name} adapter installed!`);
  }

  async uninstall(id: string, context?: AdapterContext): Promise<void> {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${id}`);
    }

    if (!this.isInstalled(id)) {
      console.log(`⚠️  ${adapter.name} is not installed`);
      return;
    }

    const ctx = context || createAdapterContext();

    if (adapter.onUninstall) {
      await adapter.onUninstall(ctx);
    }

    if (adapter.configFiles) {
      for (const cf of adapter.configFiles) {
        await this.removeConfigFile(cf.path, cf.template);
      }
    }

    if (adapter.onDeactivate) {
      await adapter.onDeactivate(ctx);
    }

    const installed = this.getInstalled().filter(i => i !== id);
    this.setInstalled(installed);

    console.log(`✅ ${adapter.name} adapter uninstalled`);
  }

  private async applyConfigFile(filePath: string, template: object, merge?: boolean): Promise<void> {
    const fullPath = this.expandPath(filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content = JSON.stringify(template, null, 2);

    if (fs.existsSync(fullPath) && merge) {
      try {
        const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
        const merged = this.deepMerge(existing, template as Record<string, unknown>);
        content = JSON.stringify(merged, null, 2);
        console.log(`  ✓ Merged config: ${fullPath}`);
      } catch {
        console.log(`  ✗ Skipped config (JSON parse failed): ${fullPath}`);
        return;
      }
    } else {
      console.log(`  ✓ Created config: ${fullPath}`);
    }

    fs.writeFileSync(fullPath, content);
  }

  private async removeConfigFile(filePath: string, template: object): Promise<void> {
    const fullPath = this.expandPath(filePath);

    if (fs.existsSync(fullPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Record<string, unknown>;
        const cleaned = this.removeTemplateKeys(existing, template as Record<string, unknown>);
        fs.writeFileSync(fullPath, JSON.stringify(cleaned, null, 2));
        console.log(`  ✓ Removed config: ${fullPath}`);
      } catch {
        console.log(`  ✗ Skipped config: ${fullPath}`);
      }
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