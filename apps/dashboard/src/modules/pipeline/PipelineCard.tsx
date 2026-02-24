import { Workflow, Play, Square } from 'lucide-react';
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
        <CardTitle className="flex items-center gap-1.5">
          <Workflow className="size-3.5 text-foreground-3" />
          Pipeline
        </CardTitle>
        <Badge data-testid="pipeline-status-badge" variant={isEnabled ? 'default' : 'secondary'}>
          {isEnabled ? '已启用' : '已禁用'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1.5 mb-4">
          {['VAD', 'SV', 'STT', 'OpenClaw'].map((step, i) => (
            <div key={step} className="flex items-center gap-1.5">
              <span className={`px-1.5 py-0.5 rounded-sm text-[11px] ${isEnabled ? 'bg-secondary text-foreground-2' : 'bg-secondary text-foreground-3'}`}>
                {step}
              </span>
              {i < 3 && <span className="text-foreground-3/30 text-[11px]">→</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="pipeline-enable-btn"
            size="sm"
            onClick={handleEnable}
            disabled={isLoading || isEnabled}
          >
            <Play className="size-3" />
            启用
          </Button>
          <Button
            data-testid="pipeline-disable-btn"
            size="sm"
            variant="destructive"
            onClick={handleDisable}
            disabled={isLoading || !isEnabled}
          >
            <Square className="size-3" />
            禁用
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
