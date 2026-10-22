/**
 * 本地自检脚本（不参与构建，仅 npm run verify 时用）。
 * 覆盖两件事：后端文本的转义清洗、乱序导出的顺序与配对。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { PdfDoc, PdfPage } from '@/lib/pdf/pdfdoc.js'
import { TrueTypeFont } from '@/lib/pdf/ttf.js'
import { buildWordlistPdf } from '@/lib/pdf/wordlist.js'
import { createSeededRandom, shuffleArray } from '@/lib/shuffle'
import { escapeHtml, safeUrl, splitTokens, toSingleLine, toText } from '@/lib/text'
import {
  audioOf,
  definitionsOf,
  exchangeOf,
  meaningOf,
  phoneticOf,
  tagsOf,
  wordTextOf,
} from '@/lib/word-utils'

let failures = 0
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures += 1
    console.error(`✗ ${name}\n    实际: ${JSON.stringify(actual)}\n    期望: ${JSON.stringify(expected)}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

// ---------------------------------------------------------------- 文本转义

check('剥 HTML 标签', toText('<b>good</b> morning'), 'good morning')
check('<br> 转换行', toText('a<br>b<br/>c'), 'a\nb\nc')
check('解实体', toText('fish &amp; chips'), 'fish & chips')
check('解数字实体', toText('it&#39;s &#x4E2D;'), "it's 中")
check('双层转义解出字面量', toText('&amp;lt;tag&amp;gt;'), '<tag>')
check('被转义过的 HTML 只留内容', toText('&lt;b&gt;bold&lt;/b&gt;'), 'bold')
check('去控制字符与零宽', toText('a\u0000b\u200Bc'), 'abc')
check('全角空格折叠', toText('a\u3000\u3000b'), 'a b')
check('截断的半个标签', toText('hello <b'), 'hello')
check('script 内容整体丢弃', toText('a<script>alert(1)</script>b'), 'ab')
check('数组按行拼接', toText(['第一条', '第二条']), '第一条\n第二条')
check('对象不参与展示', toText({ a: 1 }), '')
check('数字转字符串', toText(42), '42')
check('HTML 转义', escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
check('单行化', toSingleLine('第一行\n第二行'), '第一行 第二行')

// ---------------------------------------------------------------- 词条解析

const messy = {
  word: '  <b>abandon</b>  ',
  uspron: '[əˈbændən]',
  ultimate: {
    translation: 'vt. 放弃，抛弃\nn. 放任，狂热&amp;放纵',
    definition: 'to leave somebody\n&amp; never return',
    pos: 'vt/n',
    collins: '4',
    oxford: '1',
    tag: 'zk gk cet4 ky',
    exchange: 'p:abandoned/d:abandoned/i:abandoning/3:abandons',
    bnc: '1024',
    frq: '',
    audio: 'https://dict.youdao.com/dictvoice?audio=abandon',
    detail: { exam: [] },
  },
}

check('单词去标签留空白', wordTextOf(messy), 'abandon')
check('音标去重斜杠', phoneticOf(messy), '/əˈbændən/')
check('释义行按行拆', definitionsOf(messy).map((d) => `${d.pos}|${d.text}`), [
  'vt.|放弃，抛弃',
  'n.|放任，狂热&放纵',
])
check('PDF 单行释义', meaningOf(messy), 'vt. 放弃，抛弃；n. 放任，狂热&放纵')
check('标签：牛津/柯林斯/考试标签', tagsOf(messy).map((t) => t.text), [
  '牛津核心',
  '柯林斯 ★★★★',
  '中考',
  '高考',
  '四级',
])
check('变形按 / 拆并译名', exchangeOf(messy).map((f) => `${f.label}=${f.value}`), [
  '过去式=abandoned',
  '过去分词=abandoned',
  '现在分词=abandoning',
  '第三人称单数=abandons',
])

check('字符串型释义（非数组）', meaningOf({ word: 'x', ultimate: { translation: '一\n二' } }), '一；二')
check('英文释义兜底', meaningOf({ word: 'x', ultimate: { definition: 'one\ntwo' } }), 'one；two')
check('null 字段不炸', meaningOf({ word: 'x', ultimate: { translation: null } }), '')
check('pos 与释义行数对齐', definitionsOf({ word: 'x', ultimate: { translation: '甲\n乙', pos: 'n/vt' } }).map((d) => d.pos), ['n.', 'vt.'])
check('单个 pos 共用', definitionsOf({ word: 'x', ultimate: { translation: '甲\n乙', pos: 'n' } }).map((d) => d.pos), ['n.', 'n.'])
check('tag 拆分（空格）', splitTokens('cet4  cet6', /\s+/), ['cet4', 'cet6'])
check('非法 URL 丢弃', safeUrl('javascript:alert(1)'), '')
check('音频 URL 放行', audioOf({ word: 'x', ultimate: { audio: 'https://a/b.mp3' } }), 'https://a/b.mp3')

// ---------------------------------------------------------------- 乱序

const base = Array.from({ length: 60 }, (_, i) => ({ word: `w${i}`, meaning: `m${i}` }))

check('洗牌不修改原数组', base[0].word, 'w0')
const seededA = shuffleArray(base, createSeededRandom(20240501))
const seededB = shuffleArray(base, createSeededRandom(20240501))
check('同种子结果可复现', seededA.map((w) => w.word), seededB.map((w) => w.word))
check('元素不重复不丢失', new Set(seededA.map((w) => w.word)).size, 60)
check('顺序确实变了', seededA.map((w) => w.word).join() === base.map((w) => w.word).join(), false)
check('单词与释义仍然配对', seededA.every((w) => w.meaning === w.word.replace('w', 'm')), true)

// 位置分布：每个元素落到首位的概率应接近 1/60（粗检，避免退化成"只换了几位"）
const firstCount = new Map<string, number>()
for (let i = 0; i < 6000; i += 1) {
  const head = shuffleArray(base)[0].word
  firstCount.set(head, (firstCount.get(head) || 0) + 1)
}
const expectedHead = 6000 / 60
const deviations = [...firstCount.values()].map((n) => Math.abs(n - expectedHead) / expectedHead)
check('首位分布均匀（最大偏差 < 35%）', deviations.every((d) => d < 0.35), true)

// ---------------------------------------------------------------- PDF

const fontPath = resolve(process.cwd(), 'src/assets/fonts/NotoSansSC-Regular.ttf')
const raw = readFileSync(fontPath)
const regular = new TrueTypeFont(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
)

/** 拦截页面 text 调用，按页记录真正绘制出来的文本 */
const drawn: string[][] = []
const originalAddPage = PdfDoc.prototype.addPage
const originalText = PdfPage.prototype.text

// @ts-expect-error 运行时打桩：给每页编号，便于按页收集文本
PdfDoc.prototype.addPage = function patchedAddPage(...args: unknown[]) {
  // @ts-expect-error 透传原实现
  const page = originalAddPage.apply(this, args)
  ;(page as { __index?: number }).__index = drawn.length
  drawn.push([])
  return page
}

// @ts-expect-error 运行时打桩
PdfPage.prototype.text = function patchedText(text: string, ...rest: unknown[]) {
  const index = (this as { __index?: number }).__index ?? 0
  drawn[index]?.push(text)
  // @ts-expect-error 透传原实现
  return originalText.call(this, text, ...rest)
}

const words = Array.from({ length: 45 }, (_, i) => ({ word: `word${i}`, meaning: `释义${i}` }))

async function render(list: { word: string; meaning: string }[]): Promise<string[]> {
  drawn.length = 0
  const pdf = await buildWordlistPdf({ words: list, mode: 'both', typefaces: { regular } })
  if (!(pdf instanceof Uint8Array) || pdf.length < 1000) throw new Error('PDF 输出异常')
  return drawn.map((page) => page.join(' '))
}

const orderedText = await render(words)
const shuffledText = await render(shuffleArray(words, createSeededRandom(7)))

check(
  '原序：第一页按 word0、word1 顺序绘制',
  orderedText[0].indexOf('word0') < orderedText[0].indexOf('word1'),
  true,
)
check('乱序：第一页内容与原序不同', orderedText[0] !== shuffledText[0], true)
check('乱序：所有词仍然落在 PDF 里', shuffledText.join(' ').match(/word\d+/g)?.length, 45)
check('乱序：页数不变', shuffledText.length, 3)

PdfDoc.prototype.addPage = originalAddPage
PdfPage.prototype.text = originalText

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
if (failures > 0) process.exit(1)
