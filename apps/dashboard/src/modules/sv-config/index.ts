import type { IModule } from '@/core/module';
import { SVConfigCard } from './SVConfigCard';

export const svConfigModule: IModule = {
  meta: {
    id: 'sv-config',
    name: 'SV 配置',
    icon: '🔐',
    order: 8,
    category: 'settings',
  },
  Component: SVConfigCard,
};
