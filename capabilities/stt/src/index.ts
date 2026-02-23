// @clawbody/stt
// STT 能力：多提供商语音识别

export * from './capability.js';
export * from './providers/index.js';

// Factory helper
import { STTCapability, type ProviderConfig } from './capability.js';
import { QwenSTTProvider } from './providers/qwen.js';
import type { ISTTProvider } from './providers/interface.js';

/**
 * 创建 STT 能力实例，包含默认提供商工厂
 */
export function createSTTCapability(): STTCapability {
  const factories = new Map<string, (config: ProviderConfig) => ISTTProvider>();

  factories.set('qwen', (config) => {
    return new QwenSTTProvider({
      baseUrl: (config['baseUrl'] as string) ?? 'http://localhost:8766',
      timeout: config['timeout'] as number | undefined,
    });
  });

  return new STTCapability(factories);
}
