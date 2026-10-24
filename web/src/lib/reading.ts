/**
 * 阅读练习：把大模型返回的 JSON 整理成界面能直接渲染的形状。
 *
 * 后端（app/services/llm_service.py）推来的 done 事件形如：
 *   { code: 200, message: 'ok', data: { result: { title, content, questions, core_point } } }
 *
 * 大模型的输出并不稳定：字段可能缺失、选项字母可能写成 "A." 或 1~4、
 * 正确答案可能只给字母也可能给整条选项内容。这里统一容错，
 * 同时把所有文本过一遍 lib/text，避免 HTML 片段和实体直接进界面。
 */
import { toText } from '@/lib/text'
import type { ReadingArticle, ReadingOption, ReadingQuestion, SseFrame } from '@/types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** 一帧数据解开后的统一返回体 */
export interface SsePayload {
  code: number
  message: string
  data: Record<string, unknown>
}

/**
 * 解析一帧的 data。后端所有事件都带 { code, message, data } 信封，
 * 只有 token 事件是裸对象，因此这里兼容两种情况：
 * 有 data 字段就取 data，没有就把整块当数据。
 */
export function parseFramePayload(frame: SseFrame): SsePayload {
  try {
    const payload = JSON.parse(frame.data) as unknown
    if (!payload || typeof payload !== 'object') {
      return { code: 200, message: '', data: {} }
    }
    const node = payload as Record<string, unknown>
    const hasEnvelope = 'code' in node || 'message' in node
    const data =
      node.data && typeof node.data === 'object' ? (node.data as Record<string, unknown>) : hasEnvelope ? {} : node
    return {
      code: Number(node.code ?? 200),
      message: toText(node.message),
      data,
    }
  } catch {
    return { code: 200, message: '', data: {} }
  }
}

/** 选项字母归一：'A' / 'a.' / '1' → 'A'；认不出来就按位置补 */
function normalizeLetter(value: unknown, index: number): string {
  const text = toText(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/^[A-F]$/.test(text)) return text
  if (/^[1-6]$/.test(text)) return LETTERS[Number(text) - 1] ?? text
  return LETTERS[index] ?? String(index + 1)
}

/** 正确答案：可能是字母、可能是选项内容，也可能是 { option_number, option_content } */
function resolveAnswer(raw: unknown, options: ReadingOption[]): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'object') {
    const node = raw as Record<string, unknown>
    const byNumber = normalizeLetter(node.option_number ?? node.letter ?? node.key, -1)
    if (options.some((option) => option.letter === byNumber)) return byNumber
    const content = toText(node.option_content ?? node.text ?? node.content)
    const hit = options.find((option) => option.text === content)
    return hit ? hit.letter : ''
  }
  const text = toText(raw)
  if (/^\s*[A-Fa-f]\s*[.、)]?\s*$/.test(text)) return text.trim().charAt(0).toUpperCase()
  const hit = options.find((option) => option.text === text)
  return hit ? hit.letter : ''
}

function parseQuestion(raw: unknown, index: number): ReadingQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const node = raw as Record<string, unknown>

  const stem = toText(node.question_content ?? node.stem ?? node.question ?? '')
  const rawOptions = Array.isArray(node.options) ? node.options : []
  const options: ReadingOption[] = []

  rawOptions.forEach((item, optionIndex) => {
    if (typeof item === 'string') {
      const text = toText(item)
      if (text) options.push({ letter: LETTERS[optionIndex] ?? String(optionIndex + 1), text })
      return
    }
    if (!item || typeof item !== 'object') return
    const option = item as Record<string, unknown>
    const text = toText(option.option_content ?? option.text ?? option.content ?? '')
    if (!text) return
    options.push({ letter: normalizeLetter(option.option_number ?? option.letter ?? option.key, optionIndex), text })
  })

  if (!stem && !options.length) return null

  return {
    number: toText(node.question_number ?? node.number ?? '') || String(index + 1),
    stem,
    options,
    answer: resolveAnswer(node.correct_option ?? node.correctOption ?? node.answer, options),
    analysis: toText(node.analysis ?? node.explanation ?? ''),
  }
}

/** 正文 → 段落：优先按空行切，没有空行再按单个换行切 */
function splitParagraphs(content: string): string[] {
  if (!content) return []
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  if (blocks.length > 1) return blocks
  return content
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length
}

/** 大模型返回的 result → 界面用的文章；完全解析不出内容时返回 null */
export function parseArticle(raw: unknown): ReadingArticle | null {
  // 少数情况下 result 是一段 JSON 字符串，先解开再走同一套解析
  if (typeof raw === 'string') {
    try {
      return parseArticle(JSON.parse(raw))
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const node = raw as Record<string, unknown>

  const title = toText(node.title ?? node.article_title ?? '')
  const content = toText(node.content ?? node.article ?? node.text ?? '')
  const corePoint = toText(node.core_point ?? node.corePoint ?? '')
  const rawQuestions = Array.isArray(node.questions) ? node.questions : []

  const questions: ReadingQuestion[] = []
  rawQuestions.forEach((item, index) => {
    const question = parseQuestion(item, index)
    if (question) questions.push(question)
  })

  if (!content && !questions.length) return null

  return {
    title: title || '阅读文章',
    paragraphs: splitParagraphs(content),
    questions,
    corePoint,
    wordCount: countWords(content),
  }
}

/** 从 token 事件的片段里猜标题：只用于生成过程中显示「正在生成《…》」 */
export function titleFromSnippet(snippet: string): string {
  const match = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(snippet)
  if (!match) return ''
  try {
    return toText(JSON.parse(`"${match[1]}"`))
  } catch {
    return ''
  }
}

export interface PageMark {
  /** 后端原文里的当前页（0 基或 1 基由后端决定，由调用方判定） */
  current: number
  total: number
}

/**
 * 从「获取第1.0/21.0页单词成功。」这类文案里取页码。
 * 实测后端会把页码格式化成带小数点的字符串（1.0/21.0），所以这里必须吃小数；
 * 取不到就返回 null，让调用方走 pageInfo 或保持通用状态。
 */
export function readPageMark(text: string): PageMark | null {
  if (!text) return null
  const match = /第\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*页/.exec(text)
  if (!match) return null
  const current = Math.round(Number(match[1]))
  const total = Math.round(Number(match[2]))
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null
  return { current, total }
}
