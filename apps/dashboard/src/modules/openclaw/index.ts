import type { IModule } from '@/core/module'
import { OpenClawCard } from './OpenClawCard'

export const openclawModule: IModule = {
  meta: {
    id: 'openclaw',
    name: 'OpenClaw 连接',
    icon: '🧠',
    order: 5,
    category: 'monitor',
  },
  Component: OpenClawCard,
}
