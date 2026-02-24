import type { IModule } from '@/core/module'
import { ActionsCard } from './ActionsCard'

export const actionsModule: IModule = {
  meta: {
    id: 'actions',
    name: '快捷操作',
    icon: '⚡',
    order: 6,
    category: 'control',
  },
  Component: ActionsCard,
}
