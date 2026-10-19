/**
 * 本机配置：接口地址、静态资源地址、导出偏好。
 * 全部保存在 localStorage，刷新后仍然生效。
 */

const STORAGE_KEY = 'bbdc.wordlist.settings.v1';

export const DEFAULT_SETTINGS = {
  // 空字符串 = 与页面同源。集成到后端后由 FastAPI 直接托管，无需配置。
  // 单独用静态服务器调试时，dev_server.py 会把 /bbdc 与 /output 反向代理到后端，
  // 所以这里依然可以留空；只有部署在不同域名时才需要填完整地址。
  apiBase: '',
  assetBase: '',
  mode: 'both',
  delayMin: 300,
  delayMax: 900,
};

let cache = null;

export function loadSettings() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  cache = { ...DEFAULT_SETTINGS, ...stored };
  return cache;
}

export function saveSettings(patch) {
  cache = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
  return cache;
}

export function resetSettings() {
  cache = { ...DEFAULT_SETTINGS };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return cache;
}
