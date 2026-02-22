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
  preferredTool?: 'spectacle' | 'scrot' | 'import' | 'auto';
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  timestamp: string;
}

export interface WindowInfo {
  caption: string;
  resourceClass: string;
  resourceName: string;
  desktopFile: string;
  width: number;
  height: number;
  x: number;
  y: number;
  minimized: boolean;
  fullscreen: boolean;
  uuid: string;
}

export interface DesktopInfo {
  activeWindow: WindowInfo | null;
  sessionType: string;
  currentDesktop: number;
  cursor?: { x: number; y: number };
}

type Tool = 'spectacle' | 'scrot' | 'import' | null;

function detectTool(preferred?: string): Tool {
  const tryTool = (name: string): boolean => {
    try {
      execSync(`which ${name}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  const isWayland = process.env['XDG_SESSION_TYPE'] === 'wayland';

  // Preferred tool
  if (preferred && preferred !== 'auto') {
    if (tryTool(preferred)) return preferred as Tool;
  }

  // Auto-detect: prefer spectacle on Wayland
  if (isWayland) {
    if (tryTool('spectacle')) return 'spectacle';
  }

  // X11 tools
  if (tryTool('scrot')) return 'scrot';
  if (tryTool('import')) return 'import';

  // Fallback to spectacle even on X11
  if (tryTool('spectacle')) return 'spectacle';

  return null;
}

/**
 * Vision 能力 - 屏幕截图和窗口信息 (支持 KDE Wayland)
 */
export class VisionCapability implements ICapability<VisionConfig> {
  readonly meta: CapabilityMeta = {
    id: 'vision',
    name: 'Screen Vision',
    version: '1.1.0',
    type: 'input',
    description: '屏幕截图和窗口信息，支持 KDE Wayland',
  };

  private _status: CapabilityStatus = 'initializing';
  private tool: Tool = null;
  private isWayland = false;

  get status(): CapabilityStatus {
    return this._status;
  }

  async initialize(config: VisionConfig): Promise<void> {
    this.isWayland = process.env['XDG_SESSION_TYPE'] === 'wayland';
    this.tool = detectTool(config.preferredTool);

    if (this.tool) {
      this._status = 'ready';
      logger.info('vision', `Vision capability ready`, {
        tool: this.tool,
        wayland: this.isWayland,
      });
    } else {
      this._status = 'unavailable';
      logger.warn('vision', 'No screenshot tool found (spectacle, scrot, or import)');
    }
  }

  async healthCheck(): Promise<CapabilityHealth> {
    return {
      status: this._status,
      message: this.tool ? `Using ${this.tool}` : 'No screenshot tool available',
      lastCheck: new Date(),
      details: {
        tool: this.tool ?? 'none',
        wayland: this.isWayland,
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
          properties: {
            activeWindow: {
              type: 'boolean',
              description: '只截取活动窗口',
            },
          },
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
      {
        name: 'getDesktopInfo',
        description: '获取桌面和活动窗口信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        outputSchema: {
          type: 'object',
          properties: {
            activeWindow: {
              type: 'object',
              properties: {
                caption: { type: 'string' },
                resourceClass: { type: 'string' },
                desktopFile: { type: 'string' },
              },
            },
            sessionType: { type: 'string' },
            currentDesktop: { type: 'number' },
          },
        },
        streaming: false,
      },
    ];
  }

  async execute<TInput, TOutput>(
    operation: string,
    input: TInput,
    _context?: ExecutionContext
  ): Promise<TOutput> {
    switch (operation) {
      case 'screenshot':
        return this.screenshot(input as { activeWindow?: boolean }) as Promise<TOutput>;
      case 'getDesktopInfo':
        return this.getDesktopInfo() as Promise<TOutput>;
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

  async screenshot(options?: { activeWindow?: boolean }): Promise<ScreenshotResult> {
    if (!this.tool) {
      throw new Error('No screenshot tool available. Install spectacle: sudo pacman -S spectacle');
    }

    const tmpPath = join(tmpdir(), `screenshot-${Date.now()}.png`);
    logger.debug('vision', `Taking screenshot`, { tool: this.tool, path: tmpPath });

    try {
      if (this.tool === 'spectacle') {
        // spectacle: -f fullscreen, -a active window, -b background mode, -n no notification, -o output
        const args = options?.activeWindow
          ? ['-a', '-b', '-n', '-o', tmpPath]
          : ['-f', '-b', '-n', '-o', tmpPath];
        await execFileAsync('spectacle', args);
      } else if (this.tool === 'scrot') {
        if (options?.activeWindow) {
          await execFileAsync('scrot', ['-u', tmpPath]);
        } else {
          await execFileAsync('scrot', [tmpPath]);
        }
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

  async getDesktopInfo(): Promise<DesktopInfo> {
    const sessionType = process.env['XDG_SESSION_TYPE'] ?? 'unknown';
    let activeWindow: WindowInfo | null = null;
    let currentDesktop = 1;
    let cursor: { x: number; y: number } | undefined;

    // Try KWin DBus (KDE Plasma)
    try {
      const { stdout } = await execFileAsync('qdbus', [
        'org.kde.KWin',
        '/KWin',
        'queryWindowInfo',
      ]);

      const info = this.parseKWinWindowInfo(stdout);
      if (info) {
        activeWindow = info;
      }

      // Get current desktop
      const { stdout: desktopOut } = await execFileAsync('qdbus', [
        'org.kde.KWin',
        '/KWin',
        'currentDesktop',
      ]);
      currentDesktop = parseInt(desktopOut.trim(), 10) || 1;
    } catch (err) {
      logger.debug('vision', 'KWin DBus not available', err);
    }

    // Get cursor position via KWin scripting
    cursor = await this.getCursorPosition();

    return {
      activeWindow,
      sessionType,
      currentDesktop,
      cursor,
    };
  }

  async getCursorPosition(): Promise<{ x: number; y: number } | undefined> {
    // Try KWin scripting (KDE Wayland)
    try {
      const scriptPath = join(tmpdir(), `kwin-cursor-${Date.now()}.js`);
      const script = 'print(JSON.stringify({x: workspace.cursorPos.x, y: workspace.cursorPos.y}));';
      await import('fs/promises').then((fs) => fs.writeFile(scriptPath, script));

      // Load and run script
      const { stdout: scriptId } = await execFileAsync('qdbus', [
        'org.kde.KWin',
        '/Scripting',
        'loadScript',
        scriptPath,
      ]);

      await execFileAsync('qdbus', ['org.kde.KWin', '/Scripting', 'start']);

      // Small delay for script execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Read from journal (KWin scripts output there)
      const { stdout: journalOut } = await execFileAsync('journalctl', [
        '--user',
        '-u',
        'plasma-kwin_wayland',
        '-n',
        '5',
        '--no-pager',
        '-o',
        'cat',
      ]);

      // Unload script
      await execFileAsync('qdbus', [
        'org.kde.KWin',
        '/Scripting',
        'unloadScript',
        scriptId.trim(),
      ]).catch(() => {});

      // Clean up
      await import('fs/promises').then((fs) => fs.unlink(scriptPath)).catch(() => {});

      // Parse cursor position from journal
      const lines = journalOut.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line && line.startsWith('{') && !line.includes('cursorPos')) {
          try {
            const pos = JSON.parse(line) as { x?: number; y?: number };
            if (typeof pos.x === 'number' && typeof pos.y === 'number') {
              return { x: pos.x, y: pos.y };
            }
          } catch {
            // Not valid JSON
          }
        }
      }
    } catch (err) {
      logger.debug('vision', 'KWin cursor position not available', err);
    }

    // Fallback: try xdotool (X11 only)
    try {
      const { stdout } = await execFileAsync('xdotool', ['getmouselocation']);
      const match = stdout.match(/x:(\d+)\s+y:(\d+)/);
      if (match && match[1] && match[2]) {
        return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
      }
    } catch {
      // xdotool not available or failed
    }

    return undefined;
  }

  private parseKWinWindowInfo(output: string): WindowInfo | null {
    const lines = output.trim().split('\n');
    const info: Record<string, string> = {};

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        info[key] = value;
      }
    }

    if (!info['caption']) return null;

    return {
      caption: info['caption'] ?? '',
      resourceClass: info['resourceClass'] ?? '',
      resourceName: info['resourceName'] ?? '',
      desktopFile: info['desktopFile'] ?? '',
      width: parseInt(info['width'] ?? '0', 10),
      height: parseInt(info['height'] ?? '0', 10),
      x: parseInt(info['x'] ?? '0', 10),
      y: parseInt(info['y'] ?? '0', 10),
      minimized: info['minimized'] === 'true',
      fullscreen: info['fullscreen'] === 'true',
      uuid: info['uuid'] ?? '',
    };
  }
}
