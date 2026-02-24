import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { useListen, useAudioRecorder } from '@/core/hooks';

export function STTTestCard() {
  const [result, setResult] = useState<string | null>(null);
  const { addLog } = useGatewayStore();

  const listenMutation = useListen();

  const { recordingState, recordingTime, startRecording, stopRecording } = useAudioRecorder({
    onRecordingComplete: async (audioBase64) => {
      listenMutation.mutate(
        { audio: audioBase64 },
        {
          onSuccess: (data) => {
            setResult(data.text);
            const duration = data.duration?.toFixed(1) ?? '-';
            addLog('info', `STT 结果 (${duration}s): "${data.text.slice(0, 50)}..."`);
          },
          onError: (err) => {
            addLog('error', `STT 失败: ${err.message}`);
          },
        }
      );
    },
    onError: (err) => {
      addLog('error', `录音失败: ${err.message}`);
    },
  });

  const handleStartRecording = () => {
    setResult(null);
    addLog('info', 'STT 录音开始...');
    startRecording();
  };

  const isProcessing = recordingState === 'processing' || listenMutation.isPending;

  return (
    <Card data-testid="stt-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">👂 STT 测试</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {recordingState === 'idle' && !isProcessing ? (
            <Button data-testid="stt-start-btn" size="sm" onClick={handleStartRecording}>
              🎤 开始录音
            </Button>
          ) : recordingState === 'recording' ? (
            <>
              <Button
                data-testid="stt-stop-btn"
                size="sm"
                variant="destructive"
                onClick={stopRecording}
              >
                ⏹ 停止 ({recordingTime}s)
              </Button>
              <Badge variant="destructive" className="animate-pulse">
                录音中
              </Badge>
            </>
          ) : (
            <Badge variant="secondary">转录中...</Badge>
          )}
        </div>

        {result && (
          <div data-testid="stt-result" className="p-3 bg-muted rounded text-sm">
            <p className="text-xs text-muted-foreground mb-1">转录结果:</p>
            <p>{result}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
