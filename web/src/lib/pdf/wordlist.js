/**
 * 版式复刻 —— 严格对照后端 app/util/generate_pdf_util.py 的参数与绘制顺序。
 *
 * both：左右两栏双向测试，每页 20 词（左印单词 / 右印释义）
 * en  ：只印英文、释义留空，两栏连续排布，每页 40 词
 * zh  ：只印中文、单词留空，两栏连续排布，每页 40 词
 *
 * 所有几何量、字号、颜色、虚线间距均与 Python 版保持一致，便于逐像素比对。
 */

import { A4, PdfDoc, HelveticaBold, EmbeddedFont } from './pdfdoc.js';

// ---------- 调色板（与 Python 版采样值一致） ----------
const ORANGE_BG = '#FAAC85';
const PEACH_BG = '#FFEFE7';
const STRIPE = '#FFE8DA';
const DASH = '#F0C6B2';
const LINE = '#F3DFD4';
const DARK = '#2E2A28';
const CHECK = '#C9CDD4';
const SUB = '#5A5A5A';
const NUM_COLOR = '#6B6B6B';

// ---------- 页面几何 ----------
const PW = A4.width;
const PH = A4.height;
const MARGIN = 48;
const INNER_W = PW - 2 * MARGIN;
const GAP = 12;
const HALF_W = (INNER_W - GAP) / 2;
const COL_NO = 22;
const COL_WORD = 95;
const COL_MEAN = 106.64;
const HDR_H = 20;
const ROW_H = 36;
const PER_PAGE = 20;
const SINGLE_PER_PAGE = PER_PAGE * 2;

export const MODES = {
  both: { key: 'both', label: '英文+释义', perPage: PER_PAGE, hint: '每页 20 词 · 左侧看单词写释义，右侧看释义写单词' },
  en: { key: 'en', label: '仅英文', perPage: SINGLE_PER_PAGE, hint: '每页 40 词 · 只印英文单词，释义留空' },
  zh: { key: 'zh', label: '仅中文', perPage: SINGLE_PER_PAGE, hint: '每页 40 词 · 只印中文释义，单词留空' },
};

function isAscii(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) return false;
  }
  return true;
}

/** 按字符折行，超出行数截断加省略号（对应 Python 的 wrap） */
function wrapText(text, font, size, maxWidth, maxLines = 3) {
  const lines = [];
  let current = '';
  for (const ch of text) {
    if (font.widthOf(current + ch, size) <= maxWidth) {
      current += ch;
    } else {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    const used = lines.join('');
    if (Array.from(used).length < Array.from(text).length) {
      while (
        lines[lines.length - 1] &&
        font.widthOf(lines[lines.length - 1] + '…', size) > maxWidth
      ) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
      }
      lines[lines.length - 1] += '…';
    }
  }
  return lines;
}

function drawCheckbox(page, cx, cy, size, background) {
  page.fillColor(background);
  page.strokeColor(CHECK);
  page.lineWidth(0.8);
  page.roundRect(cx - size / 2, cy - size / 2, size, size, size * 0.3, { fill: true, stroke: true });
}

/**
 * 半栏表格
 * @param {'en'|'zh'} mode en=印单词、释义留空；zh=印释义、单词留空
 * @returns {number} 表格底部 y
 */
function drawHalf(page, xLeft, topY, rows, mode, fonts) {
  const xs = [
    xLeft,
    xLeft + COL_NO,
    xLeft + COL_NO + COL_WORD,
    xLeft + COL_NO + COL_WORD + COL_MEAN,
    xLeft + HALF_W,
  ];

  // 表头
  page.fillColor(PEACH_BG);
  page.rect(xs[0], topY - HDR_H, HALF_W, HDR_H, { fill: true });
  page.fillColor(ORANGE_BG);
  const pad = 3;
  page.roundRect(xs[1] + pad, topY - HDR_H + pad, COL_WORD - 2 * pad, HDR_H - 2 * pad, 3, {
    fill: true,
  });
  page.text('Word', (xs[1] + xs[2]) / 2, topY - HDR_H + 7, {
    font: fonts.cnBold,
    size: 9,
    color: DARK,
    align: 'center',
  });
  page.text('Meaning', xs[2] + 8, topY - HDR_H + 7, {
    font: fonts.cnBold,
    size: 9,
    color: DARK,
    align: 'left',
  });

  // 数据行
  let y = topY - HDR_H;
  rows.forEach((row, index) => {
    const stripe = index % 2 === 1;
    const rowBg = stripe ? STRIPE : '#FFFFFF';
    page.fillColor(rowBg);
    page.rect(xs[0], y - ROW_H, HALF_W, ROW_H, { fill: true });

    page.text(String(row.no), (xs[0] + xs[1]) / 2, y - ROW_H / 2 - 3, {
      font: HelveticaBold,
      size: 9,
      color: NUM_COLOR,
      align: 'center',
    });

    if (mode === 'en') {
      const bold = isAscii(row.word) ? HelveticaBold : fonts.cnBold;
      page.text(row.word, xs[1] + 8, y - ROW_H / 2 - 3.2, {
        font: bold,
        size: 10.5,
        color: DARK,
      });
    } else {
      const lines = wrapText(row.meaning, fonts.cnRegular, 8.5, COL_MEAN - 14, 3);
      const leading = 9.6;
      const first = y - ROW_H / 2 + ((lines.length - 1) * leading) / 2 - 3.0;
      lines.forEach((line, i) => {
        page.text(line, xs[2] + 8, first - i * leading, {
          font: fonts.cnRegular,
          size: 8.5,
          color: SUB,
        });
      });
    }

    drawCheckbox(page, (xs[3] + xs[4]) / 2, y - ROW_H / 2, 11, rowBg);

    page.strokeColor(LINE);
    page.lineWidth(0.5);
    page.line(xs[0], y - ROW_H, xs[4], y - ROW_H);
    y -= ROW_H;
  });

  // 竖向虚线 + 外框
  page.strokeColor(DASH);
  page.lineWidth(0.6);
  page.setDash(2, 2);
  [xs[1], xs[2], xs[3]].forEach((gx) => page.line(gx, topY, gx, y));
  page.resetDash();
  page.strokeColor(LINE);
  page.lineWidth(0.7);
  page.rect(xs[0], y, HALF_W, topY - y, { fill: false, stroke: true });
  return y;
}

function drawPage(page, leftRows, rightRows, leftMode, rightMode, fonts) {
  const x0 = MARGIN;
  const tableTop = PH - MARGIN;
  const bottom = drawHalf(page, x0, tableTop, leftRows, leftMode, fonts);
  drawHalf(page, x0 + HALF_W + GAP, tableTop, rightRows, rightMode, fonts);

  page.strokeColor(DASH);
  page.lineWidth(0.6);
  page.setDash(2, 2);
  const mid = x0 + HALF_W + GAP / 2;
  page.line(mid, tableTop, mid, bottom);
  page.resetDash();
}

/**
 * 生成单词默写 PDF
 *
 * @param {object} options
 * @param {{word:string, meaning:string}[]} options.words
 * @param {'both'|'en'|'zh'} options.mode
 * @param {{regular: import('./ttf.js').TrueTypeFont, bold?: import('./ttf.js').TrueTypeFont}} options.typefaces
 * @param {{title?:string, subject?:string}} [options.meta]
 * @returns {Promise<Uint8Array>}
 */
export async function buildWordlistPdf({ words, mode = 'both', typefaces, meta = {} }) {
  const { regular, bold } = typefaces;
  if (!regular) throw new Error('缺少中文字体，无法生成 PDF');

  const collector = new Set();
  const collect = (text) => {
    for (const ch of text) collector.add(ch.codePointAt(0));
  };

  const perPage = mode === 'both' ? PER_PAGE : SINGLE_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(words.length / perPage));

  // 预扫字符，尽量只嵌入真正用到的字形
  collect('Word');
  collect('Meaning');
  for (const row of words) {
    if (mode !== 'zh') collect(row.word);
    if (mode !== 'en') collect(row.meaning);
  }

  const doc = new PdfDoc({
    title: meta.title || '单词默写',
    subject: meta.subject || '按不背单词生词本生成的默写练习',
  });

  const cnRegular = doc.addFont(new EmbeddedFont('NotoSansSC-Regular', regular, collector));
  // 加粗中文字体只用于两处表头，子集到这几个字母即可
  const headerChars = new Set(Array.from('WordMeaning').map((ch) => ch.codePointAt(0)));
  const cnBold = bold
    ? doc.addFont(new EmbeddedFont('NotoSansSC-Bold', bold, headerChars))
    : HelveticaBold;
  const fonts = {
    cnRegular,
    cnBold,
    helveticaBold: doc.addFont(HelveticaBold),
  };

  for (let p = 0; p < totalPages; p++) {
    const chunk = words.slice(p * perPage, (p + 1) * perPage);
    const page = doc.addPage();
    if (mode === 'both') {
      const rows = chunk.map((row, i) => ({ no: i + 1, word: row.word, meaning: row.meaning }));
      drawPage(page, rows, rows, 'en', 'zh', fonts);
    } else {
      const nLeft = Math.ceil(chunk.length / 2);
      const left = chunk.slice(0, nLeft).map((row, i) => ({ no: i + 1, word: row.word, meaning: row.meaning }));
      const right = chunk
        .slice(nLeft)
        .map((row, i) => ({ no: nLeft + i + 1, word: row.word, meaning: row.meaning }));
      drawPage(page, left, right, mode, mode, fonts);
    }
  }

  return doc.save();
}
