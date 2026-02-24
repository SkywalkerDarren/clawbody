import { useEffect, useState, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGatewayStore } from '@/core/store'
import { apiGet, apiDelete, apiPost } from '@/core/api'

interface Speaker {
  id: string
  name: string
  embedding_count?: number
}

type RecordingState = 'idle' | 'recording' | 'processing'

export function SpeakersCard() {
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(false)
  const [showEnroll, setShowEnroll] = useState(false)
  const [speakerId, setSpeakerId] = useState('')
  const [speakerName, setSpeakerName] = useState('')
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const { addLog } = useGatewayStore()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const refresh = async () => {
    setLoading(true)
    const result = await apiGet<Speaker[]>('/sv/speakers')
    setLoading(false)
    if (result.success && result.data) {
      setSpeakers(result.data)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(`确定删除说话人 ${id}?`)) return
    const result = await apiDelete(`/sv/speakers/${encodeURIComponent(id)}`)
    if (result.success) {
      addLog('info', `已删除说话人: ${id}`)
      refresh()
    } else {
      addLog('error', `删除失败: ${result.error}`)
    }
  }

  const startRecording = async () => {
    if (!speakerId.trim() || !speakerName.trim()) {
      addLog('error', '请输入说话人 ID 和名称')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        await processRecording()
      }

      mediaRecorder.start()
      setRecordingState('recording')
      setRecordingTime(0)

      // Timer for recording duration
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)

      addLog('info', '开始录音...')
    } catch (err) {
      addLog('error', `无法访问麦克风: ${err}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setRecordingState('processing')
    }
  }

  const processRecording = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })

    // Convert to PCM 16-bit 16kHz
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Get mono channel
    const channelData = audioBuffer.getChannelData(0)

    // Convert to 16-bit PCM
    const pcmData = new Int16Array(channelData.length)
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]))
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    // Convert to base64
    const uint8Array = new Uint8Array(pcmData.buffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const audioBase64 = btoa(binary)

    // Send to API
    const result = await apiPost<{
      success: boolean
      message?: string
      embedding_count?: number
    }>('/sv/enroll', {
      speaker_id: speakerId,
      speaker_name: speakerName,
      audio: audioBase64,
    })

    setRecordingState('idle')
    audioContext.close()

    if (result.success && result.data?.success) {
      addLog('info', `注册成功: ${speakerName} (${speakerId})`)
      setSpeakerId('')
      setSpeakerName('')
      setShowEnroll(false)
      refresh()
    } else {
      addLog('error', `注册失败: ${result.data?.message ?? result.error}`)
    }
  }

  useEffect(() => {
    refresh()
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👤 说话人管理</CardTitle>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowEnroll(!showEnroll)}
          >
            {showEnroll ? '取消' : '注册'}
          </Button>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Enrollment form */}
        {showEnroll && (
          <div className="mb-4 p-3 bg-muted rounded-md space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="说话人 ID"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
                className="px-2 py-1 text-sm bg-background border rounded"
                disabled={recordingState !== 'idle'}
              />
              <input
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
                <Button size="sm" onClick={startRecording}>
                  🎤 开始录音
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
              <span className="text-xs text-muted-foreground">
                建议录制 3-5 秒
              </span>
            </div>
          </div>
        )}

        {/* Speaker list */}
        <div className="space-y-2">
          {speakers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无注册说话人</p>
          ) : (
            speakers.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-muted rounded px-3 py-2"
              >
                <div>
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({s.id})
                  </span>
                  {s.embedding_count && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {s.embedding_count} 声纹
                    </Badge>
                  )}
                </div>
                <Button
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
  )
}
