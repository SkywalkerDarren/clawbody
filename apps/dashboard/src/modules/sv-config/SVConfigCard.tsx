import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { useSVConfig, useUpdateSVConfig } from '@/core/hooks';
import type { SVConfig } from '@/core/schemas';

export function SVConfigCard() {
  const { addLog } = useGatewayStore();
  const { data: serverConfig, isLoading } = useSVConfig();
  const updateMutation = useUpdateSVConfig();

  const [localOverrides, setLocalOverrides] = useState<Partial<SVConfig>>({});

  const config = serverConfig ? { ...serverConfig, ...localOverrides } : null;

  const handleSave = () => {
    if (!config) return;
    updateMutation.mutate(config, {
      onSuccess: () => {
        addLog('info', 'SV 配置已更新');
        setLocalOverrides({});
      },
      onError: (err) => addLog('error', `更新失败: ${err.message}`),
    });
  };

  if (isLoading || !config) {
    return (
      <Card data-testid="sv-config-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">🔐 SV 配置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="sv-config-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">🔐 SV 配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            验证阈值 (0-1): {config.threshold.toFixed(2)}
          </label>
          <input
            data-testid="sv-threshold-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.threshold}
            onChange={(e) =>
              setLocalOverrides((prev) => ({
                ...prev,
                threshold: parseFloat(e.target.value),
              }))
            }
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">越高越严格，建议 0.5-0.7</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            data-testid="sv-apply-vad-checkbox"
            type="checkbox"
            id="applyVAD"
            checked={config.applyVAD}
            onChange={(e) =>
              setLocalOverrides((prev) => ({
                ...prev,
                applyVAD: e.target.checked,
              }))
            }
            className="rounded"
          />
          <label htmlFor="applyVAD" className="text-sm">
            应用 VAD 预处理
          </label>
          <Badge variant="secondary" className="text-xs">
            {config.applyVAD ? '开启' : '关闭'}
          </Badge>
        </div>

        <Button
          data-testid="sv-save-btn"
          size="sm"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          保存配置
        </Button>
      </CardContent>
    </Card>
  );
}
