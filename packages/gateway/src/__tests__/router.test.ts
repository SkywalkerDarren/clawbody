import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CapabilityRouter } from '../router.js';
import { CapabilityRegistry } from '@clawbody/core';
import type { ICapability } from '@clawbody/core';

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
    healthCheck: vi.fn().mockResolvedValue({ status: 'ready', lastCheck: new Date() }),
    getOperations: vi.fn().mockReturnValue([
      {
        name: 'testOp',
        description: 'Test operation',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    ]),
    execute: vi.fn().mockResolvedValue({ result: 'success' }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CapabilityRouter', () => {
  let registry: CapabilityRegistry;
  let router: CapabilityRouter;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    router = new CapabilityRouter(registry);
  });

  describe('route', () => {
    it('should route to capability and execute operation', async () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      const result = await router.route('test-cap', 'testOp', { input: 'data' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'success' });
      expect(capability.execute).toHaveBeenCalledWith('testOp', { input: 'data' }, undefined);
    });

    it('should return error for non-existent capability', async () => {
      const result = await router.route('non-existent', 'testOp', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Capability not found');
    });

    it('should return error for unavailable capability', async () => {
      const capability = createMockCapability('test-cap', { status: 'unavailable' });
      registry.register(capability);

      const result = await router.route('test-cap', 'testOp', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error for non-existent operation', async () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      const result = await router.route('test-cap', 'unknownOp', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Operation not found');
    });

    it('should handle execution errors', async () => {
      const capability = createMockCapability('test-cap', {
        execute: vi.fn().mockRejectedValue(new Error('Execution failed')),
      });
      registry.register(capability);

      const result = await router.route('test-cap', 'testOp', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });

    it('should pass context to capability', async () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      const context = { requestId: 'req-123', timeout: 5000 };
      await router.route('test-cap', 'testOp', {}, context);

      expect(capability.execute).toHaveBeenCalledWith('testOp', {}, context);
    });

    it('should measure duration', async () => {
      const capability = createMockCapability('test-cap');
      registry.register(capability);

      const result = await router.route('test-cap', 'testOp', {});

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRoutes', () => {
    it('should return all available routes', () => {
      const cap1 = createMockCapability('cap1', {
        getOperations: vi.fn().mockReturnValue([
          { name: 'op1', description: 'Op 1', inputSchema: {}, outputSchema: {} },
          { name: 'op2', description: 'Op 2', inputSchema: {}, outputSchema: {} },
        ]),
      });
      const cap2 = createMockCapability('cap2', {
        getOperations: vi.fn().mockReturnValue([
          { name: 'op3', description: 'Op 3', inputSchema: {}, outputSchema: {} },
        ]),
      });
      registry.register(cap1);
      registry.register(cap2);

      const routes = router.getRoutes();

      expect(routes).toHaveLength(3);
      expect(routes).toContainEqual({ capabilityId: 'cap1', operation: 'op1', description: 'Op 1' });
      expect(routes).toContainEqual({ capabilityId: 'cap1', operation: 'op2', description: 'Op 2' });
      expect(routes).toContainEqual({ capabilityId: 'cap2', operation: 'op3', description: 'Op 3' });
    });

    it('should return empty array when no capabilities registered', () => {
      const routes = router.getRoutes();
      expect(routes).toHaveLength(0);
    });
  });
});
