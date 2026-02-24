// Module system types - inspired by backend ICapability pattern

export interface ModuleMeta {
  id: string
  name: string
  icon: string
  description?: string
  order?: number
  category?: 'control' | 'monitor' | 'test' | 'settings'
}

export interface IModule {
  readonly meta: ModuleMeta
  Component: React.ComponentType
  initialize?(): Promise<void>
  cleanup?(): void
}
