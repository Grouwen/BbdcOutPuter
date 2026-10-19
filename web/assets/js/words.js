/**
 * 生词本列表：只消费 /bbdc/service/getNewword/{page}，一次一页。
 */

import { api } from './api.js';
import { $, escapeHtml, formatDate, toast } from './ui.js';
import { audioOf, definitionsOf, phoneticOf, tagsOf } from './word-utils.js';

const SKELETON_COUNT = 8;

export class WordsView {
  constructor({ onSessionExpired } = {}) {
    this.onSessionExpired = onSessionExpired || (() => {});
    this.page = 0;
    this.pageInfo = null;
    this.zeroBased = true;
    this.words = [];
    this.pageSize = 24;
    this.filter = '';
    this.loading = false;
    this.authFailed = false;
    this.audio = null;
    this._bind();
  }

  get lastPage() {
    const total = Number(this.pageInfo?.totalPage) || 1;
    return this.zeroBased ? Math.max(0, total - 1) : total;
  }

  get displayPage() {
    return this.zeroBased ? this.page + 1 : this.page;
  }

  get totalPages() {
    return Number(this.pageInfo?.totalPage) || 1;
  }

  _bind() {
    $('#btnPrev')?.addEventListener('click', () => this.go(this.page - 1));
    $('#btnNext')?.addEventListener('click', () => this.go(this.page + 1));
    $('#btnRefresh')?.addEventListener('click', () => this.load(this.page));
    $('#pageInput')?.addEventListener('change', (event) => {
      const raw = Number(event.target.value);
      if (!Number.isFinite(raw)) return;
      const target = this.zeroBased ? raw - 1 : raw;
      this.go(Math.min(Math.max(target, this.zeroBased ? 0 : 1), this.lastPage));
    });
    $('#searchInput')?.addEventListener('input', (event) => {
      this.filter = event.target.value.trim().toLowerCase();
      this.renderList();
    });
  }

  /** 首次进入：探测分页规则并读取第一页 */
  async loadFirst() {
    this.renderSkeleton('正在读取生词本…');
    try {
      let data = await api.getNewword(0);
      let used = 0;
      if (!(data.wordList || []).length && Number(data.pageInfo?.totalRecord) > 0) {
        data = await api.getNewword(1);
        used = 1;
      }
      const info = data.pageInfo || {};
      const current = Number(info.currentPage);
      this.zeroBased = Number.isFinite(current) ? current === 0 : used === 0;
      this.pageInfo = info;
      this.page = Number.isFinite(current) ? current : this.zeroBased ? 0 : 1;
      this.pageSize = Number(info.pageSize) || (data.wordList || []).length || 24;
      this.words = data.wordList || [];
      this.authFailed = false;
      this.render();
      return true;
    } catch (error) {
      this.renderError(error);
      return false;
    }
  }

  async go(page) {
    if (this.loading) return;
    if (page < (this.zeroBased ? 0 : 1) || page > this.lastPage) return;
    await this.load(page);
  }

  async load(page) {
    this.loading = true;
    this.renderSkeleton('正在翻页…');
    try {
      const data = await api.getNewword(page);
      this.page = Number(data.pageInfo?.currentPage ?? page);
      this.pageInfo = data.pageInfo || this.pageInfo;
      this.words = data.wordList || [];
      this.authFailed = false;
      this.render();
    } catch (error) {
      this.renderError(error);
    } finally {
      this.loading = false;
    }
  }

  renderSkeleton(text) {
    const grid = $('#wordGrid');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: SKELETON_COUNT })
      .map(() => '<div class="skeleton"></div>')
      .join('');
    $('#wordsMeta').textContent = text;
  }

  renderError(error) {
    const message = error?.message || '未知错误';
    const needLogin = /登录|login|未注册/i.test(message);
    this.authFailed = needLogin;
    if (needLogin) this.onSessionExpired(message);

    $('#wordGrid').innerHTML = `
      <div class="state-block">
        <span class="emoji">${needLogin ? '🔒' : '⚠️'}</span>
        <h4>${needLogin ? '需要先登录' : '读取失败'}</h4>
        <p>${escapeHtml(message)}</p>
        <p>${needLogin ? '完成登录后会自动载入生词本。' : '请确认后端已启动，且接口地址配置正确。'}</p>
      </div>`;
    $('#wordsMeta').textContent = needLogin ? '未登录' : '读取失败';
    this.updatePager(true);
  }

  render() {
    const total = Number(this.pageInfo?.totalRecord) || 0;
    $('#wordsMeta').textContent =
      `共 ${total} 词 · 第 ${this.displayPage} / ${this.totalPages} 页 · 每页 ${this.pageSize} 词`;
    this.renderList();
    this.updatePager();
  }

  renderList() {
    const grid = $('#wordGrid');
    if (!grid) return;

    const keyword = this.filter;
    const visible = !keyword
      ? this.words
      : this.words.filter((item) => {
          const haystack = [
            item?.word,
            ...(item?.ultimate?.translation || []),
            ...(item?.ultimate?.definition || []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(keyword);
        });

    if (!this.words.length) {
      grid.innerHTML = `
        <div class="state-block">
          <span class="emoji">🫧</span>
          <h4>这一页没有生词</h4>
          <p>生词本可能是空的，或者这一页刚好没有内容。</p>
        </div>`;
      return;
    }

    if (!visible.length) {
      grid.innerHTML = `
        <div class="state-block">
          <span class="emoji">🔍</span>
          <h4>本页没有匹配「${escapeHtml(this.filter)}」的词</h4>
          <p>搜索只作用于当前页，翻页后再试试。</p>
        </div>`;
      return;
    }

    const offset = this.zeroBased ? this.page * this.pageSize : (this.page - 1) * this.pageSize;
    grid.innerHTML = visible
      .map((item) => {
        const absolute = offset + this.words.indexOf(item) + 1;
        const defs = definitionsOf(item);
        const tags = tagsOf(item);
        const audio = audioOf(item);
        const phonetic = phoneticOf(item);
        return `
          <article class="word-card">
            <span class="no">${String(absolute).padStart(2, '0')}</span>
            <div class="wc-head">
              <h4 class="wc-word">${escapeHtml(item.word)}</h4>
              ${phonetic ? `<span class="wc-phonetic">${escapeHtml(phonetic)}</span>` : ''}
            </div>
            <div class="wc-defs">
              ${
                defs.length
                  ? defs
                      .map(
                        (def) =>
                          `<p>${def.pos ? `<span class="pos">${escapeHtml(def.pos)}</span>` : ''}${escapeHtml(def.text)}</p>`,
                      )
                      .join('')
                  : '<p style="color:#b0a69e">暂无释义</p>'
              }
            </div>
            ${
              tags.length
                ? `<div class="wc-tags">${tags
                    .map((tag) => `<span class="tag${tag.hot ? ' hot' : ''}">${escapeHtml(tag.text)}</span>`)
                    .join('')}</div>`
                : ''
            }
            <div class="wc-foot">
              <span>${escapeHtml(formatDate(item.updatetime) || '—')} 加入</span>
              ${
                audio
                  ? `<button class="icon-btn" type="button" data-audio="${escapeHtml(audio)}" aria-label="播放 ${escapeHtml(item.word)} 的发音">
                       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor"/><path d="M15 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                     </button>`
                  : '<span></span>'
              }
            </div>
          </article>`;
      })
      .join('');

    grid.querySelectorAll('[data-audio]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.getAttribute('data-audio');
        if (!url) return;
        this.audio?.pause?.();
        this.audio = new Audio(url);
        this.audio.play().catch(() => toast('发音播放失败', 'err'));
      });
    });
  }

  updatePager(disabled = false) {
    const prev = $('#btnPrev');
    const next = $('#btnNext');
    const input = $('#pageInput');
    const total = $('#pageTotal');
    if (!prev || !next) return;

    prev.disabled = disabled || this.displayPage <= 1;
    next.disabled = disabled || this.displayPage >= this.totalPages;
    if (input) {
      input.min = '1';
      input.max = String(this.totalPages);
      input.value = String(this.displayPage);
      input.disabled = disabled;
    }
    if (total) total.textContent = String(this.totalPages);
  }
}
