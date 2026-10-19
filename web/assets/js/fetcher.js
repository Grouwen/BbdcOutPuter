/**
 * 全量抓取器。
 *
 * 后端只有「单页」接口，因此这里循环调用 GET /bbdc/service/getNewword/{page}，
 * 并在每次请求之间插入用户设定的随机延迟（min ~ max 毫秒），避免触发限流。
 *
 * 特性：
 *  - 兼容 page 从 0 或 1 开始的两种情况（依据 pageInfo.currentPage 判断）
 *  - 缓存已抓取的页，取消/失败后再次点击可断点续抓
 *  - 支持 AbortSignal 取消（连等待中的延迟也会被打断）
 */

import { api } from './api.js';
import { randomInt, sleep } from './ui.js';
import { meaningOf } from './word-utils.js';

export class FetchCancelled extends Error {
  constructor() {
    super('已取消');
    this.name = 'FetchCancelled';
  }
}

function isAbort(error) {
  return (
    error?.name === 'AbortError' ||
    error?.kind === 'abort' ||
    error?.message === '已取消' ||
    /aborted/i.test(error?.message || '')
  );
}

export class WordFetcher {
  constructor() {
    /** @type {Map<number, any[]>} 页码 -> 词条数组 */
    this.pages = new Map();
    this.pageInfo = null;
    this.startPage = 0;
    this.lastPage = 0;
    this.zeroBased = true;
    this.requestCount = 0;
    this.elapsedMs = 0;
  }

  get totalPages() {
    return Math.max(1, this.lastPage - this.startPage + 1);
  }

  get cachedPages() {
    return this.pages.size;
  }

  get hasAllPages() {
    if (!this.pageInfo) return false;
    return this.cachedPages >= this.totalPages;
  }

  get wordCount() {
    return this.collectWords().length;
  }

  reset() {
    this.pages.clear();
    this.pageInfo = null;
    this.requestCount = 0;
    this.elapsedMs = 0;
  }

  /** 首次探测：确定分页起点、总页数，同时拿到第一页数据 */
  async probe(signal) {
    const tried = [];
    let data = null;
    let lastError = null;
    let usedPage = 0;

    for (const page of [0, 1]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await api.getNewword(page, { signal });
        this.requestCount += 1;
        tried.push(page);
        data = result;
        usedPage = page;
        const info = result.pageInfo || {};
        const hasWords = (result.wordList || []).length > 0;
        // 有词，或确实是空词库 —— 视为有效结果
        if (hasWords || !(Number(info.totalRecord) > 0)) break;
      } catch (error) {
        if (isAbort(error)) throw new FetchCancelled();
        lastError = error;
      }
    }

    if (!data) throw lastError || new Error('无法获取第一页数据');

    this.pageInfo = data.pageInfo || {};
    const current = Number(this.pageInfo.currentPage);
    if (Number.isFinite(current)) {
      this.zeroBased = current === 0;
    } else {
      this.zeroBased = usedPage === 0;
    }
    this.startPage = this.zeroBased ? 0 : 1;

    const totalPage = Number(this.pageInfo.totalPage) || 0;
    const pageSize = Number(this.pageInfo.pageSize) || (data.wordList || []).length || 24;
    const totalRecord = Number(this.pageInfo.totalRecord) || 0;
    const inferred = totalRecord ? Math.ceil(totalRecord / pageSize) : 1;
    const count = totalPage || inferred;
    this.lastPage = this.zeroBased ? Math.max(0, count - 1) : count;

    return { page: this.startPage, wordList: data.wordList || [] };
  }

  /**
   * 抓取全部页面
   * @param {{minDelay:number, maxDelay:number, signal?:AbortSignal, onProgress?:(p:object)=>void}} options
   */
  async fetchAll({ minDelay = 300, maxDelay = 900, signal, onProgress } = {}) {
    const startedAt = Date.now();
    const report = (patch) => onProgress?.({ ...patch });

    if (!this.pageInfo) {
      report({ phase: 'probing', done: 0, total: 0, words: 0 });
      const first = await this.probe(signal);
      this.pages.set(first.page, first.wordList);
    }

    const total = this.totalPages;
    let done = this.pages.size;
    report({ phase: 'fetching', done, total, words: this.wordCount, page: this.startPage });

    for (let page = this.startPage; page <= this.lastPage; page += 1) {
      if (this.pages.has(page)) continue;
      if (signal?.aborted) throw new FetchCancelled();

      // 两次真实请求之间插入随机等待
      if (this.requestCount > 0 && (minDelay > 0 || maxDelay > 0)) {
        const waitMs = randomInt(Math.max(0, minDelay), Math.max(minDelay, maxDelay));
        report({ phase: 'waiting', waitMs, done, total, words: this.wordCount, page });
        try {
          await sleep(waitMs, signal);
        } catch {
          throw new FetchCancelled();
        }
      }

      report({ phase: 'fetching', done, total, words: this.wordCount, page });
      let result;
      try {
        // eslint-disable-next-line no-await-in-loop
        result = await api.getNewword(page, { signal });
      } catch (error) {
        if (isAbort(error)) throw new FetchCancelled();
        throw error;
      }
      this.requestCount += 1;
      this.pages.set(page, result.wordList || []);
      if (result.pageInfo?.totalPage) this.pageInfo.totalPage = result.pageInfo.totalPage;
      done += 1;
      report({ phase: 'fetching', done, total, words: this.wordCount, page });
    }

    this.elapsedMs = Date.now() - startedAt;
    const words = this.collectWords();
    report({ phase: 'done', done: total, total, words: words.length });

    return {
      words,
      totalPages: total,
      pagesFetched: this.pages.size,
      elapsedMs: this.elapsedMs,
      pageInfo: this.pageInfo,
    };
  }

  /** 按页码顺序合并、按单词去重，并生成 PDF 需要的 {word, meaning} */
  collectWords() {
    const seen = new Set();
    const words = [];
    const keys = [...this.pages.keys()].sort((a, b) => a - b);
    for (const page of keys) {
      for (const item of this.pages.get(page) || []) {
        const key = String(item?.word || '').trim();
        if (!key || seen.has(key.toLowerCase())) continue;
        seen.add(key.toLowerCase());
        words.push({
          word: key,
          meaning: meaningOf(item),
          raw: item,
        });
      }
    }
    return words;
  }
}
