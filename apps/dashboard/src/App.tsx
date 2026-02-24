import { useEffect } from 'react'
import { useModuleRegistry } from '@/core/module'
import { useGatewayStore } from '@/core/store'
import { useSSE } from '@/core/useSSE'
import { apiGet } from '@/core/api'
import { modules } from '@/modules'
import { Badge } from '@/components/ui/badge'

function App() {
  const { register, getAll } = useModuleRegistry()
  const { sseConnected, diagnostics } = useGatewayStore()

  // Connect SSE
  useSSE('/api/events')

  // Fetch initial pipeline status
  useEffect(() => {
    apiGet<{ enabled: boolean }>('/pipeline').then((result) => {
      if (result.success && result.data) {
        useGatewayStore.getState().setPipelineEnabled(result.data.enabled)
      }
    })
  }, [])

  // Register all modules
  useEffect(() => {
    for (const module of modules) {
      register(module)
      module.initialize?.()
    }
  }, [register])

  const registeredModules = getAll()
  const controlModules = registeredModules.filter(
    (m) => m.meta.category === 'control'
  )
  const monitorModules = registeredModules.filter(
    (m) => m.meta.category === 'monitor' && m.meta.id !== 'events'
  )
  const testModules = registeredModules.filter(
    (m) => m.meta.category === 'test'
  )
  const settingsModules = registeredModules.filter(
    (m) => m.meta.category === 'settings'
  )
  const eventsModule = registeredModules.find((m) => m.meta.id === 'events')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">ClawBody Dashboard</h1>
              <p className="text-gray-400 text-sm mt-1">
                Gateway: http://localhost:4000
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={sseConnected ? 'default' : 'destructive'}>
                {sseConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              {diagnostics && (
                <span className="text-xs text-gray-500">
                  Uptime: {diagnostics.gateway.uptime}s
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Control + Monitor modules - 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {controlModules.map((module) => (
            <module.Component key={module.meta.id} />
          ))}
          {monitorModules.map((module) => (
            <module.Component key={module.meta.id} />
          ))}
        </div>

        {/* Test modules - 2 columns */}
        {testModules.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {testModules.map((module) => (
              <module.Component key={module.meta.id} />
            ))}
          </div>
        )}

        {/* Settings modules - 2 columns */}
        {settingsModules.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {settingsModules.map((module) => (
              <module.Component key={module.meta.id} />
            ))}
          </div>
        )}

        {/* Events - full width */}
        {eventsModule && <eventsModule.Component />}

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-500 text-xs">
          ClawBody Gateway Dashboard
        </footer>
      </div>
    </div>
  )
}

export default App
