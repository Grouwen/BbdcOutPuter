/**
 * 后端数据结构（对应 app/domain/word.py 与 app/domain/ultimate_result.py）。
 * 这里只描述前端真正读取到的字段，其余字段通过索引签名兜住。
 */

export interface Ultimate {
  /** 中文释义，优先使用 */
  translation?: string[]
  /** 英文释义，translation 为空时退化使用 */
  definition?: string[]
  /** 词典音标 */
  phonetic?: string
  /** 发音外链 */
  audio?: string
  /** 牛津核心词 */
  oxford?: boolean | number
  /** 柯林斯星级 0-5 */
  collins?: number
  /** 考试标签 */
  tag?: string[]
  [key: string]: unknown
}

export interface Word {
  word: string
  /** 美音音标 */
  uspron?: string
  /** 英音音标 */
  ukpron?: string
  /** 加入生词本时间，形如 2024-05-01 ... */
  updatetime?: string
  ultimate?: Ultimate
  [key: string]: unknown
}

export interface PageInfo {
  currentPage?: number
  totalPage?: number
  pageSize?: number
  totalRecord?: number
  [key: string]: unknown
}

/** GET /bbdc/service/getNewword/{page} 的 data */
export interface WordPage {
  pageInfo?: PageInfo
  wordList?: Word[]
}

/** 统一返回体：{ code: 200, message: 'ok', data: {...} } */
export interface ApiEnvelope<T> {
  code?: number
  message?: string
  data?: T
}

export interface AutoLoginResult {
  is_login?: boolean
  [key: string]: unknown
}

/** GET /bbdc/login/getAuthCode 的 data；url 是服务器上的绝对路径 */
export interface AuthCodeResult {
  url?: string
  token?: string
  [key: string]: unknown
}

/** 导出模式：英文+释义 / 仅英文 / 仅中文 */
export type ExportMode = 'both' | 'en' | 'zh'

export interface Settings {
  /** 空字符串 = 与页面同源 */
  apiBase: string
  /** 空字符串 = 与接口地址相同 */
  assetBase: string
  mode: ExportMode
  delayMin: number
  delayMax: number
}

/** 抓取进度回调载荷 */
export interface FetchProgressPayload {
  phase: 'probing' | 'waiting' | 'fetching' | 'done'
  done?: number
  total?: number
  page?: number
  waitMs?: number
  words?: number
}

/** 导出进度回调载荷 */
export interface ExportProgressPayload {
  phase: 'font' | 'render' | 'done'
  ratio: number
  text: string
}

/** 供界面与 PDF 使用的精简词条 */
export interface SimpleWord {
  word: string
  meaning: string
  raw?: Word
}

/** 列表/PDF 通用的错误态分类 */
export type ApiErrorKind = 'api' | 'timeout' | 'abort' | 'network' | 'parse'
