import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisionCapability } from '../capability.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFile: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('VisionCapability', () => {
  let capability: VisionCapability;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock: scrot available
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === 'which scrot') return Buffer.from('/usr/bin/scrot');
      throw new Error('not found');
    });

    capability = new VisionCapability();
  });

  describe('meta', () => {
    it('should have correct metadata', () => {
      expect(capability.meta.id).toBe('vision');
      expect(capability.meta.name).toBe('Screen Vision');
      expect(capability.meta.type).toBe('input');
    });
  });

  describe('initialize', () => {
    it('should set status to ready when tool is available', async () => {
      await capability.initialize({});
      expect(capability.status).toBe('ready');
      expect(capability.isAvailable()).toBe(true);
    });

    it('should set status to unavailable when no tool found', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });

      const cap = new VisionCapability();
      await cap.initialize({});

      expect(cap.status).toBe('unavailable');
      expect(cap.isAvailable()).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return status with tool info', async () => {
      await capability.initialize({});
      const health = await capability.healthCheck();

      expect(health.status).toBe('ready');
      expect(health.details?.['tool']).toBe('scrot');
    });
  });

  describe('getOperations', () => {
    it('should return screenshot and getDesktopInfo operations', () => {
      const ops = capability.getOperations();
      expect(ops).toHaveLength(2);
      expect(ops[0]?.name).toBe('screenshot');
      expect(ops[1]?.name).toBe('getDesktopInfo');
    });
  });

  describe('execute', () => {
    it('should throw for unknown operation', async () => {
      await capability.initialize({});
      await expect(capability.execute('unknown', {})).rejects.toThrow('Unknown operation: unknown');
    });
  });

  describe('shutdown', () => {
    it('should set status to unavailable', async () => {
      await capability.initialize({});
      await capability.shutdown();
      expect(capability.status).toBe('unavailable');
    });
  });
});
