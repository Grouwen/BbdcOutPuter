/**
 * 导出编排：加载中文字体 → 浏览器内排版 → 下载 PDF。
 *
 * 字体只加载一次（模块级缓存）：思源黑体 10.5MB，裁成只含本次用到的字形后
 * 嵌入 PDF，导出的文件通常只有几十 KB。
 */

import { TrueTypeFont } from './pdf/ttf.js';
import { buildWordlistPdf, MODES } from './pdf/wordlist.js';
import { formatBytes, timestamp } from './ui.js';

const REGULAR_URL = new URL('../fonts/NotoSansSC-Regular.ttf', import.meta.url).href;
const BOLD_URL = new URL('../fonts/NotoSansSC-Bold.subset.ttf', import.meta.url).href;

/** @type {Map<string, Promise<TrueTypeFont>>} */
const typefaceCache = new Map();

async function fetchWithProgress(url, onProgress) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`字体加载失败（HTTP ${response.status}）`);
  const total = Number(response.headers.get('content-length')) || 0;

  if (!response.body || !total) {
    const buffer = await response.arrayBuffer();
    onProgress?.(1);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(1, received / total));
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

/**
 * 加载并解析字体（带缓存）
 * @param {string} url
 * @param {(ratio:number)=>void} [onProgress]
 */
export function loadTypeface(url, onProgress) {
  const cached = typefaceCache.get(url);
  if (cached) {
    onProgress?.(1);
    return cached;
  }
  const promise = (async () => {
    const buffer = await fetchWithProgress(url, onProgress);
    return new TrueTypeFont(buffer);
  })();
  typefaceCache.set(url, promise);
  // 失败时不要把坏结果留在缓存里
  promise.catch(() => typefaceCache.delete(url));
  return promise;
}

/** 预热字体，用户点开导出面板时后台下载，点导出就很快 */
export function prefetchTypefaces() {
  loadTypeface(REGULAR_URL, undefined).catch(() => {});
  loadTypeface(BOLD_URL, undefined).catch(() => {});
}

export function isTypefaceReady() {
  return typefaceCache.has(REGULAR_URL);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 生成并下载 PDF
 * @param {{words:{word:string,meaning:string}[], mode:'both'|'en'|'zh', onProgress?:(p:object)=>void}} options
 */
export async function exportWordlistPdf({ words, mode, onProgress }) {
  if (!words || !words.length) throw new Error('没有可导出的单词');
  const started = Date.now();

  onProgress?.({ phase: 'font', ratio: 0, text: '加载中文字体（首次约 10MB，之后走缓存）' });
  const regular = await loadTypeface(REGULAR_URL, (ratio) => {
    onProgress?.({ phase: 'font', ratio, text: `加载中文字体 ${Math.round(ratio * 100)}%` });
  });

  let bold;
  try {
    bold = await loadTypeface(BOLD_URL);
  } catch {
    bold = undefined; // 缺粗体时退化为 Helvetica-Bold 表头
  }

  onProgress?.({ phase: 'render', ratio: 0, text: '排版中…' });
  const bytes = await buildWordlistPdf({
    words: words.map(({ word, meaning }) => ({ word, meaning: meaning || '—' })),
    mode,
    typefaces: { regular, bold },
    meta: {
      title: `单词默写 · ${MODES[mode]?.label || mode}`,
      subject: '由生词本默写工坊生成',
    },
  });

  const label = MODES[mode]?.label || mode;
  const filename = `单词默写_${label}_${timestamp()}.pdf`;
  saveBlob(new Blob([bytes], { type: 'application/pdf' }), filename);

  const pages = Math.max(1, Math.ceil(words.length / (MODES[mode]?.perPage || 20)));
  onProgress?.({ phase: 'done', ratio: 1, text: '已生成' });

  return {
    filename,
    bytes: bytes.length,
    pages,
    words: words.length,
    elapsedMs: Date.now() - started,
    sizeText: formatBytes(bytes.length),
  };
}
