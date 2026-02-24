import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useGatewayStore } from '@/core/store'
import { apiGet } from '@/core/api'

interface ScreenshotResult {
  image: string
  width: number
  height: number
  format: string
}

export function VisionCard() {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null)
  const { addLog } = useGatewayStore()

  const captureScreen = async () => {
    setLoading(true)
    const result = await apiGet<ScreenshotResult>('/screen')
    setLoading(false)

    if (result.success && result.data) {
      setScreenshot(`data:image/${result.data.format};base64,${result.data.image}`)
      setInfo({ width: result.data.width, height: result.data.height })
      addLog('info', `截图: ${result.data.width}x${result.data.height}`)
    } else {
      addLog('error', `截图失败: ${result.error}`)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">👁️ Vision 测试</CardTitle>
        <Button size="sm" onClick={captureScreen} disabled={loading}>
          {loading ? '截图中...' : '截图'}
        </Button>
      </CardHeader>
      <CardContent>
        {screenshot ? (
          <div className="space-y-2">
            <img
              src={screenshot}
              alt="Screenshot"
              className="w-full rounded border border-muted"
            />
            {info && (
              <p className="text-xs text-muted-foreground text-center">
                {info.width} × {info.height}
              </p>
            )}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center bg-muted rounded">
            <p className="text-sm text-muted-foreground">点击截图按钮预览</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
