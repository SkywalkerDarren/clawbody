import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGatewayStore, type DiagnosticsData } from '@/core/store'
import { apiGet } from '@/core/api'

export function ServicesCard() {
  const { diagnostics, setDiagnostics, addLog } = useGatewayStore()
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const result = await apiGet<DiagnosticsData>('/diagnostics')
    setLoading(false)
    if (result.success && result.data) {
      setDiagnostics(result.data)
    } else {
      addLog('error', `获取诊断失败: ${result.error}`)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [])

  const services = diagnostics?.services ?? {}

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">📊 服务状态</CardTitle>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          刷新
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(services).map(([name, info]) => (
            <div key={name} className="flex items-center gap-2">
              <span
                className={
                  info.status === 'ok'
                    ? 'text-green-500'
                    : info.status === 'error'
                      ? 'text-red-500'
                      : 'text-yellow-500'
                }
              >
                {info.status === 'ok' ? '✓' : info.status === 'error' ? '✗' : '○'}
              </span>
              <span className="truncate">{name}</span>
              {info.latency && (
                <span className="text-xs text-muted-foreground">
                  {info.latency}ms
                </span>
              )}
            </div>
          ))}
          {Object.keys(services).length === 0 && (
            <div className="text-muted-foreground col-span-2">加载中...</div>
          )}
        </div>
        {diagnostics && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            Uptime: {diagnostics.gateway.uptime}s | Overall:{' '}
            <Badge
              variant={
                diagnostics.overall === 'ok'
                  ? 'default'
                  : diagnostics.overall === 'degraded'
                    ? 'secondary'
                    : 'destructive'
              }
              className="text-xs"
            >
              {diagnostics.overall}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
