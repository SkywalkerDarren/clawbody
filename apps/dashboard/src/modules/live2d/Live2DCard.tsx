import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/core/store'
import { apiGet, apiPost } from '@/core/api'

interface ModelInfo {
  expressions: string[]
  motions: Record<string, number>
}

export function Live2DCard() {
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const { addLog } = useGatewayStore()

  const fetchModelInfo = async () => {
    const result = await apiGet<ModelInfo>('/model-info')
    if (result.success && result.data) {
      setModelInfo(result.data)
    }
  }

  const triggerExpression = async (name: string) => {
    setLoading(true)
    const result = await apiPost('/emote', { expression: name })
    setLoading(false)
    if (result.success) {
      addLog('info', `表情: ${name}`)
    } else {
      addLog('error', `表情失败: ${result.error}`)
    }
  }

  const triggerMotion = async (group: string, index: number) => {
    setLoading(true)
    const result = await apiPost('/action', { group, index })
    setLoading(false)
    if (result.success) {
      addLog('info', `动作: ${group}[${index}]`)
    } else {
      addLog('error', `动作失败: ${result.error}`)
    }
  }

  useEffect(() => {
    fetchModelInfo()
  }, [])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">🎭 Live2D 控制</CardTitle>
        <Button size="sm" variant="ghost" onClick={fetchModelInfo}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!modelInfo ? (
          <p className="text-sm text-muted-foreground">
            等待模型加载... (需要打开 Desktop)
          </p>
        ) : (
          <>
            {/* Expressions */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                表情 ({modelInfo.expressions.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {modelInfo.expressions.slice(0, 8).map((expr) => (
                  <Button
                    key={expr}
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    onClick={() => triggerExpression(expr)}
                    disabled={loading}
                  >
                    {expr}
                  </Button>
                ))}
                {modelInfo.expressions.length > 8 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{modelInfo.expressions.length - 8}
                  </span>
                )}
              </div>
            </div>

            {/* Motions */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                动作 ({Object.keys(modelInfo.motions).length} 组)
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(modelInfo.motions)
                  .slice(0, 6)
                  .map(([group, count]) => (
                    <Button
                      key={group}
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-xs"
                      onClick={() => triggerMotion(group, 0)}
                      disabled={loading}
                    >
                      {group} ({count})
                    </Button>
                  ))}
                {Object.keys(modelInfo.motions).length > 6 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{Object.keys(modelInfo.motions).length - 6}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
