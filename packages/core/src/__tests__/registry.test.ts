import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRegistry } from '../capability/registry.js';
import type { ICapability, CapabilityMeta, CapabilityHealth, OperationDescriptor } from '../capability/interface.js';

// Mock capability for testing
function createMockCapability(id: string, overrides?: Partial<ICapability>): ICapability {
  return {
    meta: {
      id,
      name: `Test ${id}`,
      version: '1.0.0',
      type: 'output',
    },
    status: 'ready',
    initialize: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({
      status: 'ready',
      lastCheck: new Date(),
    }),
    getOperations: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue({}),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe('register', () => {
    it('should register a capability', () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      expect(registry.has('test-cap')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw when registering duplicate capability', () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      expect(() => registry.register(capability)).toThrow('Capability already registered: test-cap');
    });
  });

  describe('unregister', () => {
    it('should unregister an existing capability', () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      const result = registry.unregister('test-cap');

      expect(result).toBe(true);
      expect(registry.has('test-cap')).toBe(false);
    });

    it('should return false when unregistering non-existent capability', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should return registered capability', () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      expect(registry.get('test-cap')).toBe(capability);
    });

    it('should return undefined for non-existent capability', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered capabilities', () => {
      const cap1 = createMockCapability('cap1');
      const cap2 = createMockCapability('cap2');
      registry.register(cap1);
      registry.register(cap2);

      const all = registry.getAll();

      expect(all).toHaveLength(2);
      expect(all).toContain(cap1);
      expect(all).toContain(cap2);
    });
  });

  describe('getAllMeta', () => {
    it('should return metadata for all capabilities', () => {
      const cap1 = createMockCapability('cap1');
      const cap2 = createMockCapability('cap2');
      registry.register(cap1);
      registry.register(cap2);

      const metas = registry.getAllMeta();

      expect(metas).toHaveLength(2);
      expect(metas.map((m) => m.id)).toContain('cap1');
      expect(metas.map((m) => m.id)).toContain('cap2');
    });
  });

  describe('initializeAll', () => {
    it('should initialize all capabilities with configs', async () => {
      const cap1 = createMockCapability('cap1');
      const cap2 = createMockCapability('cap2');
      registry.register(cap1);
      registry.register(cap2);

      const configs = {
        cap1: { setting: 'value1' },
        cap2: { setting: 'value2' },
      };

      const results = await registry.initializeAll(configs);

      expect(cap1.initialize).toHaveBeenCalledWith({ setting: 'value1' });
      expect(cap2.initialize).toHaveBeenCalledWith({ setting: 'value2' });
      expect(results.get('cap1')).toBeNull();
      expect(results.get('cap2')).toBeNull();
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Init failed');
      const cap1 = createMockCapability('cap1', {
        initialize: vi.fn().mockRejectedValue(error),
      });
      registry.register(cap1);

      const results = await registry.initializeAll({});

      expect(results.get('cap1')).toBe(error);
    });
  });

  describe('healthCheckAll', () => {
    it('should check health of all capabilities', async () => {
      const cap1 = createMockCapability('cap1');
      const cap2 = createMockCapability('cap2');
      registry.register(cap1);
      registry.register(cap2);

      const results = await registry.healthCheckAll();

      expect(results.size).toBe(2);
      expect(results.get('cap1')?.status).toBe('ready');
      expect(results.get('cap2')?.status).toBe('ready');
    });

    it('should handle health check errors', async () => {
      const cap1 = createMockCapability('cap1', {
        healthCheck: vi.fn().mockRejectedValue(new Error('Health check failed')),
      });
      registry.register(cap1);

      const results = await registry.healthCheckAll();

      expect(results.get('cap1')?.status).toBe('error');
      expect(results.get('cap1')?.message).toBe('Health check failed');
    });
  });

  describe('shutdownAll', () => {
    it('should shutdown all capabilities', async () => {
      const cap1 = createMockCapability('cap1');
      const cap2 = createMockCapability('cap2');
      registry.register(cap1);
      registry.register(cap2);

      await registry.shutdownAll();

      expect(cap1.shutdown).toHaveBeenCalled();
      expect(cap2.shutdown).toHaveBeenCalled();
      expect(registry.size).toBe(0);
    });

    it('should handle shutdown errors gracefully', async () => {
      const cap1 = createMockCapability('cap1', {
        shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
      });
      registry.register(cap1);

      // Should not throw
      await expect(registry.shutdownAll()).resolves.toBeUndefined();
      expect(registry.size).toBe(0);
    });
  });
});
