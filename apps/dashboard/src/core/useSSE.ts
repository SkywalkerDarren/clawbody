import { useCallback, useEffect, useRef } from 'react';
import { useGatewayStore } from './store';

export function useSSE(url: string) {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { setSseConnected, setPipelineEnabled, addLog } = useGatewayStore();

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
      addLog('info', 'SSE 已连接');
    };

    es.onmessage = (event) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'hello') {
          return;
        }

        if (
          typeof data === 'object' &&
          data !== null &&
          'type' in data &&
          data.type === 'pipeline_status' &&
          'enabled' in data &&
          typeof data.enabled === 'boolean'
        ) {
          setPipelineEnabled(data.enabled);
        }

        addLog('info', `Event: ${JSON.stringify(data).slice(0, 60)}`);
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setSseConnected(false);
      es.close();
    };
  }, [url, setSseConnected, setPipelineEnabled, addLog]);

  useEffect(() => {
    const handleError = () => {
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    connect();

    const es = esRef.current;
    if (es) {
      es.addEventListener('error', handleError);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (es) {
        es.removeEventListener('error', handleError);
      }
      esRef.current?.close();
    };
  }, [connect]);

  return {
    reconnect: connect,
    close: () => esRef.current?.close(),
  };
}
