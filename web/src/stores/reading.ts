/**
 * 阅读练习的生成状态。
 *
 * 后端 POST /llm/generate/readComprehension 是一个 SSE 流，事件顺序为：
 *   progress × N    正在翻页读取生词本（data.message 形如「获取第0/1页单词成功。」）
 *   words_ready     生词读完，开始调用大模型
 *   token × N       大模型流式返回的片段（后端只给 partial JSON 的前 100 个字符）
 *   done            完整结果在 data.result
 *   error           出错（如未配置 api_key / model_name）
 *
 * 这里把事件翻译成「两个阶段 + 一句人话状态」，并保存文章、答案选择、字号，
 * 因此切到生词本再切回来不会丢结果。
 */
import { reactive } from 'vue'
import { api } from '@/api'
import { ApiError } from '@/api/client'
import { parseArticle, parseFramePayload, readPageMark, titleFromSnippet } from '@/lib/reading'
import { saveSettings, settings } from '@/stores/settings'
import { expire } from '@/stores/session'
import type { ReadingArticle, ReadingScale, SseFrame } from '@/types'

export type ReadingPhase = 'idle' | 'collecting' | 'writing' | 'done' | 'error'

export interface ReadingState {
  phase: ReadingPhase
  article: ReadingArticle | null
  /** 失败原因的原文，直接展示给用户 */
  error: string
  /** 给用户看的一句话状态 */
  status: string
  /** 已读页数 / 总页数（来自 progress 事件的 pageInfo） */
  pagesDone: number
  pagesTotal: number
  /** 已取回的生词数（progress 事件里 wordList 的条数累加） */
  wordsFetched: number
  /** 后端页码基准：0 基则 +1；null 表示还没从首帧判断出来 */
  pageOffset: number | null
  /** 本次生成已经过去的秒数 */
  elapsed: number
  /** 生成过程中从片段里猜到的标题 */
  liveTitle: string
  /** 收到的 token 片段数，用来做「正在写作」的动效 */
  chunks: number
  answerShown: boolean
  /** 题目序号 → 选中的选项字母 */
  picks: Record<string, string>
  scale: ReadingScale
}

export const reading = reactive<ReadingState>({
  phase: 'idle',
  article: null,
  error: '',
  status: '',
  pagesDone: 0,
  pagesTotal: 0,
  wordsFetched: 0,
  pageOffset: null,
  elapsed: 0,
  liveTitle: '',
  chunks: 0,
  answerShown: false,
  picks: {},
  scale: settings.readingScale,
})

/** 后端长时间没有任何事件时主动中断，避免界面一直转圈 */
const SILENCE_LIMIT = 120_000

/**
 * 结果缓存：生成一次要等几十秒，误刷新不该把文章和作答全丢掉。
 * 用 sessionStorage —— 只在这个标签页有效，关掉标签页就清空，界面上也这么写。
 */
const STORAGE_KEY = 'bbdc.reading.session.v1'

function saveReading(): void {
  if (!reading.article) return
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        article: reading.article,
        picks: reading.picks,
        answerShown: reading.answerShown,
        elapsed: reading.elapsed,
      }),
    )
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
}

function clearSavedReading(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function restoreReading(): void {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    const stored = JSON.parse(raw) as {
      article?: ReadingArticle
      picks?: Record<string, string>
      answerShown?: boolean
      elapsed?: number
    }
    const article = stored.article
    if (!article || !Array.isArray(article.paragraphs) || !Array.isArray(article.questions)) return
    reading.article = article
    reading.picks = stored.picks && typeof stored.picks === 'object' ? stored.picks : {}
    reading.answerShown = stored.answerShown === true
    reading.elapsed = Number(stored.elapsed) || 0
    reading.phase = 'done'
    reading.status = '生成完成'
  } catch {
    clearSavedReading()
  }
}

let controller: AbortController | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let watchdog: ReturnType<typeof setTimeout> | null = null

export function isRunning(): boolean {
  return reading.phase === 'collecting' || reading.phase === 'writing'
}

/** 读状态用函数而不是直接比较字段：避免 TS 在 await 之后把类型收窄成某个字面量 */
function isSettled(): boolean {
  return reading.phase === 'done' || reading.phase === 'error'
}

function hasFailed(): boolean {
  return reading.phase === 'error'
}

function startClock(): void {
  stopClock()
  reading.elapsed = 0
  ticker = setInterval(() => {
    reading.elapsed += 1
  }, 1000)
}

function stopClock(): void {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

function clearWatchdog(): void {
  if (watchdog) {
    clearTimeout(watchdog)
    watchdog = null
  }
}

function armWatchdog(): void {
  clearWatchdog()
  watchdog = setTimeout(() => {
    watchdog = null
    reading.error = '长时间没有收到生成进度，已中断。请检查后端日志后重试。'
    reading.status = '已中断'
    reading.phase = 'error'
    stopClock()
    controller?.abort()
  }, SILENCE_LIMIT)
}

function fail(message: string): void {
  reading.phase = 'error'
  reading.error = message
  reading.status = '生成失败'
  stopClock()
  clearWatchdog()
}

function handleFrame(frame: SseFrame): void {
  armWatchdog()
  const payload = parseFramePayload(frame)

  // warn 是「这一页失败了，会重试一次」，不是终态，不能按错误处理
  if (frame.event === 'warn') {
    reading.status = payload.message || '抓取遇到问题，正在重试…'
    return
  }

  if (frame.event === 'error') {
    fail(payload.message || '生成失败，请重试')
    return
  }

  if (frame.event === 'progress') {
    reading.phase = 'collecting'
    const info = (payload.data.pageInfo || {}) as Record<string, unknown>
    const text = typeof payload.data.message === 'string' ? payload.data.message : ''
    const mark = readPageMark(text)
    const pageWords = Array.isArray(payload.data.wordList) ? payload.data.wordList.length : 0

    if (info.currentPage != null && info.totalPage != null) {
      // 形态一：progress.data 是整页结果 { wordList, pageInfo }
      // currentPage 是 0 基下标，totalPage 是页数
      reading.pageOffset = 1
      const done = Number(info.currentPage) + 1
      reading.pagesDone = done
      reading.pagesTotal = Math.max(Math.round(Number(info.totalPage)), done)
    } else if (mark) {
      // 形态二：progress.data 只有 message，文案形如「获取第1.0/21.0页单词成功。」
      // 第一次拿到页码时判断这套后端是 0 基还是 1 基（首帧是 0 → 0 基）
      if (reading.pageOffset === null) reading.pageOffset = mark.current === 0 ? 1 : 0
      const done = mark.current + reading.pageOffset
      reading.pagesDone = done
      reading.pagesTotal = Math.max(mark.total, done)
    }

    if (pageWords > 0) reading.wordsFetched += pageWords

    reading.status = reading.pagesTotal
      ? `正在读取生词本 · 第 ${reading.pagesDone} / ${reading.pagesTotal} 页`
      : '正在读取生词本…'
    return
  }

  if (frame.event === 'words_ready') {
    reading.phase = 'writing'
    reading.status = reading.wordsFetched
      ? `生词已读完（${reading.wordsFetched} 词），正在写文章与题目…`
      : '生词已读完，正在写文章与题目…'
    return
  }

  if (frame.event === 'token') {
    reading.phase = 'writing'
    reading.chunks += 1
    const snippet = typeof payload.data.token === 'string' ? payload.data.token : ''
    const title = titleFromSnippet(snippet)
    if (title) reading.liveTitle = title
    reading.status = '正在写文章与题目…'
    return
  }

  if (frame.event === 'done') {
    // 正常情况结果在 data.result；个别版本直接把字段平铺在 data 里，两种都认
    const article = parseArticle(payload.data.result ?? payload.data)
    if (!article) {
      fail('生成结果解析失败：返回内容里没有可用的文章或题目。')
      return
    }
    reading.article = article
    reading.phase = 'done'
    reading.status = '生成完成'
    stopClock()
    clearWatchdog()
    saveReading()
  }
}

/** 生成一篇新的阅读文章（正在生成时重复调用无效） */
export async function generateReading(): Promise<void> {
  if (isRunning()) return

  reading.article = null
  reading.error = ''
  reading.status = '正在连接后端…'
  reading.phase = 'collecting'
  reading.pagesDone = 0
  reading.pagesTotal = 0
  reading.wordsFetched = 0
  reading.pageOffset = null
  reading.liveTitle = ''
  reading.chunks = 0
  reading.answerShown = false
  reading.picks = {}

  controller = new AbortController()
  startClock()
  armWatchdog()

  try {
    await api.readComprehension({
      signal: controller.signal,
      onFrame: handleFrame,
    })
    // 流正常结束但没收到 done：多半是后端中途断开
    if (!isSettled()) {
      fail('连接提前结束，没有收到完整结果，请重试。')
    }
  } catch (error) {
    const failure = error as ApiError
    if (failure?.kind === 'abort') {
      if (!hasFailed()) {
        reading.phase = 'idle'
        reading.status = '已停止生成'
      }
    } else {
      fail(failure?.message || '生成失败，请重试')
      if (/登录|未登录|未注册/i.test(failure?.message || '')) expire()
    }
  } finally {
    stopClock()
    clearWatchdog()
    controller = null
  }
}

/** 停止当前生成（主动取消） */
export function cancelReading(): void {
  controller?.abort()
}

/** 选择某个选项；已显示答案后不再改变选择 */
export function pickOption(questionNumber: string, letter: string): void {
  if (reading.answerShown) return
  reading.picks[questionNumber] = letter
  saveReading()
}

export function toggleAnswers(): void {
  reading.answerShown = !reading.answerShown
  saveReading()
}

/** 正文字号：写进设置，刷新后保持 */
export function setScale(scale: ReadingScale): void {
  reading.scale = scale
  saveSettings({ readingScale: scale })
}

/** 清空本次结果（换后端地址或主动重置时用） */
export function resetReading(): void {
  cancelReading()
  stopClock()
  clearWatchdog()
  clearSavedReading()
  reading.phase = 'idle'
  reading.article = null
  reading.error = ''
  reading.status = ''
  reading.pagesDone = 0
  reading.pagesTotal = 0
  reading.wordsFetched = 0
  reading.pageOffset = null
  reading.liveTitle = ''
  reading.chunks = 0
  reading.answerShown = false
  reading.picks = {}
  reading.elapsed = 0
}

// 进入页面时先恢复上一次的练习（只在这个标签页内有效）
restoreReading()
