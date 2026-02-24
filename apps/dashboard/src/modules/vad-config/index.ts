import type { IModule } from '@/core/module';
import { VADConfigCard } from './VADConfigCard';

export const vadConfigModule: IModule = {
  meta: {
    id: 'vad-config',
    name: 'VAD 配置',
    icon: '🎚️',
    order: 7,
    category: 'settings',
  },
  Component: VADConfigCard,
};
