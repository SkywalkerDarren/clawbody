import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGatewayStore } from '@/core/store'
import { apiGet, apiPost } from '@/core/api'

interface SVConfig {
  threshold: number
  applyVAD: boolean
}

export function SVConfigCard() {
  const [config, setConfig] = useState<SVConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const { addLog } = useGatewayStore()

  const fetchConfig = async () => {
    const result = await apiGet<SVConfig>('/sv/config')
    if (result.success && result.data) {
      setConfig(result.data)
    }
  }

  const updateConfig = async () => {
    if (!config) return
    setLoading(true)
    const result = await apiPost('/sv/config', config)
    setLoading(false)
    if (result.success) {
      addLog('info', 'SV 配置已更新')
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
          <CardTitle className="text-sm font-medium">🔐 SV 配置</CardTitle>
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
        <CardTitle className="text-sm font-medium">🔐 SV 配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            验证阈值 (0-1): {config.threshold.toFixed(2)}
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
          <p className="text-xs text-muted-foreground">
            越高越严格，建议 0.5-0.7
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="applyVAD"
            checked={config.applyVAD}
            onChange={(e) =>
              setConfig({ ...config, applyVAD: e.target.checked })
            }
            className="rounded"
          />
          <label htmlFor="applyVAD" className="text-sm">
            应用 VAD 预处理
          </label>
          <Badge variant="secondary" className="text-xs">
            {config.applyVAD ? '开启' : '关闭'}
          </Badge>
        </div>

        <Button size="sm" onClick={updateConfig} disabled={loading}>
          保存配置
        </Button>
      </CardContent>
    </Card>
  )
}
