import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/core/store'
import { apiGet, apiDelete } from '@/core/api'

interface Speaker {
  id: string
  name: string
  embedding_count?: number
}

export function SpeakersCard() {
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(false)
  const { addLog } = useGatewayStore()

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

  useEffect(() => {
    refresh()
  }, [])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👤 说话人管理</CardTitle>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          刷新
        </Button>
      </CardHeader>
      <CardContent>
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
