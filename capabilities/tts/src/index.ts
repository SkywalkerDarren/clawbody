// @clawbody/tts
// TTS 能力：多提供商语音合成

export * from './capability.js';
export * from './providers/index.js';

// Factory helper
import { TTSCapability, type ProviderConfig } from './capability.js';
import { QwenTTSProvider, type QwenConfig } from './providers/qwen.js';
import { EdgeTTSProvider, type EdgeConfig } from './providers/edge.js';
import type { ITTSProvider } from './providers/interface.js';

/**
 * 创建 TTS 能力实例，包含默认提供商工厂
 */
export function createTTSCapability(): TTSCapability {
  const factories = new Map<string, (config: ProviderConfig) => ITTSProvider>();

  factories.set('qwen', (config) => {
    return new QwenTTSProvider({
      baseUrl: (config['baseUrl'] as string) ?? 'http://localhost:8765',
      timeout: config['timeout'] as number | undefined,
    });
  });

  factories.set('edge', (config) => {
    return new EdgeTTSProvider({
      defaultVoice: config['defaultVoice'] as string | undefined,
    });
  });

  return new TTSCapability(factories);
}
