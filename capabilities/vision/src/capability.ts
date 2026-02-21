import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type {
  ICapability,
  CapabilityMeta,
  CapabilityStatus,
  CapabilityHealth,
  OperationDescriptor,
  ExecutionContext,
} from '@clawbody/core';
import { logger } from '@clawbody/core';

const execFileAsync = promisify(execFile);

export interface VisionConfig {
  preferredTool?: 'scrot' | 'import' | 'auto';
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  timestamp: string;
}

type Tool = 'scrot' | 'import' | null;

function detectTool(preferred?: string): Tool {
  const tryTool = (name: string): boolean => {
    try {
      execSync(`which ${name}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  if (preferred === 'scrot' && tryTool('scrot')) return 'scrot';
  if (preferred === 'import' && tryTool('import')) return 'import';

  // Auto-detect
  if (tryTool('scrot')) return 'scrot';
  if (tryTool('import')) return 'import';
  return null;
}

/**
 * Vision 能力 - 屏幕截图
 */
export class VisionCapability implements ICapability<VisionConfig> {
  readonly meta: CapabilityMeta = {
    id: 'vision',
    name: 'Screen Vision',
    version: '1.0.0',
    type: 'input',
    description: '屏幕截图能力，支持 scrot 和 ImageMagick',
  };

  private _status: CapabilityStatus = 'initializing';
  private tool: Tool = null;

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: VisionConfig): Promise<void> {
    this.tool = detectTool(config.preferredTool);

    if (this.tool) {
      this._status = 'ready';
      logger.info('vision', `Vision capability ready`, { tool: this.tool });
    } else {
      this._status = 'unavailable';
      logger.warn('vision', 'No screenshot tool found (scrot or ImageMagick import)');
    }
  }

  async healthCheck(): Promise<CapabilityHealth> {
    return {
      status: this._status,
      message: this.tool ? `Using ${this.tool}` : 'No screenshot tool available',
      lastCheck: new Date(),
      details: {
        tool: this.tool ?? 'none',
      },
    };
  }

  getOperations(): OperationDescriptor[] {
    return [
      {
        name: 'screenshot',
        description: '捕获屏幕截图',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        outputSchema: {
          type: 'object',
          properties: {
            base64: { type: 'string', description: 'PNG 图片的 base64 编码' },
            width: { type: 'number' },
            height: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        streaming: false,
      },
    ];
  }

  async execute<TInput, TOutput>(
    operation: string,
    _input: TInput,
    _context?: ExecutionContext
  ): Promise<TOutput> {
    switch (operation) {
      case 'screenshot':
        return this.screenshot() as Promise<TOutput>;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  async shutdown(): Promise<void> {
    this._status = 'unavailable';
    logger.info('vision', 'Vision capability shutdown');
  }

  // === Public methods ===

  isAvailable(): boolean {
    return this.tool !== null;
  }

  async screenshot(): Promise<ScreenshotResult> {
    if (!this.tool) {
      throw new Error('No screenshot tool available. Install scrot: sudo pacman -S scrot');
    }

    const tmpPath = join(tmpdir(), `screenshot-${Date.now()}.png`);
    logger.debug('vision', `Taking screenshot`, { tool: this.tool, path: tmpPath });

    try {
      // Using execFile (not exec) - safe from shell injection
      // Arguments are passed as array, not interpolated into shell command
      if (this.tool === 'scrot') {
        await execFileAsync('scrot', [tmpPath]);
      } else {
        await execFileAsync('import', ['-window', 'root', tmpPath]);
      }

      const data = await readFile(tmpPath);
      const base64 = data.toString('base64');

      // PNG IHDR: width at bytes 16-20, height at bytes 20-24
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const timestamp = new Date().toISOString();

      logger.info('vision', 'Screenshot captured', { width, height, bytes: data.length });

      return { base64, width, height, timestamp };
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }
}
