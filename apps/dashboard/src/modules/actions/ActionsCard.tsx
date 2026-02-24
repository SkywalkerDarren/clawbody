import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore, type DiagnosticsData } from '@/core/store'
import { apiPost, apiGet } from '@/core/api'

export function ActionsCard() {
  const { addLog } = useGatewayStore()

  const handleResetVAD = async () => {
    const result = await apiPost('/vad/reset')
    if (result.success) {
      addLog('info', 'VAD 已重置')
    } else {
      addLog('error', `VAD 重置失败: ${result.error}`)
    }
  }

  const handleExportDiagnostics = async () => {
    const result = await apiGet<DiagnosticsData>('/diagnostics')
    if (result.success && result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clawbody-diagnostics-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      addLog('info', '诊断报告已导出')
    } else {
      addLog('error', `导出失败: ${result.error}`)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">⚡ 快捷操作</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={handleResetVAD}>
            重置 VAD
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.open('/', '_blank')}
          >
            打开 Live2D
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => location.reload()}
          >
            刷新页面
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExportDiagnostics}>
            导出诊断
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
