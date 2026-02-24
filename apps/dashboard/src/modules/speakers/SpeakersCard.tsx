import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { useSpeakers, useEnrollSpeaker, useDeleteSpeaker } from '@/core/hooks';
import { useAudioRecorder } from '@/core/hooks/useAudioRecorder';

export function SpeakersCard() {
  const [showEnroll, setShowEnroll] = useState(false);
  const [speakerId, setSpeakerId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const { addLog } = useGatewayStore();

  const { data: speakers = [], isLoading, refetch } = useSpeakers();
  const enrollMutation = useEnrollSpeaker();
  const deleteMutation = useDeleteSpeaker();

  const { recordingState, recordingTime, startRecording, stopRecording } = useAudioRecorder({
    onRecordingComplete: async (audioBase64) => {
      enrollMutation.mutate(
        {
          speaker_id: speakerId,
          speaker_name: speakerName,
          audio: audioBase64,
        },
        {
          onSuccess: (data) => {
            if (data.success) {
              addLog('info', `注册成功: ${speakerName} (${speakerId})`);
              setSpeakerId('');
              setSpeakerName('');
              setShowEnroll(false);
            } else {
              addLog('error', `注册失败: ${data.message ?? '未知错误'}`);
            }
          },
          onError: (err) => {
            addLog('error', `注册失败: ${err.message}`);
          },
        }
      );
    },
    onError: (err) => {
      addLog('error', `录音失败: ${err.message}`);
    },
  });

  const handleDelete = (id: string) => {
    if (!confirm(`确定删除说话人 ${id}?`)) return;
    deleteMutation.mutate(id, {
      onSuccess: () => addLog('info', `已删除说话人: ${id}`),
      onError: (err) => addLog('error', `删除失败: ${err.message}`),
    });
  };

  const handleStartRecording = () => {
    if (!speakerId.trim() || !speakerName.trim()) {
      addLog('error', '请输入说话人 ID 和名称');
      return;
    }
    addLog('info', '开始录音...');
    startRecording();
  };

  return (
    <Card data-testid="speakers-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👤 说话人管理</CardTitle>
        <div className="flex gap-1">
          <Button
            data-testid="speakers-enroll-toggle-btn"
            size="sm"
            variant="ghost"
            onClick={() => setShowEnroll(!showEnroll)}
          >
            {showEnroll ? '取消' : '注册'}
          </Button>
          <Button
            data-testid="speakers-refresh-btn"
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showEnroll && (
          <div
            data-testid="speakers-enroll-form"
            className="mb-4 p-3 bg-muted rounded-md space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                data-testid="speakers-id-input"
                type="text"
                placeholder="说话人 ID"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
                className="px-2 py-1 text-sm bg-background border rounded"
                disabled={recordingState !== 'idle'}
              />
              <input
                data-testid="speakers-name-input"
                type="text"
                placeholder="说话人名称"
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                className="px-2 py-1 text-sm bg-background border rounded"
                disabled={recordingState !== 'idle'}
              />
            </div>
            <div className="flex items-center gap-2">
              {recordingState === 'idle' ? (
                <Button
                  data-testid="speakers-start-recording-btn"
                  size="sm"
                  onClick={handleStartRecording}
                >
                  🎤 开始录音
                </Button>
              ) : recordingState === 'recording' ? (
                <>
                  <Button
                    data-testid="speakers-stop-recording-btn"
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
                <Badge variant="secondary">处理中...</Badge>
              )}
              <span className="text-xs text-muted-foreground">建议录制 3-5 秒</span>
            </div>
          </div>
        )}

        <div data-testid="speakers-list" className="space-y-2">
          {speakers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无注册说话人</p>
          ) : (
            speakers.map((s) => (
              <div
                key={s.id}
                data-testid={`speaker-item-${s.id}`}
                className="flex items-center justify-between bg-muted rounded px-3 py-2"
              >
                <div>
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">({s.id})</span>
                  {s.embedding_count !== undefined && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {s.embedding_count} 声纹
                    </Badge>
                  )}
                </div>
                <Button
                  data-testid={`speaker-delete-btn-${s.id}`}
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-6 px-2"
                  onClick={() => handleDelete(s.id)}
                >
                  删除
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
