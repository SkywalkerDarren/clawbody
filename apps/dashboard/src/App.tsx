import { useEffect } from 'react';
import { useModuleRegistry } from '@/core/module';
import { useGatewayStore } from '@/core/store';
import { useSSE } from '@/core/useSSE';
import { usePipelineStatus } from '@/core/hooks';
import { modules } from '@/modules';

function App() {
  const { register, getAll } = useModuleRegistry();
  const { sseConnected } = useGatewayStore();
  const { data: pipelineStatus } = usePipelineStatus();

  // Connect SSE
  useSSE('/api/events');

  // Register all modules
  useEffect(() => {
    for (const module of modules) {
      register(module);
      module.initialize?.();
    }
  }, [register]);

  const registeredModules = getAll();
  const controlModules = registeredModules.filter((m) => m.meta.category === 'control');
  const monitorModules = registeredModules.filter(
    (m) => m.meta.category === 'monitor' && m.meta.id !== 'events'
  );
  const testModules = registeredModules.filter((m) => m.meta.category === 'test');
  const settingsModules = registeredModules.filter((m) => m.meta.category === 'settings');
  const eventsModule = registeredModules.find((m) => m.meta.id === 'events');

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
                ClawBody Dashboard
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Gateway: localhost:4000
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span
                  data-testid="sse-indicator"
                  className={`h-2 w-2 rounded-full ${
                    sseConnected ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-xs text-zinc-500">
                  {sseConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {pipelineStatus && (
                <div
                  data-testid="pipeline-indicator"
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pipelineStatus.enabled
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Pipeline {pipelineStatus.enabled ? 'ON' : 'OFF'}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Control + Monitor modules */}
        <section className="mb-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {controlModules.map((module) => (
              <module.Component key={module.meta.id} />
            ))}
            {monitorModules.map((module) => (
              <module.Component key={module.meta.id} />
            ))}
          </div>
        </section>

        {/* Test modules */}
        {testModules.length > 0 && (
          <section className="mb-8">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {testModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
          </section>
        )}

        {/* Settings modules */}
        {settingsModules.length > 0 && (
          <section className="mb-8">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {settingsModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
          </section>
        )}

        {/* Events - full width */}
        {eventsModule && (
          <section className="mb-8">
            <eventsModule.Component />
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          ClawBody Gateway Dashboard
        </footer>
      </div>
    </div>
  );
}

export default App;
