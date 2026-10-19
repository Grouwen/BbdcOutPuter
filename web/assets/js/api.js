/**
 * 后端接口封装。只调用项目里已定义的路由，不臆造任何新接口。
 *
 *  GET  /bbdc/login/qrcode            SSE，二维码登录状态流
 *  POST /bbdc/login/phone             手机验证码登录
 *  GET  /bbdc/login/getAuthCode       取图形验证码
 *  POST /bbdc/login/getPhoneCode      取短信验证码
 *  POST /bbdc/login/autoLogin         检测登录态
 *  GET  /bbdc/service/getNewword/{n}  分页生词（含释义）
 *
 * 统一返回体：{ code: 200, message: 'ok', data: {...} }
 */

import { loadSettings } from './config.js';

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status || 0;
    this.code = options.code || 0;
    this.kind = options.kind || 'api';
  }
}

function baseUrl() {
  return (loadSettings().apiBase || '').replace(/\/+$/, '');
}

export function joinUrl(base, path) {
  return `${(base || '').replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {string} path
 * @param {{method?:string, body?:object, signal?:AbortSignal, timeout?:number}} options
 */
async function request(path, options = {}) {
  const { method = 'GET', body, signal, timeout = 30000 } = options;
  const url = joinUrl(baseUrl(), path);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (timedOut) throw new ApiError(`请求超时（${timeout / 1000}s）：${path}`, { kind: 'timeout' });
    if (signal?.aborted) throw new ApiError('已取消', { kind: 'abort' });
    throw new ApiError(`无法连接后端 ${url}，请检查服务是否启动、地址是否正确`, { kind: 'network' });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(`接口返回 HTTP ${response.status}${text ? `：${text.slice(0, 120)}` : ''}`, {
      status: response.status,
    });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ApiError(`接口返回的不是 JSON，可能命中了错误路由：${path}`, { kind: 'parse' });
  }

  if (payload && typeof payload.code !== 'undefined' && payload.code !== 200) {
    throw new ApiError(payload.message || '接口返回异常', { code: payload.code });
  }
  return payload?.data ?? {};
}

export const api = {
  /** 检测登录态 */
  autoLogin() {
    return request('/bbdc/login/autoLogin', { method: 'POST' });
  },

  /** 单页生词，page 由后端决定起始值（0 或 1） */
  getNewword(page, { signal } = {}) {
    return request(`/bbdc/service/getNewword/${page}`, { signal, timeout: 45000 });
  },

  /** 图形验证码：{ url, token } */
  getAuthCode() {
    return request('/bbdc/login/getAuthCode');
  },

  /** 短信验证码 */
  getPhoneCode({ phoneNumber, authCode, token }) {
    return request('/bbdc/login/getPhoneCode', {
      method: 'POST',
      body: {
        phone_number: Number(phoneNumber),
        auth_code: authCode,
        token,
        code: '',
      },
    });
  },

  /** 手机号登录 */
  loginByPhone({ phoneNumber, authCode, token, code }) {
    return request('/bbdc/login/phone', {
      method: 'POST',
      body: {
        phone_number: Number(phoneNumber),
        auth_code: authCode,
        token,
        code,
      },
    });
  },

  /** SSE 地址（EventSource 需要直接拿到 URL） */
  qrcodeStreamUrl() {
    return joinUrl(baseUrl(), '/bbdc/login/qrcode');
  },
};

/** 把后端返回的服务器绝对路径转成可访问的 URL（图片类） */
export function resolveAssetUrl(serverPath) {
  if (!serverPath) return '';
  if (/^https?:\/\//i.test(serverPath)) return serverPath;
  const settings = loadSettings();
  const base = (settings.assetBase || settings.apiBase || '').replace(/\/+$/, '');
  const marker = '/output/';
  const index = serverPath.indexOf(marker);
  const relative = index >= 0 ? serverPath.slice(index + marker.length) : serverPath.split(/[\\/]/).pop();
  return `${base}/output/${relative}`;
}
