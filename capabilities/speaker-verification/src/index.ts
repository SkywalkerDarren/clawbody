// @clawbody/speaker-verification
// Speaker Verification 能力：声纹验证

export * from './capability.js';
export * from './providers/index.js';

// Factory helper
import { SpeakerVerificationCapability, type ProviderConfig } from './capability.js';
import { WeSpeakerProvider } from './providers/wespeaker.js';
import type { ISpeakerVerificationProvider } from './providers/interface.js';

/**
 * 创建 Speaker Verification 能力实例，包含默认提供商工厂
 */
export function createSpeakerVerificationCapability(): SpeakerVerificationCapability {
  const factories = new Map<string, (config: ProviderConfig) => ISpeakerVerificationProvider>();

  factories.set('wespeaker', (config) => {
    return new WeSpeakerProvider({
      baseUrl: (config['baseUrl'] as string) ?? 'http://localhost:8768',
      timeout: config['timeout'] as number | undefined,
    });
  });

  return new SpeakerVerificationCapability(factories);
}
