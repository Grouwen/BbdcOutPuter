/**
 * 极简 TrueType 解析 + 子集化（浏览器端，无第三方依赖）。
 *
 * 目的：把 10MB 的思源黑体裁成只含本次文档用到字符的小字体，
 * 再以 CIDFontType2 / Identity-H 形式嵌入 PDF，保证中文在任何阅读器都不空白。
 *
 * 只处理 TrueType(glyf) 轮廓；Noto Sans SC 静态字重正是该格式。
 */

const TAG_LEN = 4;

function readTag(bytes, off) {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

/** 计算 4 字节对齐后的表校验和 */
function tableChecksum(bytes, offset, length) {
  let sum = 0;
  const end = offset + length;
  let p = offset;
  while (p < end) {
    let word = 0;
    for (let i = 0; i < 4; i++) {
      word = (word << 8) | (p + i < end ? bytes[p + i] : 0);
    }
    sum = (sum + (word >>> 0)) >>> 0;
    p += 4;
  }
  return sum >>> 0;
}

function sumUint32(bytes) {
  let sum = 0;
  const n = bytes.length;
  for (let p = 0; p < n; p += 4) {
    const word =
      ((bytes[p] << 24) | ((bytes[p + 1] || 0) << 16) | ((bytes[p + 2] || 0) << 8) | (bytes[p + 3] || 0)) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum >>> 0;
}

function writeU16(bytes, off, value) {
  bytes[off] = (value >> 8) & 0xff;
  bytes[off + 1] = value & 0xff;
}

function writeU32(bytes, off, value) {
  bytes[off] = (value >>> 24) & 0xff;
  bytes[off + 1] = (value >>> 16) & 0xff;
  bytes[off + 2] = (value >>> 8) & 0xff;
  bytes[off + 3] = value & 0xff;
}

export class TrueTypeFont {
  /**
   * @param {ArrayBuffer|Uint8Array} buffer 字体文件内容
   */
  constructor(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 12) throw new Error('字体文件无效');
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const numTables = this.view.getUint16(4, false);
    /** @type {Record<string,{offset:number,length:number}>} */
    this.tables = {};
    for (let i = 0; i < numTables; i++) {
      const base = 12 + i * 16;
      const tag = readTag(bytes, base);
      this.tables[tag] = {
        offset: this.view.getUint32(base + 8, false),
        length: this.view.getUint32(base + 12, false),
      };
    }
    for (const required of ['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cmap']) {
      if (!this.tables[required]) throw new Error(`字体缺少 ${required} 表，可能是 CFF 轮廓，暂不支持`);
    }

    this._parseHead();
    this._parseHhea();
    this._parseMaxp();
    this._parseHmtx();
    this._parseLoca();
    this._pickCmap();
    this._glyphCache = new Map();
    this._componentCache = new Map();
  }

  // ---------- 基础表 ----------
  _parseHead() {
    const t = this.tables.head.offset;
    this.unitsPerEm = this.view.getUint16(t + 18, false) || 1000;
    this.xMin = this.view.getInt16(t + 36, false);
    this.yMin = this.view.getInt16(t + 38, false);
    this.xMax = this.view.getInt16(t + 40, false);
    this.yMax = this.view.getInt16(t + 42, false);
    this.indexToLocFormat = this.view.getInt16(t + 50, false);
    this.headOffset = t;
  }

  _parseHhea() {
    const t = this.tables.hhea.offset;
    this.ascender = this.view.getInt16(t + 4, false);
    this.descender = this.view.getInt16(t + 6, false);
    this.numberOfHMetrics = this.view.getUint16(t + 34, false);
    this.hheaOffset = t;
  }

  _parseMaxp() {
    this.numGlyphs = this.view.getUint16(this.tables.maxp.offset + 4, false);
  }

  _parseHmtx() {
    this.hmtxOffset = this.tables.hmtx.offset;
  }

  _parseLoca() {
    const { offset, length } = this.tables.loca;
    const count = this.numGlyphs + 1;
    const loca = new Uint32Array(count);
    if (this.indexToLocFormat === 0) {
      for (let i = 0; i < count; i++) {
        const v = i * 2 + 2 <= length ? this.view.getUint16(offset + i * 2, false) : 0;
        loca[i] = v * 2;
      }
    } else {
      for (let i = 0; i < count; i++) {
        loca[i] = i * 4 + 4 <= length ? this.view.getUint32(offset + i * 4, false) : 0;
      }
    }
    this.loca = loca;
  }

  _pickCmap() {
    const base = this.tables.cmap.offset;
    const count = this.view.getUint16(base + 2, false);
    let fmt4 = -1;
    let fmt12 = -1;
    for (let i = 0; i < count; i++) {
      const rec = base + 4 + i * 8;
      const offset = this.view.getUint32(rec + 4, false);
      const sub = base + offset;
      const format = this.view.getUint16(sub, false);
      if (format === 12) fmt12 = sub;
      else if (format === 4 && fmt4 < 0) fmt4 = sub;
    }
    this.cmap4 = fmt4;
    this.cmap12 = fmt12;
    if (fmt4 < 0 && fmt12 < 0) throw new Error('字体缺少可用的 cmap 子表');
  }

  // ---------- 字符映射 ----------
  /** 码位 -> 字形编号；找不到返回 0 */
  glyphFor(codePoint) {
    const cached = this._glyphCache.get(codePoint);
    if (cached !== undefined) return cached;
    let gid = 0;
    if (this.cmap12 >= 0) gid = this._lookupFormat12(codePoint);
    if (!gid && this.cmap4 >= 0 && codePoint <= 0xffff) gid = this._lookupFormat4(codePoint);
    this._glyphCache.set(codePoint, gid);
    return gid;
  }

  _lookupFormat12(cp) {
    const base = this.cmap12;
    const nGroups = this.view.getUint32(base + 12, false);
    let lo = 0;
    let hi = nGroups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = base + 16 + mid * 12;
      const start = this.view.getUint32(g, false);
      const end = this.view.getUint32(g + 4, false);
      if (cp < start) hi = mid - 1;
      else if (cp > end) lo = mid + 1;
      else return this.view.getUint32(g + 8, false) + (cp - start);
    }
    return 0;
  }

  _lookupFormat4(cp) {
    const base = this.cmap4;
    const segCount = this.view.getUint16(base + 6, false) / 2;
    const endBase = base + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;

    let lo = 0;
    let hi = segCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const end = this.view.getUint16(endBase + mid * 2, false);
      if (cp > end) lo = mid + 1;
      else {
        const start = this.view.getUint16(startBase + mid * 2, false);
        if (cp < start) hi = mid - 1;
        else {
          const delta = this.view.getInt16(deltaBase + mid * 2, false);
          const rangeOffset = this.view.getUint16(rangeBase + mid * 2, false);
          if (rangeOffset === 0) return (cp + delta) & 0xffff;
          const addr = rangeBase + mid * 2 + rangeOffset + (cp - start) * 2;
          if (addr + 2 > this.bytes.length) return 0;
          const gid = this.view.getUint16(addr, false);
          return gid === 0 ? 0 : (gid + delta) & 0xffff;
        }
      }
    }
    return 0;
  }

  /** 字形步进宽度（字体单位） */
  advance(gid) {
    const n = this.numberOfHMetrics;
    if (gid < n) return this.view.getUint16(this.hmtxOffset + gid * 4, false);
    return this.view.getUint16(this.hmtxOffset + (n - 1) * 4, false);
  }

  /** 字形步进宽度，归一到 1000 单位 em（PDF 字形空间） */
  advanceScaled(gid) {
    return (this.advance(gid) * 1000) / this.unitsPerEm;
  }

  leftSideBearing(gid) {
    const n = this.numberOfHMetrics;
    if (gid < n) return this.view.getInt16(this.hmtxOffset + gid * 4 + 2, false);
    const addr = this.hmtxOffset + n * 4 + (gid - n) * 2;
    if (addr + 2 > this.bytes.length) return 0;
    return this.view.getInt16(addr, false);
  }

  glyphRange(gid) {
    const base = this.tables.glyf.offset;
    const start = this.loca[gid];
    const end = this.loca[gid + 1];
    const glyphLength = Math.max(0, end - start);
    return { start: base + start, end: base + end, length: glyphLength };
  }

  /** 复合字形的子字形编号列表 */
  components(gid) {
    if (this._componentCache.has(gid)) return this._componentCache.get(gid);
    const { start, length } = this.glyphRange(gid);
    const result = [];
    if (length >= 10 && this.view.getInt16(start, false) < 0) {
      let p = start + 10;
      const limit = start + length;
      for (;;) {
        if (p + 4 > limit) break;
        const flags = this.view.getUint16(p, false);
        const child = this.view.getUint16(p + 2, false);
        result.push(child);
        p += 4;
        p += flags & 0x0001 ? 4 : 2; // ARG_1_AND_2_ARE_WORDS
        if (flags & 0x0008) p += 2; // WE_HAVE_A_SCALE
        else if (flags & 0x0040) p += 4; // X_AND_Y_SCALE
        else if (flags & 0x0080) p += 8; // TWO_BY_TWO
        if (!(flags & 0x0020)) break; // MORE_COMPONENTS
      }
    }
    this._componentCache.set(gid, result);
    return result;
  }

  /** 取字形原始字节（复合字形会改写子字形编号） */
  _glyphBytes(gid, gidMap) {
    const { start, length } = this.glyphRange(gid);
    if (!length) return new Uint8Array(0);
    const data = this.bytes.slice(start, start + length);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.getInt16(0, false) < 0) {
      let p = 10;
      for (;;) {
        if (p + 4 > data.length) break;
        const flags = view.getUint16(p, false);
        const child = view.getUint16(p + 2, false);
        const mapped = gidMap.get(child);
        view.setUint16(p + 2, mapped === undefined ? 0 : mapped, false);
        p += 4;
        p += flags & 0x0001 ? 4 : 2;
        if (flags & 0x0008) p += 2;
        else if (flags & 0x0040) p += 4;
        else if (flags & 0x0080) p += 8;
        if (!(flags & 0x0020)) break;
      }
    }
    return data;
  }

  // ---------- 子集化 ----------
  /**
   * @param {Iterable<number>} codePoints 需要保留的码位
   * @returns {{bytes:Uint8Array, gidMap:Map<number,number>, widths:Map<number,number>}}
   *          gidMap: 原字形 -> 新字形；widths: 新字形 -> 1000 单位宽度
   */
  subset(codePoints) {
    // 1. 收集字形（含复合字形的递归依赖）
    const used = new Set([0]);
    for (const cp of codePoints) {
      const gid = this.glyphFor(cp);
      if (gid) used.add(gid);
    }
    const queue = [...used];
    while (queue.length) {
      const gid = queue.pop();
      for (const child of this.components(gid)) {
        if (!used.has(child)) {
          used.add(child);
          queue.push(child);
        }
      }
    }
    const sorted = [...used].sort((a, b) => a - b);
    const gidMap = new Map();
    sorted.forEach((gid, index) => gidMap.set(gid, index));

    // 2. 重建 glyf / loca
    const glyphParts = [];
    const loca = new Uint32Array(sorted.length + 1);
    let offset = 0;
    sorted.forEach((gid, index) => {
      loca[index] = offset;
      let data = this._glyphBytes(gid, gidMap);
      const pad = (4 - (data.length % 4)) % 4;
      if (pad) {
        const padded = new Uint8Array(data.length + pad);
        padded.set(data);
        data = padded;
      }
      glyphParts.push(data);
      offset += data.length;
    });
    loca[sorted.length] = offset;
    const glyf = concatBytes(glyphParts);

    const locaBytes = new Uint8Array(loca.length * 4);
    loca.forEach((v, i) => writeU32(locaBytes, i * 4, v));

    // 3. 重建 hmtx
    const hmtx = new Uint8Array(sorted.length * 4);
    const widths = new Map();
    sorted.forEach((gid, index) => {
      const adv = this.advance(gid);
      const lsb = this.leftSideBearing(gid);
      writeU16(hmtx, index * 4, adv);
      writeU16(hmtx, index * 4 + 2, lsb & 0xffff);
      widths.set(index, this.advanceScaled(gid));
    });

    // 4. head / hhea / maxp
    const head = this.bytes.slice(this.headOffset, this.headOffset + this.tables.head.length);
    writeU32(head, 8, 0); // checkSumAdjustment 先清零
    writeU16(head, 50, 1); // indexToLocFormat = long

    const hhea = this.bytes.slice(this.hheaOffset, this.hheaOffset + this.tables.hhea.length);
    writeU16(hhea, 34, sorted.length);

    const maxp = this.bytes.slice(
      this.tables.maxp.offset,
      this.tables.maxp.offset + this.tables.maxp.length,
    );
    writeU16(maxp, 4, sorted.length);

    // 5. cmap
    const pairs = [];
    for (const cp of new Set(codePoints)) {
      const gid = this.glyphFor(cp);
      if (!gid) continue;
      pairs.push([cp, gidMap.get(gid)]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    const cmap = buildCmap(pairs);

    // 6. name / OS/2 / post
    const tables = {
      cmap,
      glyf,
      head,
      hhea,
      hmtx,
      loca: locaBytes,
      maxp,
      name: this.bytes.slice(
        this.tables.name.offset,
        this.tables.name.offset + this.tables.name.length,
      ),
      post: buildPost3(),
    };
    if (this.tables['OS/2']) {
      const os2 = this.bytes.slice(
        this.tables['OS/2'].offset,
        this.tables['OS/2'].offset + this.tables['OS/2'].length,
      );
      if (pairs.length) {
        writeU16(os2, 64, Math.min(pairs[0][0], 0xffff));
        writeU16(os2, 66, Math.min(pairs[pairs.length - 1][0], 0xffff));
      }
      tables['OS/2'] = os2;
    }

    return { bytes: assembleSfnt(tables), gidMap, widths };
  }
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** post 表 v3.0：不含字形名，最小 32 字节 */
function buildPost3() {
  const buf = new Uint8Array(32);
  writeU32(buf, 0, 0x00030000);
  // 其余字段（italicAngle / underlinePosition ...）保持 0 即可
  return buf;
}

function buildCmap(pairs) {
  const bmp = pairs.filter(([cp]) => cp <= 0xffff);

  // ---- 连续段合并（相邻码位且字形号也相邻 => delta 恒定） ----
  const segments = [];
  let i = 0;
  while (i < bmp.length) {
    let j = i;
    while (
      j + 1 < bmp.length &&
      bmp[j + 1][0] === bmp[j][0] + 1 &&
      bmp[j + 1][1] === bmp[j][1] + 1
    ) {
      j++;
    }
    segments.push({
      start: bmp[i][0],
      end: bmp[j][0],
      delta: (bmp[i][1] - bmp[i][0]) & 0xffff,
    });
    i = j + 1;
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segments.length;
  const fmt4Length = 16 + segCount * 8;
  const fmt4 = new Uint8Array(fmt4Length);
  const v4 = new DataView(fmt4.buffer);
  v4.setUint16(0, 4, false);
  v4.setUint16(2, fmt4Length, false);
  v4.setUint16(4, 0, false);
  v4.setUint16(6, segCount * 2, false);
  let searchRange = 2;
  let entrySelector = 0;
  while (searchRange * 2 <= segCount * 2) {
    searchRange *= 2;
    entrySelector++;
  }
  v4.setUint16(8, searchRange, false);
  v4.setUint16(10, entrySelector, false);
  v4.setUint16(12, segCount * 2 - searchRange, false);
  const endBase = 14;
  const startBase = endBase + segCount * 2 + 2;
  const deltaBase = startBase + segCount * 2;
  segments.forEach((seg, index) => {
    v4.setUint16(endBase + index * 2, seg.end, false);
    v4.setUint16(startBase + index * 2, seg.start, false);
    v4.setUint16(deltaBase + index * 2, seg.delta, false);
  });

  // ---- format 12：覆盖全部码位（含 BMP 之外的字符） ----
  const groups = [];
  let g = 0;
  while (g < pairs.length) {
    let h = g;
    while (
      h + 1 < pairs.length &&
      pairs[h + 1][0] === pairs[h][0] + 1 &&
      pairs[h + 1][1] === pairs[h][1] + 1
    ) {
      h++;
    }
    groups.push({ start: pairs[g][0], end: pairs[h][0], gid: pairs[g][1] });
    g = h + 1;
  }
  const fmt12Length = 16 + groups.length * 12;
  const fmt12 = new Uint8Array(fmt12Length);
  const v12 = new DataView(fmt12.buffer);
  v12.setUint16(0, 12, false);
  v12.setUint16(2, 0, false);
  v12.setUint32(4, fmt12Length, false);
  v12.setUint32(8, 0, false);
  v12.setUint32(12, groups.length, false);
  groups.forEach((group, index) => {
    const p = 16 + index * 12;
    v12.setUint32(p, group.start, false);
    v12.setUint32(p + 4, group.end, false);
    v12.setUint32(p + 8, group.gid, false);
  });

  const headerLength = 4 + 2 * 8;
  const cmap = new Uint8Array(headerLength + fmt4.length + fmt12.length);
  const view = new DataView(cmap.buffer);
  view.setUint16(0, 0, false);
  view.setUint16(2, 2, false);
  view.setUint16(4, 3, false); // platform: Windows
  view.setUint16(6, 1, false); // encoding: Unicode BMP
  view.setUint32(8, headerLength, false);
  view.setUint16(12, 3, false);
  view.setUint16(14, 10, false); // encoding: Unicode full
  view.setUint32(16, headerLength + fmt4.length, false);
  cmap.set(fmt4, headerLength);
  cmap.set(fmt12, headerLength + fmt4.length);
  return cmap;
}

function assembleSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const numTables = tags.length;

  let total = 12 + numTables * 16;
  const offsets = {};
  for (const tag of tags) {
    const length = tables[tag].length;
    total += (length + 3) & ~3;
    offsets[tag] = total;
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x00010000, false);
  view.setUint16(4, numTables, false);
  let searchRange = 16;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables * 16) {
    searchRange *= 2;
    entrySelector++;
  }
  view.setUint16(6, searchRange, false);
  view.setUint16(8, entrySelector, false);
  view.setUint16(10, numTables * 16 - searchRange, false);

  let dataOffset = 12 + numTables * 16;
  tags.forEach((tag, index) => {
    const record = 12 + index * 16;
    const data = tables[tag];
    for (let i = 0; i < TAG_LEN; i++) out[record + i] = tag.charCodeAt(i);
    const checksum = tableChecksum(data, 0, data.length);
    view.setUint32(record + 4, checksum, false);
    view.setUint32(record + 8, dataOffset, false);
    view.setUint32(record + 12, data.length, false);
    out.set(data, dataOffset);
    dataOffset += (data.length + 3) & ~3;
  });

  // head.checkSumAdjustment
  const head = tables.head;
  const headDir = 12 + tags.indexOf('head') * 16;
  const headOffset = view.getUint32(headDir + 8, false);
  view.setUint32(headOffset + 8, 0, false);
  const adjustment = (0xb1b0afba - sumUint32(out)) >>> 0;
  view.setUint32(headOffset + 8, adjustment, false);
  // 目录里的 head 校验和保持“清零后”的值（规范做法）
  view.setUint32(headDir + 4, tableChecksum(head, 0, head.length), false);
  return out;
}
