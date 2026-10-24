/**
 * 词表元信息：只存「一共多少词、每页多少词」这类跨页面要用的数字。
 * 生词本页拿到 pageInfo 后写进来，顶栏与阅读页读它，避免为了一个数字重复请求后端。
 */
import { reactive } from 'vue'

export interface VocabMeta {
  totalRecord: number
  pageSize: number
  /** 是否已经从后端拿到过 pageInfo */
  checked: boolean
}

export const vocab = reactive<VocabMeta>({
  totalRecord: 0,
  pageSize: 0,
  checked: false,
})

export function setVocabMeta(meta: { totalRecord?: unknown; pageSize?: unknown }): void {
  const total = Number(meta.totalRecord)
  const size = Number(meta.pageSize)
  if (Number.isFinite(total) && total >= 0) vocab.totalRecord = Math.round(total)
  if (Number.isFinite(size) && size > 0) vocab.pageSize = Math.round(size)
  vocab.checked = true
}

export function resetVocabMeta(): void {
  vocab.totalRecord = 0
  vocab.pageSize = 0
  vocab.checked = false
}
