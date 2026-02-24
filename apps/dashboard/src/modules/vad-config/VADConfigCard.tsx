import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/core/store'
import { apiGet, apiPost } from '@/core/api'

interface VADConfig {
  threshold: number
  minSpeechDurationMs: number
  minSilenceDurationMs: number
  speechPadMs: number
}

export function VADConfigCard() {
  const [config, setConfig] = useState<VADConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const { addLog } = useGatewayStore()

  const fetchConfig = async () => {
    const result = await apiGet<VADConfig>('/vad/config')
    if (result.success && result.data) {
      setConfig(result.data)
    }
  }

  const updateConfig = async () => {
    if (!config) return
    setLoading(true)
    const result = await apiPost('/vad/config', config)
    setLoading(false)
    if (result.success) {
      addLog('info', 'VAD 配置已更新')
    } else {
      addLog('error', `更新失败: ${result.error}`)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  if (!config) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">🎚️ VAD 配置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">🎚️ VAD 配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            检测阈值 (0-1): {config.threshold.toFixed(2)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.threshold}
            onChange={(e) =>
              setConfig({ ...config, threshold: parseFloat(e.target.value) })
            }
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-muted-foreground">最小语音时长 (ms)</label>
            <input
              type="number"
              value={config.minSpeechDurationMs}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minSpeechDurationMs: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-2 py-1 bg-muted border rounded mt-1"
            />
          </div>
          <div>
            <label className="text-muted-foreground">最小静音时长 (ms)</label>
            <input
              type="number"
              value={config.minSilenceDurationMs}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minSilenceDurationMs: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-2 py-1 bg-muted border rounded mt-1"
            />
          </div>
        </div>

        <div className="text-xs">
          <label className="text-muted-foreground">语音填充 (ms)</label>
          <input
            type="number"
            value={config.speechPadMs}
            onChange={(e) =>
              setConfig({
                ...config,
                speechPadMs: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-2 py-1 bg-muted border rounded mt-1"
          />
        </div>

        <Button size="sm" onClick={updateConfig} disabled={loading}>
          保存配置
        </Button>
      </CardContent>
    </Card>
  )
}
