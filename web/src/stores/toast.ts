/** 全局提示（Toast）队列：组件只负责把它渲染出来。 */
import { reactive } from 'vue'

export type ToastType = 'info' | 'ok' | 'err'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  /** 正在淡出，180ms 后从列表移除 */
  leaving: boolean
}

export const toasts = reactive<ToastItem[]>([])

let seq = 0

export function dismiss(id: number): void {
  const item = toasts.find((entry) => entry.id === id)
  if (!item || item.leaving) return
  item.leaving = true
  setTimeout(() => {
    const index = toasts.findIndex((entry) => entry.id === id)
    if (index >= 0) toasts.splice(index, 1)
  }, 180)
}

export function toast(message: string, type: ToastType = 'info', duration = 3600): number {
  const id = ++seq
  toasts.push({ id, message, type, leaving: false })
  setTimeout(() => dismiss(id), duration)
  return id
}
