/**
 * 应用入口：视图切换、登录回调、全量抓取 + PDF 导出编排。
 */

import { api } from './api.js';
import { loadSettings, resetSettings, saveSettings } from './config.js';
import { FetchCancelled, WordFetcher } from './fetcher.js';
import { exportWordlistPdf, prefetchTypefaces } from './exporter.js';
import { LoginView } from './login.js';
import { MODES } from './pdf/wordlist.js';
import { $, $$, toast } from './ui.js';
import { WordsView } from './words.js';

const state = {
  fetcher: new WordFetcher(),
  busy: false,
  controller: null,
  view: 'login',
  startedAt: 0,
};

/* ------------------------------------------------------------ 基础 UI */

function setStatus(kind, text) {
  const pill = $('#loginStatus');
  if (!pill) return;
  pill.dataset.state = kind;
  $('#loginStatusText').textContent = text;
}

function showView(name) {
  state.view = name;
  $('#viewLogin').hidden = name !== 'login';
  $('#viewWords').hidden = name !== 'words';
  $('#btnJumpLogin').hidden = name !== 'words';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sessionExpired(message) {
  setStatus('off', '未登录');
  showView('login');
  if (message) toast(message, 'err', 5000);
}

/* ------------------------------------------------------------ 统计 */

function updateStats({ words, pages, seconds }) {
  $('#fetchStats').hidden = false;
  if (typeof words === 'number') $('#statWords').textContent = String(words);
  if (typeof pages === 'number') $('#statPages').textContent = String(pages);
  if (typeof seconds === 'number') $('#statTime').textContent = seconds.toFixed(1);
}

function setProgress({ ratio = 0, text = '', count = '' }) {
  $('#progress').hidden = false;
  $('#progressFill').style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  if (text) $('#progressText').textContent = text;
  if (count !== null) $('#progressCount').textContent = count;
}

function hideProgress() {
  $('#progress').hidden = true;
  $('#progressFill').style.width = '0%';
}

/* ------------------------------------------------------------ 导出面板 */

function readDelay() {
  let min = Number($('#delayMin').value);
  let max = Number($('#delayMax').value);
  if (!Number.isFinite(min) || min < 0) min = 0;
  if (!Number.isFinite(max) || max < 0) max = 0;
  if (min > max) [min, max] = [max, min];
  $('#delayMin').value = String(min);
  $('#delayMax').value = String(max);
  $('#delayHint').textContent = `${min} – ${max} ms`;
  saveSettings({ delayMin: min, delayMax: max });
  return { min, max };
}

function currentMode() {
  return $('input[name="mode"]:checked')?.value || 'both';
}

function renderFetchProgress(payload) {
  const { phase, done = 0, total = 0, page = 0, waitMs = 0, words = 0 } = payload;
  const ratio = total ? done / total : 0.02;
  if (phase === 'probing') {
    setProgress({ ratio: 0.02, text: '读取第一页，确认分页规则…', count: '0 / ?' });
  } else if (phase === 'waiting') {
    setProgress({
      ratio,
      text: `随机等待 ${waitMs} ms，避免触发限流…`,
      count: `${done} / ${total} 页`,
    });
  } else if (phase === 'fetching') {
    setProgress({ ratio, text: `抓取第 ${page} 页…`, count: `${done} / ${total} 页` });
  } else if (phase === 'done') {
    setProgress({ ratio: 1, text: '全部页面抓取完成', count: `${total} / ${total} 页` });
  }
  if (typeof words === 'number') {
    updateStats({ words, pages: done, seconds: (Date.now() - state.startedAt) / 1000 });
  }
}

async function runExport() {
  if (state.busy) return;
  const mode = currentMode();
  const { min, max } = readDelay();

  state.busy = true;
  state.controller = new AbortController();
  const startedAt = Date.now();
  state.startedAt = startedAt;
  $('#btnExport').disabled = true;
  $('#btnCancel').hidden = false;
  $('#progress').hidden = false;

  try {
    let result;
    if (state.fetcher.hasAllPages) {
      result = {
        words: state.fetcher.collectWords(),
        totalPages: state.fetcher.totalPages,
        elapsedMs: state.fetcher.elapsedMs,
      };
      setProgress({ ratio: 1, text: '复用已抓取的全部单词', count: `${result.totalPages} 页` });
    } else {
      result = await state.fetcher.fetchAll({
        minDelay: min,
        maxDelay: max,
        signal: state.controller.signal,
        onProgress: renderFetchProgress,
      });
    }

    if (!result.words.length) throw new Error('生词本为空，没有可导出的单词');

    updateStats({
      words: result.words.length,
      pages: result.totalPages,
      seconds: (Date.now() - startedAt) / 1000,
    });

    setProgress({ ratio: 0.65, text: '准备排版…', count: '' });
    const exported = await exportWordlistPdf({
      words: result.words,
      mode,
      onProgress: (progress) => {
        if (progress.phase === 'font') {
          setProgress({
            ratio: 0.65 + progress.ratio * 0.25,
            text: progress.text,
            count: '',
          });
        } else if (progress.phase === 'render') {
          setProgress({ ratio: 0.94, text: '按 A4 版式排版…', count: '' });
        } else if (progress.phase === 'done') {
          setProgress({ ratio: 1, text: '已生成，正在下载', count: '' });
        }
      },
    });

    updateStats({
      words: exported.words,
      pages: result.totalPages,
      seconds: (Date.now() - startedAt) / 1000,
    });
    toast(
      `已导出《${exported.filename}》· ${exported.pages} 页 · ${exported.sizeText}`,
      'ok',
      6000,
    );
    $('#btnExportLabel').textContent = '重新导出 PDF';
  } catch (error) {
    if (error instanceof FetchCancelled) {
      toast(`已取消。已抓取 ${state.fetcher.cachedPages} 页，进度已保留，可再次点击继续`, 'info', 5000);
      setProgress({ ratio: 0, text: '已取消', count: '' });
    } else {
      const message = error?.message || '导出失败';
      toast(message, 'err', 6000);
      setProgress({ ratio: 0, text: `失败：${message}`, count: '' });
      if (/登录|未注册/i.test(message)) sessionExpired();
    }
  } finally {
    state.busy = false;
    state.controller = null;
    $('#btnExport').disabled = false;
    $('#btnCancel').hidden = true;
  }
}

function bindExportPanel() {
  const settings = loadSettings();

  $('#delayMin').value = String(settings.delayMin);
  $('#delayMax').value = String(settings.delayMax);
  $('#delayHint').textContent = `${settings.delayMin} – ${settings.delayMax} ms`;

  const modeInput = $(`input[name="mode"][value="${settings.mode}"]`);
  if (modeInput) modeInput.checked = true;

  $$('#delayMin, #delayMax').forEach((input) => {
    input.addEventListener('change', readDelay);
  });

  $$('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => saveSettings({ mode: currentMode() }));
  });

  $('#btnExport').addEventListener('click', runExport);
  $('#btnCancel').addEventListener('click', () => {
    state.controller?.abort();
  });
}

/* ------------------------------------------------------------ 设置 */

function openSettings() {
  const settings = loadSettings();
  $('#apiBase').value = settings.apiBase;
  $('#assetBase').value = settings.assetBase;
  $('#settingsDialog').showModal();
}

function bindSettings() {
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnSaveSettings').addEventListener('click', async () => {
    const apiBase = ($('#apiBase').value || '').trim();
    const assetBase = ($('#assetBase').value || '').trim();
    saveSettings({ apiBase: apiBase.replace(/\/+$/, ''), assetBase: assetBase.replace(/\/+$/, '') });
    $('#settingsDialog').close();
    toast('设置已保存，正在重新连接…', 'info');
    state.fetcher.reset();
    await bootstrap();
  });
  $('#btnResetSettings').addEventListener('click', () => {
    const defaults = resetSettings();
    $('#apiBase').value = defaults.apiBase;
    $('#assetBase').value = defaults.assetBase;
    toast('已恢复默认设置', 'info');
  });
}

/* ------------------------------------------------------------ 启动 */

const wordsView = new WordsView({ onSessionExpired: (message) => sessionExpired(message) });

/**
 * 登录态完全由 POST /bbdc/login/autoLogin 的 data.is_login 决定：
 *   true  → 载入生词本
 *   false → 显示登录页
 */
async function bootstrap() {
  setStatus('busy', '检测登录状态');

  let isLogin = false;
  try {
    const data = await api.autoLogin();
    isLogin = data?.is_login === true;
  } catch (error) {
    // 后端没起 / 地址填错：停在登录页并明确提示，不猜测登录态
    setStatus('off', '连接失败');
    showView('login');
    toast(error?.message || '无法连接后端', 'err', 6000);
    return false;
  }

  if (!isLogin) {
    setStatus('off', '未登录');
    showView('login');
    return false;
  }

  return enterWords();
}

/** 已登录：拉第一页生词并进入生词本视图 */
async function enterWords() {
  const ok = await wordsView.loadFirst();
  if (ok) {
    setStatus('on', '已登录');
    showView('words');
    prefetchTypefaces();
    return true;
  }

  // 读取失败分两种：鉴权问题回登录页，其余留在列表页展示错误态与重试入口
  if (wordsView.authFailed) {
    setStatus('off', '未登录');
    showView('login');
  } else {
    setStatus('on', '已登录');
    showView('words');
  }
  return false;
}

const loginView = new LoginView({
  onSuccess: async () => {
    loginView.dispose();
    // 登录成功后重新走一遍 autoLogin，确保以后端保存的 cookie 为准
    await bootstrap();
  },
});

function bindGlobal() {
  $('#btnJumpLogin').addEventListener('click', () => {
    loginView.dispose();
    showView('login');
  });

  // 从登录页切回来时重新检测一次
  $('#btnRetryAuto')?.addEventListener('click', () => bootstrap());

  window.addEventListener('online', () => toast('网络已恢复', 'info'));
}

bindExportPanel();
bindSettings();
bindGlobal();
bootstrap();

// 便于调试
window.__app = { state, wordsView, loginView, MODES };
