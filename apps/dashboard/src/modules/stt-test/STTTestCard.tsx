import { useState, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGatewayStore } from '@/core/store'
import { apiPost } from '@/core/api'

type RecordingState = 'idle' | 'recording' | 'processing'

export function STTTestCard() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const { addLog } = useGatewayStore()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const startRecording = async () => {
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
      setResult(null)

      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1)
      }, 1000)

      addLog('info', 'STT 录音开始...')
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

    const channelData = audioBuffer.getChannelData(0)
    const pcmData = new Int16Array(channelData.length)
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]))
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    const uint8Array = new Uint8Array(pcmData.buffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const audioBase64 = btoa(binary)

    const apiResult = await apiPost<{
      ok: boolean
      text: string
      language: string
      duration: number
    }>('/listen', { audio: audioBase64 })

    setRecordingState('idle')
    audioContext.close()

    if (apiResult.success && apiResult.data) {
      setResult(apiResult.data.text)
      addLog(
        'info',
        `STT 结果 (${apiResult.data.duration.toFixed(1)}s): "${apiResult.data.text.slice(0, 50)}..."`
      )
    } else {
      addLog('error', `STT 失败: ${apiResult.error}`)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">👂 STT 测试</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <Badge variant="secondary">转录中...</Badge>
          )}
        </div>

        {result && (
          <div className="p-3 bg-muted rounded text-sm">
            <p className="text-xs text-muted-foreground mb-1">转录结果:</p>
            <p>{result}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
