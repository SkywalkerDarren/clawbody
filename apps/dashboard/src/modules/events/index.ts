import type { IModule } from '@/core/module'
import { EventsCard } from './EventsCard'

export const eventsModule: IModule = {
  meta: {
    id: 'events',
    name: '实时事件',
    icon: '📜',
    order: 10,
    category: 'monitor',
  },
  Component: EventsCard,
}
