import type { IModule } from '@/core/module';
import { VisionCard } from './VisionCard';

export const visionModule: IModule = {
  meta: {
    id: 'vision',
    name: 'Vision 测试',
    icon: '👁️',
    order: 7,
    category: 'test',
  },
  Component: VisionCard,
};
