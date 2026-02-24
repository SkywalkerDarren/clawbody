import type { IModule } from '@/core/module';
import { Live2DCard } from './Live2DCard';

export const live2dModule: IModule = {
  meta: {
    id: 'live2d',
    name: 'Live2D 控制',
    icon: '🎭',
    order: 6,
    category: 'test',
  },
  Component: Live2DCard,
};
