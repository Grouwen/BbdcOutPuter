/**
 * 本机配置：接口地址、静态资源地址、导出偏好。
 * 全部保存在 localStorage，刷新后仍然生效。
 */
import { reactive } from 'vue'
import type { Settings } from '@/types'

const STORAGE_KEY = 'bbdc.wordlist.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  // 空字符串 = 与页面同源。集成到后端后由 FastAPI 直接托管，无需配置。
  // 开发期由 vite.config.ts 的 proxy 把 /bbdc 与 /output 转发到后端，
  // 所以这里依然可以留空；只有部署在不同域名时才需要填完整地址。
  apiBase: '',
  assetBase: '',
  mode: 'both',
  delayMin: 300,
  delayMax: 900,
}

function read(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}
    return { ...DEFAULT_SETTINGS, ...stored }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** 全局唯一的配置对象（响应式），启动时读一次，等价于原 loadSettings 的模块级缓存 */
export const settings = reactive<Settings>(read())

export function saveSettings(patch: Partial<Settings>): Settings {
  Object.assign(settings, patch)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }))
  } catch {
    /* 隐私模式下可能不可写，忽略 */
  }
  return settings
}

export function resetSettings(): Settings {
  Object.assign(settings, DEFAULT_SETTINGS)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return settings
}
