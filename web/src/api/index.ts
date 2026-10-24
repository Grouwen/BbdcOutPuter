/**
 * 后端接口封装。只调用项目里已定义的路由，不臆造任何新接口。
 *
 *  GET  /bbdc/login/qrcode                 SSE，二维码登录状态流
 *  POST /bbdc/login/phone                  手机验证码登录
 *  GET  /bbdc/login/getAuthCode            取图形验证码
 *  POST /bbdc/login/getPhoneCode           取短信验证码
 *  POST /bbdc/login/autoLogin              检测登录态
 *  GET  /bbdc/service/getNewword/{n}       分页生词（含释义）
 *  POST /llm/generate/readComprehension    按生词本生成阅读文章与题目（SSE）
 *
 * 统一返回体：{ code: 200, message: 'ok', data: {...} }
 */
import { joinUrl, request } from './client'
import { streamSse } from './sse'
import { settings } from '@/stores/settings'
import type { AuthCodeResult, AutoLoginResult, SseFrame, WordPage } from '@/types'

export { ApiError, joinUrl } from './client'

export interface PhoneCodeParams {
  phoneNumber: string
  authCode: string
  token: string
}

export interface PhoneLoginParams extends PhoneCodeParams {
  code: string
}

export interface StreamReadingOptions {
  signal?: AbortSignal
  onFrame: (frame: SseFrame) => void
}

export const api = {
  /** 检测登录态 */
  autoLogin(): Promise<AutoLoginResult> {
    return request<AutoLoginResult>('/bbdc/login/autoLogin', { method: 'POST' })
  },

  /** 单页生词，page 由后端决定起始值（0 或 1） */
  getNewword(page: number, { signal }: { signal?: AbortSignal } = {}): Promise<WordPage> {
    return request<WordPage>(`/bbdc/service/getNewword/${page}`, { signal, timeout: 45000 })
  },

  /** 图形验证码：{ url, token } */
  getAuthCode(): Promise<AuthCodeResult> {
    return request<AuthCodeResult>('/bbdc/login/getAuthCode')
  },

  /** 短信验证码 */
  getPhoneCode({ phoneNumber, authCode, token }: PhoneCodeParams): Promise<unknown> {
    return request('/bbdc/login/getPhoneCode', {
      method: 'POST',
      body: {
        phone_number: Number(phoneNumber),
        auth_code: authCode,
        token,
        code: '',
      },
    })
  },

  /** 手机号登录 */
  loginByPhone({ phoneNumber, authCode, token, code }: PhoneLoginParams): Promise<unknown> {
    return request('/bbdc/login/phone', {
      method: 'POST',
      body: {
        phone_number: Number(phoneNumber),
        auth_code: authCode,
        token,
        code,
      },
    })
  },

  /**
   * 阅读文章生成：POST + text/event-stream。
   * 后端不接受任何参数，直接取当前账号生词本里的全部单词；
   * 这里只负责把流读出来，事件语义在 stores/reading 里处理。
   */
  readComprehension({ signal, onFrame }: StreamReadingOptions): Promise<void> {
    return streamSse('/llm/generate/readComprehension', { method: 'POST', signal, onFrame })
  },

  /** SSE 地址（EventSource 需要直接拿到 URL） */
  qrcodeStreamUrl(): string {
    return joinUrl((settings.apiBase || '').replace(/\/+$/, ''), '/bbdc/login/qrcode')
  },
}

/** 把后端返回的服务器绝对路径转成可访问的 URL（图片类） */
export function resolveAssetUrl(serverPath: string): string {
  if (!serverPath) return ''
  if (/^https?:\/\//i.test(serverPath)) return serverPath
  const base = (settings.assetBase || settings.apiBase || '').replace(/\/+$/, '')
  const marker = '/output/'
  const index = serverPath.indexOf(marker)
  const relative = index >= 0 ? serverPath.slice(index + marker.length) : serverPath.split(/[\\/]/).pop() || ''
  return `${base}/output/${relative}`
}
