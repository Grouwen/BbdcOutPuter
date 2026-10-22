/**
 * 乱序导出用的洗牌工具。
 *
 * 只做一件事：把数组顺序随机打乱后返回一个新数组（不改原数组）。
 * 用 Fisher–Yates，每个排列等概率，且天然避免 "sort(() => Math.random() - 0.5)"
 * 那种分布不均的写法（V8 里那种洗牌会让某些位置显著偏多）。
 *
 * 单词和它的释义始终在同一个对象里，洗牌只会改「行」的先后，
 * 不会把单词和释义拆开配对。
 */

/** 可注入的随机源，默认 Math.random；测试时可换成定值序列 */
export type RandomSource = () => number

/** Fisher–Yates 洗牌，返回新数组 */
export function shuffleArray<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i -= 1) {
    // 防御性处理：注入的随机源可能返回 0/负数/NaN/1 以上
    const value = Number(random())
    const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999) : 0
    const j = Math.floor(safe * (i + 1))
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}

/** 判断两个顺序是否完全一致（洗牌后可能偶然保持原序，用于日志/提示） */
export function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

/**
 * 可复现的伪随机源（mulberry32）。
 * 生产逻辑不需要，导出失败排查、以及自动化测试里复现同一份 PDF 时有用。
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
