import type { ICapability, CapabilityMeta, CapabilityHealth } from './interface.js';
import { logger } from '../logger/logger.js';

/**
 * 能力注册表 - 管理所有已注册的能力
 */
export class CapabilityRegistry {
  private capabilities = new Map<string, ICapability>();
  private healthCache = new Map<string, CapabilityHealth>();

  /**
   * 注册能力
   */
  register(capability: ICapability): void {
    const { id, name, version } = capability.meta;

    if (this.capabilities.has(id)) {
      throw new Error(`Capability already registered: ${id}`);
    }

    this.capabilities.set(id, capability);
    logger.info('registry', `Registered capability: ${name} v${version}`, { id });
  }

  /**
   * 注销能力
   */
  unregister(id: string): boolean {
    const capability = this.capabilities.get(id);
    if (!capability) {
      return false;
    }

    this.capabilities.delete(id);
    this.healthCache.delete(id);
    logger.info('registry', `Unregistered capability: ${id}`);
    return true;
  }

  /**
   * 获取能力
   */
  get(id: string): ICapability | undefined {
    return this.capabilities.get(id);
  }

  /**
   * 检查能力是否存在
   */
  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  /**
   * 获取所有能力
   */
  getAll(): ICapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * 获取所有能力 ID
   */
  getAllIds(): string[] {
    return Array.from(this.capabilities.keys());
  }

  /**
   * 获取所有能力元数据
   */
  getAllMeta(): CapabilityMeta[] {
    return this.getAll().map((c) => c.meta);
  }

  /**
   * 初始化所有能力
   */
  async initializeAll(configs: Record<string, unknown>): Promise<Map<string, Error | null>> {
    const results = new Map<string, Error | null>();

    const initPromises = this.getAll().map(async (capability) => {
      const id = capability.meta.id;
      try {
        const config = configs[id] ?? {};
        await capability.initialize(config);
        logger.info('registry', `Initialized: ${id}`);
        results.set(id, null);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('registry', `Failed to initialize: ${id}`, error);
        results.set(id, error);
      }
    });

    await Promise.all(initPromises);

    const failed = Array.from(results.values()).filter((e) => e !== null);
    if (failed.length > 0) {
      logger.warn('registry', `${failed.length} capabilities failed to initialize`);
    }

    return results;
  }

  /**
   * 健康检查所有能力
   */
  async healthCheckAll(): Promise<Map<string, CapabilityHealth>> {
    const results = new Map<string, CapabilityHealth>();

    await Promise.all(
      this.getAll().map(async (capability) => {
        const id = capability.meta.id;
        try {
          const health = await capability.healthCheck();
          results.set(id, health);
          this.healthCache.set(id, health);
        } catch (err) {
          const health: CapabilityHealth = {
            status: 'error',
            message: err instanceof Error ? err.message : 'Health check failed',
            lastCheck: new Date(),
          };
          results.set(id, health);
          this.healthCache.set(id, health);
        }
      })
    );

    return results;
  }

  /**
   * 获取缓存的健康状态
   */
  getCachedHealth(id: string): CapabilityHealth | undefined {
    return this.healthCache.get(id);
  }

  /**
   * 关闭所有能力
   */
  async shutdownAll(): Promise<void> {
    await Promise.all(
      this.getAll().map(async (capability) => {
        const id = capability.meta.id;
        try {
          await capability.shutdown();
          logger.info('registry', `Shutdown: ${id}`);
        } catch (err) {
          logger.error('registry', `Shutdown failed: ${id}`, err);
        }
      })
    );

    this.capabilities.clear();
    this.healthCache.clear();
  }

  /**
   * 获取能力数量
   */
  get size(): number {
    return this.capabilities.size;
  }
}
