import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/core/store'
import { apiPost } from '@/core/api'

export function TTSCard() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const { addLog } = useGatewayStore()

  const handleSpeak = async () => {
    if (!text.trim()) {
      setStatus('请输入文本')
      return
    }
    setLoading(true)
    setStatus('合成中...')
    const result = await apiPost<{ timings?: { tts_ms?: number } }>('/speak', {
      text,
    })
    setLoading(false)
    if (result.success) {
      setStatus(`完成 (${result.data?.timings?.tts_ms ?? '-'}ms)`)
      addLog('info', `TTS: "${text.slice(0, 30)}..."`)
    } else {
      setStatus(`失败: ${result.error}`)
      addLog('error', `TTS 失败: ${result.error}`)
    }
  }

  const handleStream = async () => {
    if (!text.trim()) {
      setStatus('请输入文本')
      return
    }
    setLoading(true)
    setStatus('流式合成中...')
    const result = await apiPost('/speak/stream', { text })
    setLoading(false)
    if (result.success) {
      setStatus('流式播放已触发')
      addLog('info', `TTS Stream: "${text.slice(0, 30)}..."`)
    } else {
      setStatus(`失败: ${result.error}`)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">🔊 TTS 测试</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要合成的文本..."
          className="w-full h-16 px-3 py-2 text-sm bg-muted border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSpeak} disabled={loading}>
            播放
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleStream}
            disabled={loading}
          >
            流式播放
          </Button>
        </div>
        {status && (
          <p className="text-xs text-muted-foreground">{status}</p>
        )}
      </CardContent>
    </Card>
  )
}
