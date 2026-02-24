import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock EventSource for SSE tests
class MockEventSource {
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
  }

  close() {}
}

vi.stubGlobal('EventSource', MockEventSource)

// Mock fetch
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
))
