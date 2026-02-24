import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGatewayStore } from '@/core/store';
import { useVADConfig, useUpdateVADConfig } from '@/core/hooks';
import type { VADConfig } from '@/core/schemas';

export function VADConfigCard() {
  const { addLog } = useGatewayStore();
  const { data: serverConfig, isLoading } = useVADConfig();
  const updateMutation = useUpdateVADConfig();

  const [localOverrides, setLocalOverrides] = useState<Partial<VADConfig>>({});

  const config = serverConfig ? { ...serverConfig, ...localOverrides } : null;

  const handleSave = () => {
    if (!config) return;
    updateMutation.mutate(config, {
      onSuccess: () => {
        addLog('info', 'VAD 配置已更新');
        setLocalOverrides({});
      },
      onError: (err) => addLog('error', `更新失败: ${err.message}`),
    });
  };

  if (isLoading || !config) {
    return (
      <Card data-testid="vad-config-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">🎚️ VAD 配置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="vad-config-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">🎚️ VAD 配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            检测阈值 (0-1): {config.threshold.toFixed(2)}
          </label>
          <input
            data-testid="vad-threshold-slider"
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
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-muted-foreground">最小语音时长 (ms)</label>
            <input
              data-testid="vad-min-speech-input"
              type="number"
              value={config.minSpeechDurationMs}
              onChange={(e) =>
                setLocalOverrides((prev) => ({
                  ...prev,
                  minSpeechDurationMs: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-2 py-1 bg-muted border rounded mt-1"
            />
          </div>
          <div>
            <label className="text-muted-foreground">最小静音时长 (ms)</label>
            <input
              data-testid="vad-min-silence-input"
              type="number"
              value={config.minSilenceDurationMs}
              onChange={(e) =>
                setLocalOverrides((prev) => ({
                  ...prev,
                  minSilenceDurationMs: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full px-2 py-1 bg-muted border rounded mt-1"
            />
          </div>
        </div>

        <div className="text-xs">
          <label className="text-muted-foreground">语音填充 (ms)</label>
          <input
            data-testid="vad-speech-pad-input"
            type="number"
            value={config.speechPadMs}
            onChange={(e) =>
              setLocalOverrides((prev) => ({
                ...prev,
                speechPadMs: parseInt(e.target.value) || 0,
              }))
            }
            className="w-full px-2 py-1 bg-muted border rounded mt-1"
          />
        </div>

        <Button
          data-testid="vad-save-btn"
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
