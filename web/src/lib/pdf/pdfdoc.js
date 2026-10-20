/**
 * 轻量 PDF 写入器（无第三方依赖）。
 *
 * 支持：A4 页面、路径/矩形/圆角矩形/虚线、内置 Helvetica、以及嵌入子集化 TrueType 字体
 * （CIDFontType2 + Identity-H，附带 ToUnicode 便于复制/无障碍朗读）。
 * 坐标系统与 reportlab 一致：原点左下、y 轴向上、单位为 pt。
 */

const A4 = { width: 595.2755905511812, height: 841.8897637795277 };

export { A4 };

// ---------------------------------------------------------------- 工具

const latinCache = new Map();

function latin1(text) {
  let cached = latinCache.get(text);
  if (cached) return cached;
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  cached = out;
  latinCache.set(text, cached);
  return cached;
}

function concat(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export function num(value) {
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

/** FlateDecode 压缩；不支持时返回 null（退化为不压缩） */
export async function deflateBytes(bytes) {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** PDF 字面量字符串转义 */
function escapeLiteral(text) {
  let out = '(';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + text[i];
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += text[i];
  }
  return out + ')';
}

// ---------------------------------------------------------------- 字体

/** 标准 14 字体（Helvetica / Helvetica-Bold），无需嵌入 */
export class StandardFont {
  constructor(baseFont, widths) {
    this.baseFont = baseFont;
    this.widths = widths;
    this.resourceName = null;
  }

  supports(text) {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 32 || code > 255) return false;
    }
    return true;
  }

  widthOf(text, size) {
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      total += this.widths[text.charCodeAt(i)] || 0;
    }
    return (total * size) / 1000;
  }

  encodeText(text) {
    return escapeLiteral(text);
  }

  async emit(doc) {
    const body = `<< /Type /Font /Subtype /Type1 /BaseFont /${this.baseFont} /Encoding /WinAnsiEncoding >>`;
    return doc.setBody(doc.reserve(), latin1(body));
  }
}

const HELVETICA_WIDTHS = new Uint16Array(256).fill(0);
const HELVETICA_BOLD_WIDTHS = new Uint16Array(256).fill(0);
(function fillWidths() {
  // AFM 标准宽度，索引 32..126
  const regular = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  const bold = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
    611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ];
  regular.forEach((w, i) => (HELVETICA_WIDTHS[32 + i] = w));
  bold.forEach((w, i) => (HELVETICA_BOLD_WIDTHS[32 + i] = w));
})();

export const Helvetica = new StandardFont('Helvetica', HELVETICA_WIDTHS);
export const HelveticaBold = new StandardFont('Helvetica-Bold', HELVETICA_BOLD_WIDTHS);

/**
 * 嵌入型 TrueType 字体。构造时子集化，只保留实际用到的字符。
 */
export class EmbeddedFont {
  /**
   * @param {string} baseName 例如 NotoSansSC-Regular
   * @param {import('./ttf.js').TrueTypeFont} ttf
   * @param {Iterable<number>} codePoints 需要的码位
   */
  constructor(baseName, ttf, codePoints) {
    this.baseName = baseName;
    this.ttf = ttf;
    this.codePoints = new Set(codePoints);
    // 常用 ASCII 一并保底
    for (let c = 32; c < 127; c++) this.codePoints.add(c);
    const subset = ttf.subset(this.codePoints);
    this.subsetBytes = subset.bytes;
    /** 码位 -> 子集字形号 */
    this.cidOf = new Map();
    for (const cp of this.codePoints) {
      const gid = ttf.glyphFor(cp);
      if (!gid) continue;
      const newGid = subset.gidMap.get(gid);
      if (newGid !== undefined) this.cidOf.set(cp, newGid);
    }
    this.widths = subset.widths;
    this.resourceName = null;
  }

  has(codePoint) {
    return this.cidOf.has(codePoint);
  }

  widthOf(text, size) {
    let total = 0;
    for (const ch of text) {
      const cid = this.cidOf.get(ch.codePointAt(0));
      total += cid ? this.widths.get(cid) || 0 : 0;
    }
    return (total * size) / 1000;
  }

  encodeText(text) {
    let hex = '<';
    for (const ch of text) {
      const cid = this.cidOf.get(ch.codePointAt(0)) || 0;
      hex += cid.toString(16).padStart(4, '0');
    }
    return hex + '>';
  }

  _toUnicodeCMap() {
    const entries = [...this.cidOf.entries()].sort((a, b) => a[0] - b[0]);
    const lines = [];
    lines.push('/CIDInit /ProcSet findresource begin');
    lines.push('12 dict begin');
    lines.push('begincmap');
    lines.push('/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def');
    lines.push('/CMapName /Adobe-Identity-UCS def');
    lines.push('/CMapType 2 def');
    lines.push('1 begincodespacerange');
    lines.push('<0000> <FFFF>');
    lines.push('endcodespacerange');
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      lines.push(`${chunk.length} beginbfchar`);
      for (const [codePoint, cid] of chunk) {
        const uni = String.fromCodePoint(codePoint)
          .split('')
          .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
          .join('');
        lines.push(`<${cid.toString(16).padStart(4, '0')}> <${uni}>`);
      }
      lines.push('endbfchar');
    }
    lines.push('endcmap');
    lines.push('CMapName currentdict /CMap defineresource pop');
    lines.push('end');
    lines.push('end');
    return latin1(lines.join('\n'));
  }

  async emit(doc) {
    const tag = randomTag();
    const psName = `${tag}+${this.baseName}`;
    const fontFileRef = doc.reserve();
    const descriptorRef = doc.reserve();
    const descendantRef = doc.reserve();
    const toUnicodeRef = doc.reserve();
    const type0Ref = doc.reserve();

    const compressed = await deflateBytes(this.subsetBytes);
    const data = compressed || this.subsetBytes;
    const filter = compressed ? ' /Filter /FlateDecode' : '';
    const streamDict = `<< /Length ${data.length} /Length1 ${this.subsetBytes.length}${filter} >>`;
    doc.setStream(fontFileRef, streamDict, data);

    const bbox = [
      Math.round((this.ttf.xMin * 1000) / this.ttf.unitsPerEm),
      Math.round((this.ttf.yMin * 1000) / this.ttf.unitsPerEm),
      Math.round((this.ttf.xMax * 1000) / this.ttf.unitsPerEm),
      Math.round((this.ttf.yMax * 1000) / this.ttf.unitsPerEm),
    ];
    const ascent = Math.round((this.ttf.ascender * 1000) / this.ttf.unitsPerEm);
    const descent = Math.round((this.ttf.descender * 1000) / this.ttf.unitsPerEm);

    doc.setBody(
      descriptorRef,
      latin1(
        `<< /Type /FontDescriptor /FontName /${psName} /Flags 4 ` +
          `/FontBBox [${bbox.join(' ')}] /ItalicAngle 0 /Ascent ${ascent} /Descent ${descent} ` +
          `/CapHeight ${ascent} /StemV 80 /FontFile2 ${fontFileRef} 0 R >>`,
      ),
    );

    // /W：子集字体字形号连续，可紧凑表达
    const count = this.widths.size;
    const widthValues = [];
    for (let cid = 0; cid < count; cid++) {
      widthValues.push(Math.round(this.widths.get(cid) || 0));
    }
    const wArray = count ? `1 [${widthValues.slice(1).join(' ')}]` : '';

    doc.setBody(
      descendantRef,
      latin1(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${psName} ` +
          `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor ${descriptorRef} 0 R /DW 1000 /W [${wArray}] /CIDToGIDMap /Identity >>`,
      ),
    );

    const cmap = this._toUnicodeCMap();
    doc.setStream(toUnicodeRef, `<< /Length ${cmap.length} >>`, cmap);

    doc.setBody(
      type0Ref,
      latin1(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${psName} /Encoding /Identity-H ` +
          `/DescendantFonts [${descendantRef} 0 R] /ToUnicode ${toUnicodeRef} 0 R >>`,
      ),
    );
    return type0Ref;
  }
}

function randomTag() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

// ---------------------------------------------------------------- 页面

export class PdfPage {
  constructor(doc, width, height) {
    this.doc = doc;
    this.width = width;
    this.height = height;
    /** @type {string[]} */
    this.ops = [];
  }

  _push(op) {
    this.ops.push(op);
    return this;
  }

  saveState() {
    return this._push('q');
  }

  restoreState() {
    return this._push('Q');
  }

  fillColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    return this._push(`${num(r)} ${num(g)} ${num(b)} rg`);
  }

  strokeColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    return this._push(`${num(r)} ${num(g)} ${num(b)} RG`);
  }

  lineWidth(width) {
    return this._push(`${num(width)} w`);
  }

  setDash(on, off) {
    return this._push(`[${num(on)} ${num(off)}] 0 d`);
  }

  resetDash() {
    return this._push('[] 0 d');
  }

  rect(x, y, width, height, { fill = true, stroke = false } = {}) {
    this._push(`${num(x)} ${num(y)} ${num(width)} ${num(height)} re`);
    return this._push(fill && stroke ? 'B' : fill ? 'f' : 'S');
  }

  /** 圆角矩形（贝塞尔近似，与 reportlab roundRect 视觉一致） */
  roundRect(x, y, width, height, radius, { fill = true, stroke = false } = {}) {
    const r = Math.min(radius, width / 2, height / 2);
    const k = r * 0.5522847498;
    const ops = [
      `${num(x + r)} ${num(y)} m`,
      `${num(x + width - r)} ${num(y)} l`,
      `${num(x + width - r + k)} ${num(y)} ${num(x + width)} ${num(y + r - k)} ${num(x + width)} ${num(y + r)} c`,
      `${num(x + width)} ${num(y + height - r)} l`,
      `${num(x + width)} ${num(y + height - r + k)} ${num(x + width - r + k)} ${num(y + height)} ${num(x + width - r)} ${num(y + height)} c`,
      `${num(x + r)} ${num(y + height)} l`,
      `${num(x + r - k)} ${num(y + height)} ${num(x)} ${num(y + height - r + k)} ${num(x)} ${num(y + height - r)} c`,
      `${num(x)} ${num(y + r)} l`,
      `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c`,
      'h',
    ];
    this._push(ops.join('\n'));
    return this._push(fill && stroke ? 'B' : fill ? 'f' : 'S');
  }

  line(x1, y1, x2, y2) {
    return this._push(`${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  /**
   * 绘制单行文字（y 为基线，与 reportlab drawString 一致）
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {{font: object, size?: number, color?: string, align?: 'left'|'center'|'right'}} options
   */
  text(text, x, y, { font, size = 9, color = '#000000', align = 'left' } = {}) {
    if (!text) return this;
    const width = font.widthOf(text, size);
    let originX = x;
    if (align === 'center') originX = x - width / 2;
    else if (align === 'right') originX = x - width;
    const [r, g, b] = hexToRgb(color);
    return this._push(
      `BT /${font.resourceName} ${num(size)} Tf ${num(r)} ${num(g)} ${num(b)} rg ` +
        `${num(originX)} ${num(y)} Td ${font.encodeText(text)} Tj ET`,
    );
  }

  async contentStream() {
    return latin1(this.ops.join('\n'));
  }
}

// ---------------------------------------------------------------- 文档

export class PdfDoc {
  constructor(meta = {}) {
    this.meta = meta;
    /** @type {(Uint8Array|null)[]} */
    this.objects = [];
    /** @type {{page: PdfPage}[]} */
    this.pages = [];
    /** @type {object[]} */
    this.fonts = [];
    this.catalogRef = this.reserve();
    this.pagesRef = this.reserve();
  }

  reserve() {
    this.objects.push(null);
    return this.objects.length;
  }

  setBody(ref, bytes) {
    this.objects[ref - 1] = bytes;
    return ref;
  }

  setStream(ref, dict, data) {
    const head = latin1(`${dict}\nstream\n`);
    const tail = latin1('\nendstream');
    this.objects[ref - 1] = concat([head, data, tail]);
    return ref;
  }

  /** 注册字体，返回带 resourceName 的字体对象 */
  addFont(font) {
    // 注意：Helvetica 等标准字体是模块级单例，必须每个文档都重新登记，
    // 否则第二个文档的资源字典里会缺少 /F4 这类引用。
    if (this.fonts.includes(font)) return font;
    font.resourceName = `F${this.fonts.length + 1}`;
    this.fonts.push(font);
    return font;
  }

  addPage(width = A4.width, height = A4.height) {
    const page = new PdfPage(this, width, height);
    this.pages.push(page);
    return page;
  }

  async save() {
    // 字体对象
    for (const font of this.fonts) {
      const ref = await font.emit(this);
      font.objectRef = ref;
    }

    const fontResources = this.fonts
      .map((font) => `/${font.resourceName} ${font.objectRef} 0 R`)
      .join(' ');

    const kids = [];
    for (const page of this.pages) {
      const contentRef = this.reserve();
      const pageRef = this.reserve();
      const stream = await page.contentStream();
      const compressed = await deflateBytes(stream);
      const data = compressed || stream;
      const dict = compressed
        ? `<< /Length ${data.length} /Filter /FlateDecode >>`
        : `<< /Length ${data.length} >>`;
      this.setStream(contentRef, dict, data);
      this.setBody(
        pageRef,
        latin1(
          `<< /Type /Page /Parent ${this.pagesRef} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
            `/Resources << /Font << ${fontResources} >> /ProcSet [/PDF /Text] >> ` +
            `/Contents ${contentRef} 0 R >>`,
        ),
      );
      kids.push(`${pageRef} 0 R`);
    }

    this.setBody(this.pagesRef, latin1(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.join(' ')}] >>`));
    this.setBody(this.catalogRef, latin1(`<< /Type /Catalog /Pages ${this.pagesRef} 0 R >>`));

    const infoRef = this.reserve();
    const info = [
      this.meta.title ? `/Title ${pdfTextString(this.meta.title)}` : '',
      this.meta.author ? `/Author ${pdfTextString(this.meta.author)}` : '',
      this.meta.subject ? `/Subject ${pdfTextString(this.meta.subject)}` : '',
      '/Producer (Bbdc Wordlist Studio)',
      `/CreationDate (${pdfDate(new Date())})`,
    ]
      .filter(Boolean)
      .join(' ');
    this.setBody(infoRef, latin1(`<< ${info} >>`));

    return this._serialize(this.catalogRef, infoRef);
  }

  _serialize(rootRef, infoRef) {
    const chunks = [];
    const offsets = [];
    let length = 0;

    const push = (bytes) => {
      chunks.push(bytes);
      length += bytes.length;
    };

    push(latin1('%PDF-1.7\n'));
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    this.objects.forEach((body, index) => {
      const ref = index + 1;
      offsets[ref] = length;
      push(latin1(`${ref} 0 obj\n`));
      push(body || latin1('null'));
      push(latin1('\nendobj\n'));
    });

    const xrefOffset = length;
    let xref = `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (let ref = 1; ref <= this.objects.length; ref++) {
      xref += `${String(offsets[ref]).padStart(10, '0')} 00000 n \n`;
    }
    push(latin1(xref));
    push(
      latin1(
        `trailer\n<< /Size ${this.objects.length + 1} /Root ${rootRef} 0 R /Info ${infoRef} 0 R >>\n` +
          `startxref\n${xrefOffset}\n%%EOF\n`,
      ),
    );

    return concat(chunks);
  }
}

function pdfTextString(text) {
  // UTF-16BE + BOM，兼容中文标题
  let hex = 'FEFF';
  for (const ch of text) {
    for (let i = 0; i < ch.length; i++) hex += ch.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

function pdfDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}
