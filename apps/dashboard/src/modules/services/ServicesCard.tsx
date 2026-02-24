import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDiagnostics } from '@/core/hooks';

export function ServicesCard() {
  const { data: diagnostics, isLoading, refetch } = useDiagnostics();

  const services = diagnostics?.services ?? {};

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return { icon: '✓', className: 'text-green-500' };
      case 'error':
        return { icon: '✗', className: 'text-red-500' };
      default:
        return { icon: '○', className: 'text-yellow-500' };
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
        <CardTitle className="text-sm font-medium">📊 服务状态</CardTitle>
        <Button
          data-testid="services-refresh-btn"
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          刷新
        </Button>
      </CardHeader>
      <CardContent>
        <div data-testid="services-grid" className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(services).map(([name, info]) => {
            const { icon, className } = getStatusIcon(info.status);
            return (
              <div
                key={name}
                data-testid={`service-item-${name}`}
                className="flex items-center gap-2"
              >
                <span className={className}>{icon}</span>
                <span className="truncate">{name}</span>
                {info.latency !== undefined && (
                  <span className="text-xs text-muted-foreground">{info.latency}ms</span>
                )}
              </div>
            );
          })}
          {Object.keys(services).length === 0 && (
            <div className="text-muted-foreground col-span-2">加载中...</div>
          )}
        </div>
        {diagnostics && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            Uptime: {diagnostics.gateway.uptime}s | Overall:{' '}
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
