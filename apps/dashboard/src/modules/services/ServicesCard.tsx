import { Activity, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDiagnostics } from '@/core/hooks';

export function ServicesCard() {
  const { data: diagnostics, isLoading, refetch } = useDiagnostics();

  const services = diagnostics?.services ?? {};

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ok':
        return 'bg-status-ok';
      case 'error':
        return 'bg-status-error';
      default:
        return 'bg-status-warn';
    }
  };

  const getOverallVariant = (overall: string) => {
    switch (overall) {
      case 'ok':
        return 'default' as const;
      case 'degraded':
        return 'secondary' as const;
      default:
        return 'destructive' as const;
    }
  };

  return (
    <Card data-testid="services-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-1.5">
          <Activity className="size-3.5 text-foreground-3" />
          服务状态
        </CardTitle>
        <Button
          data-testid="services-refresh-btn"
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className="size-3" />
        </Button>
      </CardHeader>
      <CardContent>
        <div data-testid="services-grid" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
          {Object.entries(services).map(([name, info]) => (
            <div
              key={name}
              data-testid={`service-item-${name}`}
              className="contents"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${getStatusDot(info.status)}`} />
              <span className="text-foreground-2 truncate">{name}</span>
              {info.latency !== undefined ? (
                <span className="text-xs text-foreground-3 tabular-nums">{info.latency}ms</span>
              ) : (
                <span />
              )}
            </div>
          ))}
          {Object.keys(services).length === 0 && (
            <div className="text-foreground-3 col-span-3">加载中...</div>
          )}
        </div>
        {diagnostics && (
          <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-foreground-3">
            Uptime: <span className="tabular-nums">{diagnostics.gateway.uptime}s</span> | Overall:{' '}
            <Badge
              data-testid="services-overall-badge"
              variant={getOverallVariant(diagnostics.overall)}
              className="text-xs"
            >
              {diagnostics.overall}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
