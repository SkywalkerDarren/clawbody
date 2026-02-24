const API_BASE = '/api'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export async function api<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error ?? `HTTP ${response.status}`,
      }
    }

    return { success: true, data }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// Convenience methods
export const apiGet = <T>(endpoint: string) => api<T>(endpoint)

export const apiPost = <T>(endpoint: string, body?: unknown) =>
  api<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })

export const apiDelete = <T>(endpoint: string) =>
  api<T>(endpoint, { method: 'DELETE' })
