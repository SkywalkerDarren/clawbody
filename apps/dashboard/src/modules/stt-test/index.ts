import type { IModule } from '@/core/module'
import { STTTestCard } from './STTTestCard'

export const sttTestModule: IModule = {
  meta: {
    id: 'stt-test',
    name: 'STT 测试',
    icon: '👂',
    order: 5,
    category: 'test',
  },
  Component: STTTestCard,
}
