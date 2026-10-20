/**
 * 导出编排：加载中文字体 → 浏览器内排版 → 下载 PDF。
 *
 * 字体只加载一次（模块级缓存）：思源黑体 10.5MB，裁成只含本次用到的字形后
 * 嵌入 PDF，导出的文件通常只有几十 KB。
 */
import regularUrl from '@/assets/fonts/NotoSansSC-Regular.ttf?url'
import boldUrl from '@/assets/fonts/NotoSansSC-Bold.subset.ttf?url'
import { TrueTypeFont } from '@/lib/pdf/ttf.js'
import { buildWordlistPdf, MODES } from '@/lib/pdf/wordlist.js'
import { formatBytes, timestamp } from '@/lib/utils'
import type { ExportMode, ExportProgressPayload, SimpleWord } from '@/types'

type Typeface = InstanceType<typeof TrueTypeFont>

/** @type 字体缓存：同一个 URL 只下载、解析一次 */
const typefaceCache = new Map<string, Promise<Typeface>>()

async function fetchWithProgress(
  url: string,
  onProgress?: (ratio: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`字体加载失败（HTTP ${response.status}）`)
  const total = Number(response.headers.get('content-length')) || 0

  if (!response.body || !total) {
    const buffer = await response.arrayBuffer()
    onProgress?.(1)
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress?.(Math.min(1, received / total))
  }
  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged.buffer
}

/** 加载并解析字体（带缓存） */
export function loadTypeface(url: string, onProgress?: (ratio: number) => void): Promise<Typeface> {
  const cached = typefaceCache.get(url)
  if (cached) {
    onProgress?.(1)
    return cached
  }
  const promise = (async () => {
    const buffer = await fetchWithProgress(url, onProgress)
    return new TrueTypeFont(buffer)
  })()
  typefaceCache.set(url, promise)
  // 失败时不要把坏结果留在缓存里
  promise.catch(() => typefaceCache.delete(url))
  return promise
}

/** 预热字体，用户点开导出面板时后台下载，点导出就很快 */
export function prefetchTypefaces(): void {
  loadTypeface(regularUrl, undefined).catch(() => {})
  loadTypeface(boldUrl, undefined).catch(() => {})
}

export function isTypefaceReady(): boolean {
  return typefaceCache.has(regularUrl)
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export interface ExportResult {
  filename: string
  bytes: number
  pages: number
  words: number
  elapsedMs: number
  sizeText: string
}

export interface ExportOptions {
  words: SimpleWord[]
  mode: ExportMode
  onProgress?: (payload: ExportProgressPayload) => void
}

/** 生成并下载 PDF */
export async function exportWordlistPdf({
  words,
  mode,
  onProgress,
}: ExportOptions): Promise<ExportResult> {
  if (!words || !words.length) throw new Error('没有可导出的单词')
  const started = Date.now()

  onProgress?.({ phase: 'font', ratio: 0, text: '加载中文字体（首次约 10MB，之后走缓存）' })
  const regular = await loadTypeface(regularUrl, (ratio) => {
    onProgress?.({ phase: 'font', ratio, text: `加载中文字体 ${Math.round(ratio * 100)}%` })
  })

  let bold: Typeface | undefined
  try {
    bold = await loadTypeface(boldUrl)
  } catch {
    bold = undefined // 缺粗体时退化为 Helvetica-Bold 表头
  }

  onProgress?.({ phase: 'render', ratio: 0, text: '排版中…' })
  const bytes: Uint8Array = await buildWordlistPdf({
    words: words.map(({ word, meaning }) => ({ word, meaning: meaning || '—' })),
    mode,
    typefaces: { regular, bold },
    meta: {
      title: `单词默写 · ${MODES[mode]?.label || mode}`,
      subject: '由生词本默写工坊生成',
    },
  })

  const label = MODES[mode]?.label || mode
  const filename = `单词默写_${label}_${timestamp()}.pdf`
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  saveBlob(blob, filename)

  const perPage = MODES[mode]?.perPage || 20
  const pages = Math.max(1, Math.ceil(words.length / perPage))
  onProgress?.({ phase: 'done', ratio: 1, text: '已生成' })

  return {
    filename,
    bytes: bytes.length,
    pages,
    words: words.length,
    elapsedMs: Date.now() - started,
    sizeText: formatBytes(bytes.length),
  }
}
