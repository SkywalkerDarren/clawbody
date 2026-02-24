import type { IModule } from '@/core/module';
import { ServicesCard } from './ServicesCard';

export const servicesModule: IModule = {
  meta: {
    id: 'services',
    name: '服务状态',
    icon: '📊',
    order: 2,
    category: 'monitor',
  },
  Component: ServicesCard,
};
