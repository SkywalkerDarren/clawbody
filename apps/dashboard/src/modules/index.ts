import type { IModule } from '@/core/module'

import { pipelineModule } from './pipeline'
import { servicesModule } from './services'
import { speakersModule } from './speakers'
import { ttsModule } from './tts'
import { openclawModule } from './openclaw'
import { actionsModule } from './actions'
import { vadConfigModule } from './vad-config'
import { svConfigModule } from './sv-config'
import { eventsModule } from './events'

export const modules: IModule[] = [
  pipelineModule,
  servicesModule,
  speakersModule,
  ttsModule,
  openclawModule,
  actionsModule,
  vadConfigModule,
  svConfigModule,
  eventsModule,
]

export function getModulesByCategory() {
  const grouped: Record<string, IModule[]> = {}

  for (const module of modules) {
    const category = module.meta.category ?? 'other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(module)
  }

  return grouped
}
