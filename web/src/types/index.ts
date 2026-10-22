/**
 * 后端数据结构（对应 app/domain/word.py 与 app/domain/ultimate_result.py）。
 * 这里只描述前端真正读取到的字段，其余字段通过索引签名兜住。
 */

/**
 * 后端文本字段的真实形状：既可能是数组，也可能是换行 / 分隔符拼成的字符串，
 * 还可能带 HTML 片段或实体。所有消费点都必须走 lib/text 的解析与转义层。
 */
export type TextLike = string | string[] | number | null | undefined

export interface Ultimate {
  /** 中文释义，每行一个 */
  translation?: TextLike
  /** 英文释义，每行一个；translation 为空时退化使用 */
  definition?: TextLike
  /** 音标（以英音为主） */
  phonetic?: TextLike
  /** 词性，用 "/" 分割 */
  pos?: TextLike
  /** 柯林斯星级 0-5 */
  collins?: TextLike
  /** 是否牛津三千核心词汇 */
  oxford?: TextLike | boolean
  /** 考试标签，空格分割：zk/gk/cet4/cet6/ky… */
  tag?: TextLike
  /** 英国国家语料库词频顺序 */
  bnc?: TextLike
  /** 当代语料库词频顺序 */
  frq?: TextLike
  /** 时态、复数等变形，用 "/" 分割项目（p:过去式/d:过去分词/…） */
  exchange?: TextLike
  /** JSON 扩展信息（例句等），界面暂未使用 */
  detail?: unknown
  /** 读音音频地址 */
  audio?: TextLike
  [key: string]: unknown
}

export interface Word {
  word: string
  /** 美音音标 */
  uspron?: TextLike
  /** 英音音标 */
  ukpron?: TextLike
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
  /** 乱序导出：生成 PDF 前把单词随机打乱 */
  shuffle: boolean
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
