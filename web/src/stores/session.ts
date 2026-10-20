/**
 * 登录态：唯一事实来源是 POST /bbdc/login/autoLogin 的 data.is_login。
 *
 * 这里只维护状态，不做跳转；跳转由 App.vue 监听 isLogin 变化统一处理，
 * 避免 session ← → router 互相依赖。
 */
import { reactive } from 'vue'
import { api } from '@/api'
import { toast } from '@/stores/toast'

export type StatusKind = 'unknown' | 'busy' | 'on' | 'off'

export interface SessionState {
  /** 是否已完成一次 autoLogin 检测 */
  checked: boolean
  isLogin: boolean
  /** 顶栏状态点：unknown / busy / on / off */
  status: StatusKind
  statusText: string
}

export const session = reactive<SessionState>({
  checked: false,
  isLogin: false,
  status: 'unknown',
  statusText: '未检测',
})

function setStatus(kind: StatusKind, text: string): void {
  session.status = kind
  session.statusText = text
}

/**
 * 真正打后端的那一次检测。
 * 后端没起 / 地址填错时停在登录页并明确提示，不猜测登录态。
 */
async function run(): Promise<boolean> {
  setStatus('busy', '检测登录状态')

  try {
    const data = await api.autoLogin()
    session.isLogin = data?.is_login === true
  } catch (error) {
    session.checked = true
    session.isLogin = false
    setStatus('off', '连接失败')
    toast((error as Error)?.message || '无法连接后端', 'err', 6000)
    return false
  }

  session.checked = true
  setStatus(session.isLogin ? 'on' : 'off', session.isLogin ? '已登录' : '未登录')
  return session.isLogin
}

/** 正在飞行中的那一次检测；并发触发时复用它，避免重复打 autoLogin */
let inflight: Promise<boolean> | null = null

/**
 * 检测登录态（单飞）。
 * 正常路径下等价于直接调用 run()；只有「守卫检查 + refresh() 撞车」这类
 * 并发场景才会被合并成一次请求。
 */
export async function check(): Promise<boolean> {
  if (inflight) return inflight
  inflight = run()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/** 登录成功：以后端保存的 cookie 为准，重新走一遍 check */
export async function refresh(): Promise<boolean> {
  session.checked = false
  return check()
}

/** 会话失效：回到未登录态（跳转由 App.vue 监听 isLogin 完成） */
export function expire(message?: string): void {
  setStatus('off', '未登录')
  session.isLogin = false
  if (message) toast(message, 'err', 5000)
}
