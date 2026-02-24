import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/core/store';
import { useSpeakers, useEnrollSpeaker, useDeleteSpeaker, useVerifySpeaker } from '@/core/hooks';
import { useAudioRecorder } from '@/core/hooks/useAudioRecorder';

type Mode = 'idle' | 'enroll' | 'append' | 'verify';

export function SpeakersCard() {
  const [mode, setMode] = useState<Mode>('idle');
  const [speakerId, setSpeakerId] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    confidence: number;
    speakerName?: string;
  } | null>(null);
  const { addLog } = useGatewayStore();

  const { data: speakers = [], isLoading, refetch } = useSpeakers();
  const enrollMutation = useEnrollSpeaker();
  const deleteMutation = useDeleteSpeaker();
  const verifyMutation = useVerifySpeaker();

  const handleRecordingComplete = async (audioBase64: string) => {
    if (mode === 'enroll' || mode === 'append') {
      enrollMutation.mutate(
        {
          speaker_id: speakerId,
          speaker_name: speakerName,
          audio: audioBase64,
        },
        {
          onSuccess: (data) => {
            if (data.success) {
              const action = mode === 'append' ? '追加' : '注册';
              addLog('info', `${action}成功: ${speakerName} (${speakerId}) - ${data.embedding_count ?? 1} 声纹`);
              if (mode === 'enroll') {
                setSpeakerId('');
                setSpeakerName('');
              }
              setMode('idle');
              refetch();
            } else {
              addLog('error', `操作失败: ${data.message ?? '未知错误'}`);
            }
          },
          onError: (err) => {
            addLog('error', `操作失败: ${err.message}`);
          },
        }
      );
    } else if (mode === 'verify') {
      verifyMutation.mutate(audioBase64, {
        onSuccess: (data) => {
          setVerifyResult({
            verified: data.verified,
            confidence: data.confidence,
            speakerName: data.speaker_name ?? undefined,
          });
          if (data.verified) {
            addLog('info', `验证通过: ${data.speaker_name} (置信度: ${(data.confidence * 100).toFixed(1)}%)`);
          } else {
            addLog('warn', `验证失败: 置信度 ${(data.confidence * 100).toFixed(1)}% < 阈值 ${(data.threshold * 100).toFixed(1)}%`);
          }
        },
        onError: (err) => {
          addLog('error', `验证失败: ${err.message}`);
        },
      });
    }
  };

  const { recordingState, recordingTime, startRecording, stopRecording, devices, refreshDevices } =
    useAudioRecorder({
      onRecordingComplete: handleRecordingComplete,
      onError: (err) => {
        addLog('error', `录音失败: ${err.message}`);
      },
      deviceId: selectedDeviceId || undefined,
    });

  const handleDelete = (id: string) => {
    if (!confirm(`确定删除说话人 ${id}?`)) return;
    deleteMutation.mutate(id, {
      onSuccess: () => addLog('info', `已删除说话人: ${id}`),
      onError: (err) => addLog('error', `删除失败: ${err.message}`),
    });
  };

  const handleStartRecording = () => {
    if (mode === 'enroll' && (!speakerId.trim() || !speakerName.trim())) {
      addLog('error', '请输入说话人 ID 和名称');
      return;
    }
    setVerifyResult(null);
    addLog('info', '开始录音...');
    startRecording();
  };

  const handleAppend = (speaker: { id: string; name: string }) => {
    setSpeakerId(speaker.id);
    setSpeakerName(speaker.name);
    setMode('append');
  };

  const handleVerify = () => {
    setMode('verify');
    setVerifyResult(null);
  };

  return (
    <Card data-testid="speakers-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👤 说话人管理</CardTitle>
        <div className="flex gap-1">
          <Button
            data-testid="speakers-verify-btn"
            size="sm"
            variant="ghost"
            onClick={handleVerify}
            disabled={mode !== 'idle'}
          >
            测试
          </Button>
          <Button
            data-testid="speakers-enroll-toggle-btn"
            size="sm"
            variant="ghost"
            onClick={() => setMode(mode === 'idle' ? 'enroll' : 'idle')}
          >
            {mode !== 'idle' ? '取消' : '注册'}
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
        {/* Microphone Selection */}
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-muted-foreground">麦克风:</label>
          <select
            data-testid="speakers-device-select"
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-muted border rounded"
            disabled={recordingState !== 'idle'}
          >
            <option value="">默认设备</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={refreshDevices} className="h-6 px-2">
            🔄
          </Button>
        </div>

        {/* Enroll Form */}
        {mode === 'enroll' && (
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

        {/* Append Form */}
        {mode === 'append' && (
          <div className="mb-4 p-3 bg-muted border border-border rounded-md space-y-3">
            <p className="text-sm text-foreground">
              追加声纹: <strong>{speakerName}</strong> ({speakerId})
            </p>
            <div className="flex items-center gap-2">
              {recordingState === 'idle' ? (
                <Button size="sm" onClick={handleStartRecording}>
                  🎤 录制追加音频
                </Button>
              ) : recordingState === 'recording' ? (
                <>
                  <Button size="sm" variant="destructive" onClick={stopRecording}>
                    ⏹ 停止 ({recordingTime}s)
                  </Button>
                  <Badge variant="destructive" className="animate-pulse">
                    录音中
                  </Badge>
                </>
              ) : (
                <Badge variant="secondary">处理中...</Badge>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* Verify Form */}
        {mode === 'verify' && (
          <div className="mb-4 p-3 bg-muted border border-border rounded-md space-y-3">
            <p className="text-sm font-medium text-foreground">测试说话人验证</p>
            <div className="flex items-center gap-2">
              {recordingState === 'idle' ? (
                <Button size="sm" onClick={handleStartRecording}>
                  🎤 录制测试音频
                </Button>
              ) : recordingState === 'recording' ? (
                <>
                  <Button size="sm" variant="destructive" onClick={stopRecording}>
                    ⏹ 停止 ({recordingTime}s)
                  </Button>
                  <Badge variant="destructive" className="animate-pulse">
                    录音中
                  </Badge>
                </>
              ) : (
                <Badge variant="secondary">验证中...</Badge>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
                取消
              </Button>
            </div>
            {verifyResult && (
              <div className="mt-2 p-2 rounded bg-background border border-border">
                {verifyResult.verified ? (
                  <div className="text-emerald-500">
                    ✓ 验证通过: {verifyResult.speakerName} ({(verifyResult.confidence * 100).toFixed(1)}%)
                  </div>
                ) : (
                  <div className="text-destructive">
                    ✗ 验证失败 (置信度: {(verifyResult.confidence * 100).toFixed(1)}%)
                  </div>
                )}
              </div>
            )}
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
                  {s.embeddingCount !== undefined && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {s.embeddingCount} 声纹
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    data-testid={`speaker-append-btn-${s.id}`}
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleAppend(s)}
                    disabled={mode !== 'idle'}
                  >
                    追加
                  </Button>
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
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
