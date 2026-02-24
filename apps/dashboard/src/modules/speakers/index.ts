import type { IModule } from '@/core/module'
import { SpeakersCard } from './SpeakersCard'

export const speakersModule: IModule = {
  meta: {
    id: 'speakers',
    name: '说话人管理',
    icon: '👤',
    order: 3,
    category: 'control',
  },
  Component: SpeakersCard,
}
