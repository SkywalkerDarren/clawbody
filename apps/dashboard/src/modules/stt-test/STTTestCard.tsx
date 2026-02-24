import { useState } from 'react';
import { Mic, Square } from 'lucide-react';
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
        <CardTitle className="flex items-center gap-1.5">
          <Mic className="size-3.5 text-foreground-3" />
          STT
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {recordingState === 'idle' && !isProcessing ? (
            <Button data-testid="stt-start-btn" size="sm" onClick={handleStartRecording}>
              <Mic className="size-3" />
              录音
            </Button>
          ) : recordingState === 'recording' ? (
            <>
              <Button
                data-testid="stt-stop-btn"
                size="sm"
                variant="destructive"
                onClick={stopRecording}
              >
                <Square className="size-3" />
                停止 ({recordingTime}s)
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
          <div data-testid="stt-result" className="p-3 border-t border-border-subtle text-sm">
            <p className="text-xs text-foreground-3 mb-1">转录结果:</p>
            <p className="text-foreground-2">{result}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
