import { getConfig } from '../config';
import { BaseProvider, ProviderStatus, createProvider } from '../providers/base';

export class ProviderManager {
  private providers: Map<string, BaseProvider> = new Map();
  private cooldown: Map<string, number> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  initialize(): void {
    const config = getConfig();
    
    for (const providerConfig of config.providers) {
      const provider = createProvider(providerConfig);
      this.providers.set(providerConfig.name, provider);
    }

    this.startHealthCheck();
  }

  getProvider(name: string): BaseProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): Map<string, BaseProvider> {
    return this.providers;
  }

  getAllStatuses(): ProviderStatus[] {
    const statuses: ProviderStatus[] = [];
    
    for (const [name, provider] of this.providers) {
      statuses.push({ ...provider.status });
    }
    
    return statuses;
  }

  getAvailableProviders(): BaseProvider[] {
    const available: BaseProvider[] = [];
    const now = Date.now();

    for (const [name, provider] of this.providers) {
      const cooldownUntil = this.cooldown.get(name) || 0;
      
      if (provider.status.online && cooldownUntil < now) {
        available.push(provider);
      }
    }

    return available.sort((a, b) => (a.config.priority || 99) - (b.config.priority || 99));
  }

  isProviderAvailable(name: string): boolean {
    const provider = this.providers.get(name);
    if (!provider || !provider.status.online) return false;

    const cooldownUntil = this.cooldown.get(name) || 0;
    return cooldownUntil < Date.now();
  }

  setCooldown(name: string, durationMs: number): void {
    this.cooldown.set(name, Date.now() + durationMs);
  }

  clearCooldown(name: string): void {
    this.cooldown.delete(name);
  }

  clearAllCooldowns(): void {
    this.cooldown.clear();
  }

  getCooldownStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    const now = Date.now();
    for (const [name, until] of this.cooldown) {
      if (until > now) {
        status[name] = Math.ceil((until - now) / 1000);
      }
    }
    return status;
  }

  async runHealthChecks(): Promise<void> {
    for (const [name, provider] of this.providers) {
      try {
        await provider.healthCheck();
      } catch (e: any) {
        console.log(`[health] initial check failed for ${name}: ${e.message}`);
      }
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, provider] of this.providers) {
        await provider.healthCheck();
      }
    }, 30000);

    this.healthCheckInterval.unref();
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  addProvider(provider: BaseProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  removeProvider(name: string): boolean {
    return this.providers.delete(name);
  }

  reload(config: { providers: Array<{ name: string; type: string; api_base_url: string; api_key: string; models: string[]; priority?: number; weight?: number; fallback?: string[]; transformer?: unknown }> }): void {
    this.providers.clear();
    this.cooldown.clear();

    for (const providerConfig of config.providers) {
      const provider = createProvider(providerConfig as any);
      this.providers.set(providerConfig.name, provider);
    }
  }
}

export const providerManager = new ProviderManager();