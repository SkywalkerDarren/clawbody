import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGatewayStore } from '@/core/store';
import { useResetVAD, useDiagnostics } from '@/core/hooks';

export function ActionsCard() {
  const { addLog } = useGatewayStore();
  const resetVADMutation = useResetVAD();
  const { refetch: refetchDiagnostics } = useDiagnostics();

  const handleResetVAD = () => {
    resetVADMutation.mutate(undefined, {
      onSuccess: () => addLog('info', 'VAD 已重置'),
      onError: (err) => addLog('error', `VAD 重置失败: ${err.message}`),
    });
  };

  const handleExportDiagnostics = async () => {
    const result = await refetchDiagnostics();
    if (result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clawbody-diagnostics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('info', '诊断报告已导出');
    } else if (result.error) {
      addLog('error', `导出失败: ${result.error.message}`);
    }
  };

  return (
    <Card data-testid="actions-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">⚡ 快捷操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="actions-reset-vad-btn"
            size="sm"
            variant="secondary"
            onClick={handleResetVAD}
            disabled={resetVADMutation.isPending}
          >
            重置 VAD
          </Button>
          <Button
            data-testid="actions-open-live2d-btn"
            size="sm"
            variant="secondary"
            onClick={() => window.open('/', '_blank')}
          >
            打开 Live2D
          </Button>
          <Button
            data-testid="actions-refresh-btn"
            size="sm"
            variant="secondary"
            onClick={() => location.reload()}
          >
            刷新页面
          </Button>
          <Button
            data-testid="actions-export-btn"
            size="sm"
            variant="secondary"
            onClick={handleExportDiagnostics}
          >
            导出诊断
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
