import type { IModule } from '@/core/module'
import { PipelineCard } from './PipelineCard'

export const pipelineModule: IModule = {
  meta: {
    id: 'pipeline',
    name: 'Pipeline 控制',
    icon: '🎙️',
    description: 'VAD → SV → STT → OpenClaw 链路控制',
    order: 1,
    category: 'control',
  },
  Component: PipelineCard,
}
