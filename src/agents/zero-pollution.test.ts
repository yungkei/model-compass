import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AdapterManager } from './manager';
import { AgentAdapter, createAdapterContext } from './types';

describe('Zero-pollution adapter installation', () => {
  let manager: AdapterManager;
  let testHome: string;
  let originalHome: string | undefined;
  let originalMcHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    originalMcHome = process.env.MC_HOME;

    testHome = path.join(process.cwd(), '.test-model-compass-zero');
    if (!fs.existsSync(testHome)) {
      fs.mkdirSync(testHome, { recursive: true });
    }

    process.env.HOME = testHome;
    process.env.USERPROFILE = testHome;
    process.env.MC_HOME = path.join(testHome, '.model-compass');

    manager = new AdapterManager();
  });

  afterEach(() => {
    if (fs.existsSync(testHome)) {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalHome;
    if (originalMcHome === undefined) {
      delete process.env.MC_HOME;
    } else {
      process.env.MC_HOME = originalMcHome;
    }
  });

  it('should NOT write the application config file by default', async () => {
    const claudeSettings = path.join(testHome, '.claude', 'settings.json');

    await manager.install('claude');

    expect(fs.existsSync(claudeSettings)).toBe(false);
  });

  it('should store an MC-owned profile instead', async () => {
    await manager.install('claude');

    const profile = manager.getProfile('claude');
    expect(profile).toBeDefined();
    expect(profile?.globalApplied).toBe(false);
    expect(profile?.env?.ANTHROPIC_BASE_URL).toBeDefined();
  });

  it('should write the application config file with --global opt-in', async () => {
    const cursorConfig = path.join(testHome, '.cursor', 'mcp.json');

    await manager.install('cursor', undefined, undefined, { global: true });

    expect(fs.existsSync(cursorConfig)).toBe(true);
    const profile = manager.getProfile('cursor');
    expect(profile?.globalApplied).toBe(true);
  });

  it('should back up the original file before overwriting', async () => {
    const dir = path.join(testHome, '.cursor');
    fs.mkdirSync(dir, { recursive: true });
    const cursorConfig = path.join(dir, 'mcp.json');
    fs.writeFileSync(cursorConfig, JSON.stringify({ existing: true }, null, 2));

    await manager.install('cursor', undefined, undefined, { global: true });

    expect(fs.existsSync(`${cursorConfig}.mc-backup`)).toBe(true);
    const merged = JSON.parse(fs.readFileSync(cursorConfig, 'utf-8'));
    expect(merged.existing).toBe(true);
    expect(merged['model-compass']).toBeDefined();
  });

  it('should restore the original file on uninstall', async () => {
    const dir = path.join(testHome, '.cursor');
    fs.mkdirSync(dir, { recursive: true });
    const cursorConfig = path.join(dir, 'mcp.json');
    fs.writeFileSync(cursorConfig, JSON.stringify({ existing: true }, null, 2));

    await manager.install('cursor', undefined, undefined, { global: true });
    await manager.uninstall('cursor');

    const restored = JSON.parse(fs.readFileSync(cursorConfig, 'utf-8'));
    expect(restored).toEqual({ existing: true });
    expect(fs.existsSync(`${cursorConfig}.mc-backup`)).toBe(false);
  });

  it('should not touch anything on uninstall when nothing was written globally', async () => {
    const claudeSettings = path.join(testHome, '.claude', 'settings.json');

    await manager.install('claude');
    await manager.uninstall('claude');

    expect(fs.existsSync(claudeSettings)).toBe(false);
    expect(manager.isInstalled('claude')).toBe(false);
  });

  it('should not merge into an existing config file when merge is disabled', async () => {
    const dir = path.join(testHome, '.custom');
    fs.mkdirSync(dir, { recursive: true });
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ existing: true }, null, 2));

    const adapter: AgentAdapter = {
      id: 'custom-agent',
      name: 'Custom Agent',
      type: 'custom',
      description: 'test',
      version: '1.0.0',
      configFiles: [
        {
          path: configPath,
          template: { added: true },
          merge: false
        }
      ]
    };

    await manager.install('custom-agent', adapter, undefined, { global: true });

    const written = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(written.added).toBe(true);
    expect(written.existing).toBeUndefined();
  });
});
