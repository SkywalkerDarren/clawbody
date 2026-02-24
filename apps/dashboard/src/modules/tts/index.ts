import type { IModule } from '@/core/module';
import { TTSCard } from './TTSCard';

export const ttsModule: IModule = {
  meta: {
    id: 'tts',
    name: 'TTS 测试',
    icon: '🔊',
    order: 4,
    category: 'test',
  },
  Component: TTSCard,
};
