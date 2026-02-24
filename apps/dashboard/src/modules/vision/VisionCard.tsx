import { useState } from 'react';
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
      setScreenshot(`data:image/${result.data.format};base64,${result.data.image}`);
      setInfo({ width: result.data.width, height: result.data.height });
      addLog('info', `截图: ${result.data.width}x${result.data.height}`);
    } else if (result.error) {
      addLog('error', `截图失败: ${result.error.message}`);
    }
  };

  return (
    <Card data-testid="vision-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👁️ Vision 测试</CardTitle>
        <Button
          data-testid="vision-capture-btn"
          size="sm"
          onClick={captureScreen}
          disabled={isFetching}
        >
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
              className="w-full rounded border border-muted"
            />
            {info && (
              <p data-testid="vision-info" className="text-xs text-muted-foreground text-center">
                {info.width} × {info.height}
              </p>
            )}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center bg-muted rounded">
            <p className="text-sm text-muted-foreground">点击截图按钮预览</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
