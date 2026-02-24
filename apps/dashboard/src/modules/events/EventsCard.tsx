import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { cn } from '@/lib/utils';

export function EventsCard() {
  const { logs, clearLogs, sseConnected } = useGatewayStore();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">📜 实时事件</CardTitle>
          <Badge variant={sseConnected ? 'default' : 'destructive'}>
            {sseConnected ? '已连接' : '断开'}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={clearLogs}>
          清空
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-48 overflow-y-auto bg-muted rounded p-3 space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-muted-foreground">等待事件...</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  log.level === 'error' && 'text-red-400',
                  log.level === 'warn' && 'text-yellow-400',
                  log.level === 'info' && 'text-blue-400'
                )}
              >
                [{log.timestamp.toLocaleTimeString()}] {log.message}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
