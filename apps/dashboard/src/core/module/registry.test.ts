import { describe, it, expect } from 'vitest'
import { useModuleRegistry } from '@/core/module'
import type { IModule } from '@/core/module'

describe('ModuleRegistry', () => {
  it('registers and retrieves modules', () => {
    const { register, get, getAll } = useModuleRegistry.getState()

    const testModule: IModule = {
      meta: {
        id: 'test-module',
        name: 'Test Module',
        icon: '🧪',
        order: 1,
      },
      Component: () => null,
    }

    register(testModule)

    expect(get('test-module')).toBe(testModule)
    expect(getAll()).toContain(testModule)
  })

  it('returns modules sorted by order', () => {
    const { register, getAll } = useModuleRegistry.getState()

    const moduleA: IModule = {
      meta: { id: 'module-a', name: 'A', icon: 'A', order: 10 },
      Component: () => null,
    }
    const moduleB: IModule = {
      meta: { id: 'module-b', name: 'B', icon: 'B', order: 5 },
      Component: () => null,
    }

    register(moduleA)
    register(moduleB)

    const all = getAll()
    const aIndex = all.findIndex((m) => m.meta.id === 'module-a')
    const bIndex = all.findIndex((m) => m.meta.id === 'module-b')

    expect(bIndex).toBeLessThan(aIndex)
  })
})
