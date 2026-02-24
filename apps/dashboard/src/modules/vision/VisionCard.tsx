import { useState } from 'react';
import { Eye, Camera } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGatewayStore } from '@/core/store';
import { useScreenshot } from '@/core/hooks';

export function VisionCard() {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const { addLog } = useGatewayStore();
  const { refetch, isFetching } = useScreenshot();

  const captureScreen = async () => {
    const result = await refetch();
    if (result.data) {
      setScreenshot(`data:image/png;base64,${result.data.base64}`);
      setInfo({ width: result.data.width, height: result.data.height });
      addLog('info', `截图: ${result.data.width}x${result.data.height}`);
    } else if (result.error) {
      addLog('error', `截图失败: ${result.error.message}`);
    }
  };

  return (
    <Card data-testid="vision-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-1.5">
          <Eye className="size-3.5 text-foreground-3" />
          Vision
        </CardTitle>
        <Button
          data-testid="vision-capture-btn"
          size="sm"
          onClick={captureScreen}
          disabled={isFetching}
        >
          <Camera className="size-3" />
          {isFetching ? '截图中...' : '截图'}
        </Button>
      </CardHeader>
      <CardContent>
        {screenshot ? (
          <div className="space-y-2">
            <img
              data-testid="vision-screenshot"
              src={screenshot}
              alt="Screenshot"
              className="w-full rounded-sm border border-border-subtle"
            />
            {info && (
              <p data-testid="vision-info" className="text-xs text-foreground-3 text-center">
                {info.width} × {info.height}
              </p>
            )}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center rounded-sm border border-border-subtle">
            <p className="text-sm text-foreground-3">点击截图按钮预览</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
