import { useCallback, useEffect, useRef } from 'react'
import { useGatewayStore } from './store'

export function useSSE(url: string) {
  const esRef = useRef<EventSource | null>(null)
  const { setSseConnected, setPipelineEnabled, addLog } = useGatewayStore()

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
    }

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      setSseConnected(true)
      addLog('info', 'SSE 已连接')
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'hello') return

        // Handle pipeline status updates
        if (data.type === 'pipeline_status') {
          setPipelineEnabled(data.enabled)
        }

        addLog('info', `Event: ${JSON.stringify(data).slice(0, 60)}`)
      } catch {
        // Ignore parse errors
      }
    }

    es.onerror = () => {
      setSseConnected(false)
      es.close()
      // Reconnect after 3s
      setTimeout(connect, 3000)
    }
  }, [url, setSseConnected, setPipelineEnabled, addLog])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
    }
  }, [connect])

  return {
    reconnect: connect,
    close: () => esRef.current?.close(),
  }
}
