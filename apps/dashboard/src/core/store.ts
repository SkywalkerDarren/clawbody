import { create } from 'zustand'

// Service status from /api/diagnostics
export interface ServiceStatus {
  status: 'ok' | 'error' | 'not_registered'
  message?: string
  latency?: number
}

export interface DiagnosticsData {
  gateway: { status: string; uptime: number }
  services: Record<string, ServiceStatus>
  openclaw: { status: string; message?: string }
  overall: string
}

// Event log entry
export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: Date
}

interface GatewayState {
  // SSE connection
  sseConnected: boolean
  setSseConnected: (connected: boolean) => void

  // Pipeline
  pipelineEnabled: boolean
  setPipelineEnabled: (enabled: boolean) => void

  // Diagnostics
  diagnostics: DiagnosticsData | null
  setDiagnostics: (data: DiagnosticsData) => void

  // Event log
  logs: LogEntry[]
  addLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void

  // Last refresh
  lastRefresh: Date | null
}

export const useGatewayStore = create<GatewayState>((set) => ({
  sseConnected: false,
  setSseConnected: (connected) => set({ sseConnected: connected }),

  pipelineEnabled: false,
  setPipelineEnabled: (enabled) => set({ pipelineEnabled: enabled }),

  diagnostics: null,
  setDiagnostics: (data) => set({ diagnostics: data, lastRefresh: new Date() }),

  logs: [],
  addLog: (level, message) => {
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      level,
      message,
      timestamp: new Date(),
    }
    set((state) => ({
      logs: [...state.logs.slice(-99), entry], // Keep last 100
    }))
  },
  clearLogs: () => set({ logs: [] }),

  lastRefresh: null,
}))
