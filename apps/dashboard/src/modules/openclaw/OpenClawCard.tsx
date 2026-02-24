import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDiagnostics } from '@/core/hooks';

export function OpenClawCard() {
  const { data: diagnostics } = useDiagnostics();
  const openclaw = diagnostics?.openclaw;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">🧠 OpenClaw 连接</CardTitle>
      </CardHeader>
      <CardContent>
        {!openclaw ? (
          <p className="text-sm text-muted-foreground">检测中...</p>
        ) : openclaw.status === 'ok' ? (
          <div className="space-y-1">
            <Badge variant="default">已连接</Badge>
            {openclaw.message && (
              <p className="text-xs text-muted-foreground">{openclaw.message}</p>
            )}
          </div>
        ) : openclaw.status === 'not_configured' ? (
          <Badge variant="secondary">未配置</Badge>
        ) : (
          <div className="space-y-1">
            <Badge variant="destructive">连接失败</Badge>
            {openclaw.message && (
              <p className="text-xs text-muted-foreground">{openclaw.message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
