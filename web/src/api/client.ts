/**
 * HTTP 客户端：超时、取消、错误归类、统一返回体解包。
 * 只做传输层的事，不认识任何业务字段。
 */
import { settings } from '@/stores/settings'
import type { ApiEnvelope, ApiErrorKind } from '@/types'

export class ApiError extends Error {
  status: number
  code: number
  kind: ApiErrorKind

  constructor(message: string, options: { status?: number; code?: number; kind?: ApiErrorKind } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status || 0
    this.code = options.code || 0
    this.kind = options.kind || 'api'
  }
}

function baseUrl(): string {
  return (settings.apiBase || '').replace(/\/+$/, '')
}

export function joinUrl(base: string, path: string): string {
  return `${(base || '').replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  timeout?: number
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeout = 30000 } = options
  const url = joinUrl(baseUrl(), path)

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      headers: body
        ? { 'Content-Type': 'application/json', Accept: 'application/json' }
        : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    if (timedOut) throw new ApiError(`请求超时（${timeout / 1000}s）：${path}`, { kind: 'timeout' })
    if (signal?.aborted) throw new ApiError('已取消', { kind: 'abort' })
    throw new ApiError(`无法连接后端 ${url}，请检查服务是否启动、地址是否正确`, { kind: 'network' })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }

  const text = await response.text()
  if (!response.ok) {
    throw new ApiError(`接口返回 HTTP ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`, {
      status: response.status,
    })
  }

  let payload: ApiEnvelope<T> | null
  try {
    payload = JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new ApiError(`接口返回的不是 JSON，可能命中了错误路由：${path}`, { kind: 'parse' })
  }

  if (payload && typeof payload.code !== 'undefined' && payload.code !== 200) {
    throw new ApiError(payload.message || '接口返回异常', { code: payload.code })
  }
  return (payload?.data ?? {}) as T
}
