/** 轻量 UI 工具：DOM 查询、转义、Toast、可中断的随机延迟 */

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastHost = null;

export function toast(message, type = 'info', duration = 3600) {
  if (!toastHost) toastHost = document.getElementById('toasts');
  if (!toastHost) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.setAttribute('role', type === 'err' ? 'alert' : 'status');
  node.textContent = message;
  toastHost.appendChild(node);
  const remove = () => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 180);
  };
  node.addEventListener('click', remove);
  setTimeout(remove, duration);
}

/** 可被 AbortSignal 中断的 sleep */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 闭区间随机整数 */
export function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function formatDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function timestamp(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}
