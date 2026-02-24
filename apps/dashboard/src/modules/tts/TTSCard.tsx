import { useState } from 'react';
import { Volume2, Play, Radio } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGatewayStore } from '@/core/store';
import { useSpeak, useSpeakStream } from '@/core/hooks';

export function TTSCard() {
  const [text, setText] = useState('');
  const { addLog } = useGatewayStore();

  const speakMutation = useSpeak();
  const streamMutation = useSpeakStream();

  const isLoading = speakMutation.isPending || streamMutation.isPending;

  const handleSpeak = () => {
    if (!text.trim()) {
      return;
    }
    speakMutation.mutate(
      { text },
      {
        onSuccess: () => {
          addLog('info', `TTS: "${text.slice(0, 30)}..."`);
        },
        onError: (err) => {
          addLog('error', `TTS 失败: ${err.message}`);
        },
      }
    );
  };

  const handleStream = () => {
    if (!text.trim()) {
      return;
    }
    streamMutation.mutate(
      { text },
      {
        onSuccess: () => {
          addLog('info', `TTS Stream: "${text.slice(0, 30)}..."`);
        },
        onError: (err) => {
          addLog('error', `TTS Stream 失败: ${err.message}`);
        },
      }
    );
  };

  const getStatus = () => {
    if (speakMutation.isPending) return '合成中...';
    if (streamMutation.isPending) return '流式合成中...';
    if (speakMutation.isSuccess) {
      const ttsMs = speakMutation.data?.timings?.tts_ms;
      return `完成 (${ttsMs ?? '-'}ms)`;
    }
    if (streamMutation.isSuccess) return '流式播放已触发';
    if (speakMutation.isError) return `失败: ${speakMutation.error.message}`;
    if (streamMutation.isError) return `失败: ${streamMutation.error.message}`;
    return '';
  };

  const status = getStatus();

  return (
    <Card data-testid="tts-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          <Volume2 className="size-3.5 text-foreground-3" />
          TTS
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          data-testid="tts-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要合成的文本..."
          className="w-full h-16 px-3 py-2 text-sm text-foreground-2 bg-secondary border border-border-subtle rounded-sm resize-none font-sans placeholder:text-foreground-3/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <Button
            data-testid="tts-speak-btn"
            size="sm"
            onClick={handleSpeak}
            disabled={isLoading || !text.trim()}
          >
            <Play className="size-3" />
            播放
          </Button>
          <Button
            data-testid="tts-stream-btn"
            size="sm"
            variant="secondary"
            onClick={handleStream}
            disabled={isLoading || !text.trim()}
          >
            <Radio className="size-3" />
            流式
          </Button>
        </div>
        {status && (
          <p data-testid="tts-status" className="text-xs text-foreground-3">
            {status}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
