/**
 * 把后端 Word 对象整理成界面与 PDF 需要的形状。
 *
 * 字段含义（后端 app/domain/word.py）：
 *   word        单词
 *   phonetic    音标（英音为主）
 *   definition  英文释义，每行一个
 *   translation 中文释义，每行一个
 *   pos         词性，用 "/" 分割
 *   collins     柯林斯星级 0-5
 *   oxford      是否牛津三千核心词
 *   tag         标签，"zk/中考 gk/高考 cet4/四级" 之类，空格分隔
 *   bnc / frq   英国国家语料库 / 当代语料库词频序号
 *   exchange    时态、复数等变形，"p:过去式/d:过去分词/…"，"/" 分割
 *   detail      JSON 扩展信息（例句等，界面未使用）
 *   audio       读音音频地址
 *
 * 这些字段既可能是数组也可能是分隔字符串，还可能夹着 HTML / 实体 / 控制字符，
 * 因此一律先过 lib/text 的解析与转义层，任何函数都不直接读原始值。
 */
import { isAsciiText, safeUrl, splitLines, splitTokens, toSingleLine, toText, truncate } from '@/lib/text'
import type { Word } from '@/types'

export interface DefinitionLine {
  pos: string
  text: string
}

export interface WordTag {
  text: string
  hot: boolean
}

export interface WordForm {
  key: string
  label: string
  value: string
}

/** 释义里可能出现的词性前缀：adj. / n. / vt. / 缩写 ph.r 之类 */
const POS_PREFIX = /^((?:adj|adv|n|v|vt|vi|prep|conj|pron|art|num|int|aux|abbr|det|modal|phr)\.)\s*/i

/** 已知词性缩写（不带点也要认） */
const POS_WORDS = new Set([
  'adj',
  'adv',
  'n',
  'v',
  'vt',
  'vi',
  'prep',
  'conj',
  'pron',
  'art',
  'num',
  'int',
  'aux',
  'abbr',
  'det',
  'modal',
  'phr',
])

/** exchange 的键 → 中文说明（有道系词典的约定） */
const FORM_LABELS: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '复数',
}

/** 考试标签缩写 → 中文 */
const TAG_LABELS: Record<string, string> = {
  zk: '中考',
  gk: '高考',
  cet4: '四级',
  cet6: '六级',
  cet: '四六级',
  ky: '考研',
  ielts: '雅思',
  toefl: '托福',
  gre: 'GRE',
  gmat: 'GMAT',
}

/** 单词本身（单行、去标签、限长，避免超长词撑破版式） */
export function wordTextOf(word?: Word | null): string {
  return truncate(toSingleLine(word?.word), 64)
}

/** 合并中文释义：优先 translation，退化为 definition；PDF 单行文本用 */
export function meaningOf(word?: Word | null): string {
  const ultimate = word?.ultimate || {}
  const translation = splitLines(ultimate.translation)
  const source = translation.length ? translation : splitLines(ultimate.definition)
  return truncate(source.join('；'), 150)
}

/** 音标：优先美音，其次英音，再次词典 phonetic；统一成 /…/ */
export function phoneticOf(word?: Word | null): string {
  const ultimate = word?.ultimate || {}
  const raw = toSingleLine(word?.uspron || word?.ukpron || ultimate.phonetic)
  // 后端偶发自带斜杠或方括号，先剥掉再统一包一层
  const value = raw.replace(/^[/[]+/, '').replace(/[/\]]+$/, '').trim()
  return value ? `/${value}/` : ''
}

/** 词性：pos 字段用 "/" 分割，逐项规范成 "n." 形式 */
export function posOf(word?: Word | null): string[] {
  return splitTokens(word?.ultimate?.pos, '/').map(normalizePos).filter(Boolean)
}

function normalizePos(token: string): string {
  const text = token.trim().toLowerCase().replace(/\s+/g, '')
  if (!text) return ''
  if (text.endsWith('.')) return text
  return POS_WORDS.has(text) ? `${text}.` : text
}

/**
 * 拆出「词性 + 释义」行，便于高亮显示。
 * 中文释义里自带 "n." 前缀时优先用它；没有前缀再按 pos 字段的顺序对齐。
 */
export function definitionsOf(word?: Word | null): DefinitionLine[] {
  const ultimate = word?.ultimate || {}
  const translation = splitLines(ultimate.translation)
  const source = translation.length ? translation : splitLines(ultimate.definition)
  const posList = posOf(word)

  return source.map((line, index) => {
    const match = line.match(POS_PREFIX)
    if (match) {
      return { pos: normalizePos(match[1]), text: line.slice(match[0].length).trim() }
    }
    // pos 与释义行数能对上就按位置取，只有一个词性时就共用
    const fallback =
      posList.length === source.length ? posList[index] : posList.length === 1 ? posList[0] : ''
    return { pos: fallback || '', text: line }
  })
}

/** 标签：牛津核心 / 柯林斯星级 / 考试标签（tag 用空格分割） */
export function tagsOf(word?: Word | null): WordTag[] {
  const ultimate = word?.ultimate || {}
  const tags: WordTag[] = []

  const collins = Number(toSingleLine(ultimate.collins))
  const oxford = toSingleLine(ultimate.oxford)
  if (oxford && oxford !== '0' && oxford.toLowerCase() !== 'false') {
    tags.push({ text: '牛津核心', hot: true })
  }
  if (Number.isFinite(collins) && collins > 0) {
    tags.push({ text: `柯林斯 ${'★'.repeat(Math.min(5, Math.round(collins)))}`, hot: true })
  }

  for (const token of splitTokens(ultimate.tag, /\s+/)) {
    const key = token.toLowerCase().replace(/[.,;]/g, '')
    tags.push({ text: TAG_LABELS[key] || token, hot: false })
  }
  return tags.slice(0, 5)
}

/** 变形：p:过去式/d:过去分词/… → 结构化列表（"/" 分割） */
export function exchangeOf(word?: Word | null): WordForm[] {
  const forms: WordForm[] = []
  for (const token of splitTokens(word?.ultimate?.exchange, '/')) {
    const colon = token.search(/[:：]/)
    const key = colon > 0 ? token.slice(0, colon).trim() : ''
    const value = (colon > 0 ? token.slice(colon + 1) : token).trim()
    if (!value) continue
    const normalizedKey = key.toLowerCase()
    forms.push({
      key: normalizedKey,
      label: FORM_LABELS[normalizedKey] || (key ? key.toUpperCase() : '变形'),
      value: truncate(value, 40),
    })
  }
  return forms
}

/** 词频序号：bnc / frq，非法值当 0 */
export function ranksOf(word?: Word | null): { bnc: number; frq: number } {
  const ultimate = word?.ultimate || {}
  const read = (value: unknown): number => {
    const num = Number(toSingleLine(value))
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
  }
  return { bnc: read(ultimate.bnc), frq: read(ultimate.frq) }
}

/** 音频地址：只放行 http(s)/相对路径/data:audio，其余（javascript: 等）丢弃 */
export function audioOf(word?: Word | null): string {
  return safeUrl(word?.ultimate?.audio)
}

/** 搜索用的大写化文本：单词 + 中英释义 + 词性 + 标签 */
export function searchTextOf(word?: Word | null): string {
  const ultimate = word?.ultimate || {}
  return [
    wordTextOf(word),
    toText(ultimate.translation),
    toText(ultimate.definition),
    toText(ultimate.pos),
    toText(ultimate.tag),
  ]
    .join(' ')
    .toLowerCase()
}

/** 该词是否能用标准 14 字体（Helvetica）排版 */
export function isAsciiWord(word?: Word | null): boolean {
  return isAsciiText(wordTextOf(word))
}
