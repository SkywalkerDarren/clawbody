import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGatewayStore } from '@/core/store'
import { apiPost } from '@/core/api'

export function PipelineCard() {
  const { pipelineEnabled, setPipelineEnabled, addLog } = useGatewayStore()
  const [loading, setLoading] = useState(false)

  const handleEnable = async () => {
    setLoading(true)
    const result = await apiPost('/pipeline/enable')
    setLoading(false)
    if (result.success) {
      setPipelineEnabled(true)
      addLog('info', 'Pipeline 已启用')
    } else {
      addLog('error', `启用失败: ${result.error}`)
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    const result = await apiPost('/pipeline/disable')
    setLoading(false)
    if (result.success) {
      setPipelineEnabled(false)
      addLog('info', 'Pipeline 已禁用')
    } else {
      addLog('error', `禁用失败: ${result.error}`)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">🎙️ Pipeline 控制</CardTitle>
        <Badge variant={pipelineEnabled ? 'default' : 'secondary'}>
          {pipelineEnabled ? '已启用' : '已禁用'}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          VAD → SV → STT → OpenClaw
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={loading || pipelineEnabled}
          >
            启用
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleDisable}
            disabled={loading || !pipelineEnabled}
          >
            禁用
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
