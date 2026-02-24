import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { usePipelineStatus, useEnablePipeline, useDisablePipeline } from '@/core/hooks';

export function PipelineCard() {
  const { addLog } = useGatewayStore();
  const { data: status, isLoading: isStatusLoading } = usePipelineStatus();
  const enableMutation = useEnablePipeline();
  const disableMutation = useDisablePipeline();

  const isEnabled = status?.enabled ?? false;
  const isLoading = isStatusLoading || enableMutation.isPending || disableMutation.isPending;

  const handleEnable = () => {
    enableMutation.mutate(undefined, {
      onSuccess: () => addLog('info', 'Pipeline 已启用'),
      onError: (err) => addLog('error', `启用失败: ${err.message}`),
    });
  };

  const handleDisable = () => {
    disableMutation.mutate(undefined, {
      onSuccess: () => addLog('info', 'Pipeline 已禁用'),
      onError: (err) => addLog('error', `禁用失败: ${err.message}`),
    });
  };

  return (
    <Card data-testid="pipeline-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">🎙️ Pipeline 控制</CardTitle>
        <Badge data-testid="pipeline-status-badge" variant={isEnabled ? 'default' : 'secondary'}>
          {isEnabled ? '已启用' : '已禁用'}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">VAD → SV → STT → OpenClaw</p>
        <div className="flex gap-2">
          <Button
            data-testid="pipeline-enable-btn"
            size="sm"
            onClick={handleEnable}
            disabled={isLoading || isEnabled}
          >
            启用
          </Button>
          <Button
            data-testid="pipeline-disable-btn"
            size="sm"
            variant="destructive"
            onClick={handleDisable}
            disabled={isLoading || !isEnabled}
          >
            禁用
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
