// @clawbody/vad
// VAD 能力：语音活动检测

export * from './capability.js';
export * from './providers/index.js';

// Factory helper
import { VADCapability, type ProviderConfig } from './capability.js';
import { SileroVADProvider } from './providers/silero.js';
import type { IVADProvider } from './providers/interface.js';

/**
 * 创建 VAD 能力实例，包含默认提供商工厂
 */
export function createVADCapability(): VADCapability {
  const factories = new Map<string, (config: ProviderConfig) => IVADProvider>();

  factories.set('silero', (config) => {
    return new SileroVADProvider({
      baseUrl: (config['baseUrl'] as string) ?? 'http://localhost:8767',
      timeout: config['timeout'] as number | undefined,
    });
  });

  return new VADCapability(factories);
}
