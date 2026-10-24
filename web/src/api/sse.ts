/**
 * SSE over fetch。
 *
 * 后端的 LLM 接口是 `POST /llm/generate/readComprehension` + `text/event-stream`：
 * 原生 EventSource 只能发 GET，所以这里自己读 fetch 的响应流，并按 SSE 规范切帧。
 *
 * 帧格式（FastAPI 原生 ServerSentEvent）：
 *   event: progress
 *   data: {"code":200,"message":"ok","data":{...}}
 *   <空行>
 *
 * 这一层只做「切帧 + 解析 + 回调」，不认识业务字段；
 * 业务语义在 lib/reading 与 stores/reading。
 */
import { ApiError, joinUrl } from './client'
import { settings } from '@/stores/settings'
import type { SseFrame } from '@/types'

export interface StreamOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  /** 每解析出一帧调用一次；抛错会中断整个流 */
  onFrame: (frame: SseFrame) => void
}

function baseUrl(): string {
  return (settings.apiBase || '').replace(/\/+$/, '')
}

/** 找第一个空行（SSE 帧分隔符），返回它的起止位置 */
function findSeparator(text: string): { start: number; end: number } | null {
  const match = /\r\n\r\n|\n\n|\r\r/.exec(text)
  if (!match || match.index === undefined) return null
  return { start: match.index, end: match.index + match[0].length }
}

/** 解析一帧：event 缺省为 message；data 多行按规范用 \n 连接 */
function parseFrame(raw: string): SseFrame | null {
  const lines = raw.split(/\r\n|\n|\r/)
  let event = 'message'
  const data: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value || 'message'
    else if (field === 'data') data.push(value)
    // id / retry 本场景用不到，忽略
  }

  if (!data.length) return null
  return { event, data: data.join('\n') }
}

/** 读一个 SSE 流，直到服务端关闭或调用方 abort */
export async function streamSse(
  path: string,
  { method = 'POST', body, signal, onFrame }: StreamOptions,
): Promise<void> {
  const url = joinUrl(baseUrl(), path)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      signal,
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'text/event-stream',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    if (signal?.aborted) throw new ApiError('已停止生成', { kind: 'abort' })
    throw new ApiError(`无法连接后端 ${url}，请检查服务是否启动、地址是否正确`, { kind: 'network' })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(`接口返回 HTTP ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`, {
      status: response.status,
    })
  }
  if (!response.body) {
    throw new ApiError('当前浏览器不支持流式响应，无法接收生成进度', { kind: 'parse' })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let separator = findSeparator(buffer)
      while (separator) {
        const raw = buffer.slice(0, separator.start)
        buffer = buffer.slice(separator.end)
        const frame = parseFrame(raw)
        if (frame) onFrame(frame)
        separator = findSeparator(buffer)
      }
    }

    // 服务端没补最后一个空行时，把剩下的内容当成一帧
    const tail = parseFrame(buffer)
    if (tail) onFrame(tail)
  } catch (error) {
    if (signal?.aborted) throw new ApiError('已停止生成', { kind: 'abort' })
    throw error
  } finally {
    reader.cancel().catch(() => {})
  }
}
