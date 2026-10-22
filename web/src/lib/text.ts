/**
 * 后端文本的解析与转义（唯一入口）。
 *
 * 后端的 Word 字段来自第三方词典，形状并不稳定，实测常见这些情况：
 *
 *  - 同一个字段有时是数组、有时是换行分隔的字符串（definition / translation 都可能）；
 *  - pos 用 "/" 分隔多个词性，tag 用空格分隔多个标签，exchange 也是 "/" 分隔；
 *  - 释义里夹着 HTML 片段（<b>、<br>、<span style="...">）和实体（&amp;、&#39;、&nbsp;）；
 *  - 混入控制字符、零宽字符、全角空格、\r\n；
 *  - 字符串被后端截断，留下半个标签（"<b" 结尾）。
 *
 * 这些内容直接进 DOM 会显示成 "<b>…" 这种乱码，进 PDF 会串行错版，
 * 进 <audio src> 或 href 则可能是 javascript: 之类的非法协议。
 *
 * 所以所有后端文本都必须先过这一层：
 *   1. 解析：统一成「纯文本」或「行 / 词元数组」，剥标签、解实体、压空白；
 *   2. 转义：按消费端重新编码 —— DOM 用 escapeHtml、PDF 用 toSingleLine。
 *
 * 处理顺序是「解一层实体 → 剥标签 → 再解一层实体」：
 *   - `&lt;b&gt;bold&lt;/b&gt;` 先解成真实标签，再剥掉，最终只剩 "bold"；
 *   - `&amp;lt;tag&amp;gt;` 只解出 "&lt;tag&gt;"，不是标签，再解一层才得到字面量 "<tag>"，
 *     这份字面量会被原样保留（DOM 由 Vue 插值转义，PDF 只是纯文本，不会当标签执行）。
 *   一次解到底会把第二种也当成标签删掉，一次都不解则会带出 "&amp;" 这种乱码。
 */

/** 命名字符实体（只收录词典释义里会出现的，其余原样保留） */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  bull: '•',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup2: '²',
  sup3: '³',
  copy: '©',
  reg: '®',
  trade: '™',
  dagger: '†',
  para: '¶',
  sect: '§',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g
const UNICODE_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

function decodeOnce(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body.charAt(0) === '#') {
      const isHex = body.charAt(1) === 'x' || body.charAt(1) === 'X'
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      // 非法码位、代理区、0 一律保留原文，避免造出坏字符
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      if (code >= 0xd800 && code <= 0xdfff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/** 解 HTML 实体（支持十进制 / 十六进制数字实体；双层转义解两次） */
export function unescapeHtml(value: unknown): string {
  let text = String(value ?? '')
  for (let round = 0; round < 2; round += 1) {
    const next = decodeOnce(text)
    if (next === text) break
    text = next
  }
  return text
}

/** 转义成可安全插入 HTML 的文本（< > & " '） */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

/** 剥掉 HTML 片段：<br> 与块级闭合标签转换行，其余标签直接删除 */
function stripMarkup(text: string): string {
  return (
    text
      // 先断了 script / style 的内容，避免里面的 "<" 影响后续匹配
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(?:p|div|li|dd|dt|tr|td|h[1-6]|section|article)\s*>/gi, '\n')
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      // 被截断的半个标签（"…<b" 结尾）
      .replace(/<\/?[a-zA-Z][^>]*$/, '')
  )
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(UNICODE_SPACES, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 任意后端值 → 纯文本。
 * 数组按行拼接；数字/布尔转字符串；对象（如 detail）不参与展示，返回空串。
 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    // 每次只解一层：解一层 → 剥真实标签 → 再解一层（此时剩下的 "<…>" 是字面量，保留）
    const decoded = decodeOnce(value)
    return normalizeWhitespace(decodeOnce(stripMarkup(decoded)))
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return normalizeWhitespace(
      value
        .map((item) => toText(item))
        .filter(Boolean)
        .join('\n'),
    )
  }
  return ''
}

/** 多行文本 → 行数组（"每行一个释义" 的约定） */
export function splitLines(value: unknown): string[] {
  return toText(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** 分隔符文本 → 词元数组（pos / tag / exchange 用） */
export function splitTokens(value: unknown, separator: RegExp | string = /\s+/): string[] {
  const tokens: string[] = []
  for (const line of splitLines(value)) {
    for (const token of line.split(separator)) {
      const text = token.trim()
      if (text) tokens.push(text)
    }
  }
  return tokens
}

/** 多行文本压成单行（PDF 一行排版的格式要求） */
export function toSingleLine(value: unknown, fallback = ''): string {
  const text = toText(value).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  return text || fallback
}

/** 截断到指定码位长度，超出加省略号 */
export function truncate(value: unknown, max: number): string {
  const text = toText(value)
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, Math.max(0, max - 1)).join('')}…`
}

/**
 * 只放行安全协议的链接（音频、图片）。
 * javascript:/vbscript:/file:/data:text/html 一律丢弃，避免被塞进 <audio src>。
 */
export function safeUrl(value: unknown): string {
  const url = toSingleLine(value)
  if (!url) return ''
  if (/^(?:https?:\/\/|blob:|data:audio\/[a-z0-9.+-]+[;,]|\/\/|\/[^/])/i.test(url)) return url
  return ''
}

/**
 * 是不是纯 ASCII（决定 PDF 用 Helvetica 还是嵌入中文字体）。
 * 空白与常见标点都算 ASCII，\n 已在上游被压成空格。
 */
export function isAsciiText(value: unknown): boolean {
  const text = String(value ?? '')
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 32 || code > 126) return false
  }
  return true
}
