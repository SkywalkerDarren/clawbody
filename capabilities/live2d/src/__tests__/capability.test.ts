import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Live2DCapability } from '../capability.js';

describe('Live2DCapability', () => {
  let capability: Live2DCapability;

  beforeEach(async () => {
    capability = new Live2DCapability();
    await capability.initialize({});
  });

  describe('meta', () => {
    it('should have correct metadata', () => {
      expect(capability.meta.id).toBe('live2d');
      expect(capability.meta.name).toBe('Live2D Desktop Companion');
      expect(capability.meta.type).toBe('output');
    });
  });

  describe('initialize', () => {
    it('should set status to ready', async () => {
      const cap = new Live2DCapability();
      await cap.initialize({});
      expect(cap.status).toBe('ready');
    });
  });

  describe('healthCheck', () => {
    it('should return status with model info', async () => {
      const health = await capability.healthCheck();
      expect(health.status).toBe('ready');
      expect(health.details?.['modelLoaded']).toBe('false');
    });

    it('should reflect model loaded state', async () => {
      capability.setModelLoaded(true, {
        expressions: ['f01', 'f02'],
        motions: { idle: 3 },
      });

      const health = await capability.healthCheck();
      expect(health.details?.['modelLoaded']).toBe('true');
      expect(health.details?.['expressions']).toBe('f01, f02');
    });
  });

  describe('getOperations', () => {
    it('should return expression, motion, show, and getModelInfo operations', () => {
      const ops = capability.getOperations();
      expect(ops).toHaveLength(4);
      expect(ops.map((o) => o.name)).toContain('expression');
      expect(ops.map((o) => o.name)).toContain('motion');
      expect(ops.map((o) => o.name)).toContain('show');
      expect(ops.map((o) => o.name)).toContain('getModelInfo');
    });
  });

  describe('execute', () => {
    describe('expression', () => {
      it('should emit command event', async () => {
        const handler = vi.fn();
        capability.subscribe(handler);

        const result = await capability.execute<{ name: string }, { success: boolean }>(
          'expression',
          { name: 'f01' }
        );

        expect(result.success).toBe(true);
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            capabilityId: 'live2d',
            eventType: 'command',
            data: { type: 'expression', data: { name: 'f01' } },
          })
        );
      });
    });

    describe('motion', () => {
      it('should emit command event', async () => {
        const handler = vi.fn();
        capability.subscribe(handler);

        const result = await capability.execute<{ group: string; index?: number }, { success: boolean }>(
          'motion',
          { group: 'idle', index: 0 }
        );

        expect(result.success).toBe(true);
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: 'command',
            data: { type: 'motion', data: { group: 'idle', index: 0 } },
          })
        );
      });

      it('should work without index', async () => {
        const handler = vi.fn();
        capability.subscribe(handler);

        await capability.execute('motion', { group: 'tap_body' });

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { type: 'motion', data: { group: 'tap_body' } },
          })
        );
      });
    });

    describe('show', () => {
      it('should emit command event for text', async () => {
        const handler = vi.fn();
        capability.subscribe(handler);

        const result = await capability.execute<{ type: string; content: string }, { success: boolean }>(
          'show',
          { type: 'text', content: 'Hello!' }
        );

        expect(result.success).toBe(true);
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { type: 'show', data: { type: 'text', content: 'Hello!' } },
          })
        );
      });

      it('should emit command event for image', async () => {
        const handler = vi.fn();
        capability.subscribe(handler);

        await capability.execute('show', { type: 'image', content: 'base64data' });

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { type: 'show', data: { type: 'image', content: 'base64data' } },
          })
        );
      });
    });

    describe('getModelInfo', () => {
      it('should return model info when not loaded', async () => {
        const result = await capability.execute<
          Record<string, never>,
          { loaded: boolean; expressions: string[]; motions: Record<string, number> }
        >('getModelInfo', {});

        expect(result.loaded).toBe(false);
        expect(result.expressions).toEqual([]);
        expect(result.motions).toEqual({});
      });

      it('should return model info when loaded', async () => {
        capability.setModelLoaded(true, {
          expressions: ['f01', 'f02', 'f03'],
          motions: { idle: 3, tap_body: 2 },
        });

        const result = await capability.execute<
          Record<string, never>,
          { loaded: boolean; expressions: string[]; motions: Record<string, number> }
        >('getModelInfo', {});

        expect(result.loaded).toBe(true);
        expect(result.expressions).toEqual(['f01', 'f02', 'f03']);
        expect(result.motions).toEqual({ idle: 3, tap_body: 2 });
      });
    });

    it('should throw for unknown operation', async () => {
      await expect(capability.execute('unknown', {})).rejects.toThrow('Unknown operation: unknown');
    });
  });

  describe('setModelLoaded', () => {
    it('should update model loaded state', () => {
      expect(capability.isModelLoaded()).toBe(false);

      capability.setModelLoaded(true, {
        expressions: ['f01'],
        motions: { idle: 1 },
      });

      expect(capability.isModelLoaded()).toBe(true);
    });

    it('should clear model info when unloaded', () => {
      capability.setModelLoaded(true, {
        expressions: ['f01'],
        motions: { idle: 1 },
      });

      capability.setModelLoaded(false);

      expect(capability.isModelLoaded()).toBe(false);
      expect(capability.getModelInfo()).toEqual({ expressions: [], motions: {} });
    });
  });

  describe('subscribe', () => {
    it('should emit events on model state change', () => {
      const handler = vi.fn();
      capability.subscribe(handler);

      capability.setModelLoaded(true, {
        expressions: ['f01'],
        motions: { idle: 1 },
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilityId: 'live2d',
          eventType: 'modelStateChanged',
          data: expect.objectContaining({ loaded: true }),
        })
      );
    });

    it('should allow unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = capability.subscribe(handler);

      unsubscribe();
      capability.setModelLoaded(true, { expressions: [], motions: {} });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should set status to unavailable and clear state', async () => {
      capability.setModelLoaded(true, { expressions: ['f01'], motions: {} });

      await capability.shutdown();

      expect(capability.status).toBe('unavailable');
      expect(capability.isModelLoaded()).toBe(false);
    });
  });
});
