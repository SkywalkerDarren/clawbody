import { useEffect } from 'react';
import { Circle } from 'lucide-react';
import { useModuleRegistry } from '@/core/module';
import { useGatewayStore } from '@/core/store';
import { useSSE } from '@/core/useSSE';
import { usePipelineStatus } from '@/core/hooks';
import { modules } from '@/modules';

function App() {
  const { register, getAll } = useModuleRegistry();
  const { sseConnected } = useGatewayStore();
  const { data: pipelineStatus } = usePipelineStatus();

  useSSE('/api/events');

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
    <div className="min-h-[100dvh] bg-background font-sans">
      <div className="mx-auto max-w-[1120px] px-6 py-6">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-sm font-semibold text-foreground tracking-tight">
              ClawBody
            </h1>
            <span className="text-[11px] text-foreground-3 font-mono">
              localhost:4000
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Circle
                data-testid="sse-indicator"
                className={`size-2 fill-current ${
                  sseConnected ? 'text-status-ok' : 'text-status-error'
                }`}
              />
              <span className="text-[11px] text-foreground-3">
                {sseConnected ? 'SSE' : 'Offline'}
              </span>
            </div>
            {pipelineStatus && (
              <span
                data-testid="pipeline-indicator"
                className={`text-[11px] font-medium ${
                  pipelineStatus.enabled ? 'text-status-ok' : 'text-foreground-3'
                }`}
              >
                Pipeline {pipelineStatus.enabled ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
        </header>

        {/* Control + Monitor */}
        <section className="mb-6">
          <SectionLabel>系统</SectionLabel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
            <div className="space-y-3">
              {controlModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
            <div className="space-y-3">
              {monitorModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
          </div>
        </section>

        {/* Test modules */}
        {testModules.length > 0 && (
          <section className="mb-6">
            <SectionLabel>测试</SectionLabel>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {testModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
          </section>
        )}

        {/* Settings modules */}
        {settingsModules.length > 0 && (
          <section className="mb-6">
            <SectionLabel>配置</SectionLabel>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {settingsModules.map((module) => (
                <module.Component key={module.meta.id} />
              ))}
            </div>
          </section>
        )}

        {/* Events */}
        {eventsModule && (
          <section className="mb-6">
            <SectionLabel>日志</SectionLabel>
            <eventsModule.Component />
          </section>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-foreground-3/50">
      {children}
    </h2>
  );
}

export default App;
