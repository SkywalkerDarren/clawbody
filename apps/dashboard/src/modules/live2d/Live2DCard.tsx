import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGatewayStore } from '@/core/store';
import { useModelInfo } from '@/core/hooks';
import { apiPost, OkResponseSchema } from '@/core/api-client';

export function Live2DCard() {
  const [loading, setLoading] = useState(false);
  const { addLog } = useGatewayStore();
  const { data: modelInfo, refetch } = useModelInfo();

  const triggerExpression = async (name: string) => {
    setLoading(true);
    try {
      await apiPost('/emote', OkResponseSchema, { emotion: name });
      addLog('info', `表情: ${name}`);
    } catch (err) {
      addLog('error', `表情失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerMotion = async (group: string, _index: number) => {
    setLoading(true);
    try {
      await apiPost('/action', OkResponseSchema, { action: group });
      addLog('info', `动作: ${group}`);
    } catch (err) {
      addLog('error', `动作失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="live2d-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">🎭 Live2D 控制</CardTitle>
        <Button
          data-testid="live2d-refresh-btn"
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
        >
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!modelInfo ? (
          <p className="text-sm text-muted-foreground">等待模型加载... (需要打开 Desktop)</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                表情 ({modelInfo.expressions.length})
              </p>
              <div data-testid="live2d-expressions" className="flex flex-wrap gap-1">
                {modelInfo.expressions.slice(0, 8).map((expr) => (
                  <Button
                    key={expr}
                    data-testid={`live2d-expr-${expr}`}
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    onClick={() => triggerExpression(expr)}
                    disabled={loading}
                  >
                    {expr}
                  </Button>
                ))}
                {modelInfo.expressions.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{modelInfo.expressions.length - 8}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                动作 ({Object.keys(modelInfo.motions).length} 组)
              </p>
              <div data-testid="live2d-motions" className="flex flex-wrap gap-1">
                {Object.entries(modelInfo.motions)
                  .slice(0, 6)
                  .map(([group, count]) => (
                    <Button
                      key={group}
                      data-testid={`live2d-motion-${group}`}
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-xs"
                      onClick={() => triggerMotion(group, 0)}
                      disabled={loading}
                    >
                      {group} ({count})
                    </Button>
                  ))}
                {Object.keys(modelInfo.motions).length > 6 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{Object.keys(modelInfo.motions).length - 6}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
