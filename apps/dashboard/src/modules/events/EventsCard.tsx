import { Terminal, Trash2 } from 'lucide-react';
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
          <CardTitle className="flex items-center gap-1.5">
            <Terminal className="size-3.5 text-foreground-3" />
            事件
          </CardTitle>
          <Badge variant={sseConnected ? 'default' : 'destructive'}>
            {sseConnected ? '已连接' : '断开'}
          </Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={clearLogs}>
          <Trash2 className="size-3" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="h-48 overflow-y-auto rounded-sm bg-[rgb(var(--cb-surface-0))] border border-border-subtle p-3 space-y-0.5 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-foreground-3/50">等待事件...</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-foreground-3/60 select-none shrink-0">
                  [{log.timestamp.toLocaleTimeString()}]
                </span>
                <span
                  className={cn(
                    log.level === 'error' && 'text-status-error',
                    log.level === 'warn' && 'text-status-warn',
                    log.level === 'info' && 'text-foreground-2'
                  )}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
