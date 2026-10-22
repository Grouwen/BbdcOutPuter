<script setup lang="ts">
/**
 * 导出面板：选模式 → 抓详情 → 浏览器内排版 → 下载 PDF。
 *
 * 抓取部分交给 lib/fetcher（全应用共享实例，可断点续抓），
 * 这里的职责只有：把用户选择、进度、统计画出来。
 */
import { computed, ref } from 'vue'
import { FetchCancelled, wordFetcher } from '@/lib/fetcher'
import { exportWordlistPdf } from '@/lib/exporter'
import { saveSettings, settings } from '@/stores/settings'
import { expire } from '@/stores/session'
import { toast } from '@/stores/toast'
import type { ExportMode, FetchProgressPayload, SimpleWord } from '@/types'

const MODE_CARDS: Array<{ value: ExportMode; label: string; desc: string }> = [
  { value: 'both', label: '英文+释义', desc: '左栏印单词、右栏印释义，每页 20 词' },
  { value: 'en', label: '仅英文', desc: '只印英文，释义留空，每页 40 词' },
  { value: 'zh', label: '仅中文', desc: '只印释义，单词留空，每页 40 词' },
]

const mode = ref<ExportMode>(settings.mode)
const shuffle = ref(settings.shuffle)
const delayMin = ref(settings.delayMin)
const delayMax = ref(settings.delayMax)
const delayHint = computed(() => `${delayMin.value} – ${delayMax.value} ms`)

const busy = ref(false)
const startedAt = ref(0)
let controller: AbortController | null = null

const showProgress = ref(false)
const ratio = ref(0)
const progressText = ref('准备中…')
const progressCount = ref('0 / 0')

const showStats = ref(false)
const statWords = ref(0)
const statPages = ref(0)
const statTime = ref('0')

const exportLabel = ref('抓取全部并导出')

function onModeChange(): void {
  saveSettings({ mode: mode.value })
}

/** 乱序开关：立即落盘，下次打开面板还是上次的选择 */
function onShuffleChange(): void {
  saveSettings({ shuffle: shuffle.value })
}

/** 读取并规整间隔时间：非法值归零、min > max 时交换 */
function readDelay(): { min: number; max: number } {
  let min = Number(delayMin.value)
  let max = Number(delayMax.value)
  if (!Number.isFinite(min) || min < 0) min = 0
  if (!Number.isFinite(max) || max < 0) max = 0
  if (min > max) [min, max] = [max, min]
  delayMin.value = min
  delayMax.value = max
  saveSettings({ delayMin: min, delayMax: max })
  return { min, max }
}

function updateStats(patch: { words?: number; pages?: number; seconds?: number }): void {
  showStats.value = true
  if (typeof patch.words === 'number') statWords.value = patch.words
  if (typeof patch.pages === 'number') statPages.value = patch.pages
  if (typeof patch.seconds === 'number') statTime.value = patch.seconds.toFixed(1)
}

function setProgress(patch: { ratio?: number; text?: string; count?: string | null }): void {
  showProgress.value = true
  if (typeof patch.ratio === 'number') {
    ratio.value = Math.max(0, Math.min(1, patch.ratio)) * 100
  }
  if (patch.text) progressText.value = patch.text
  if (patch.count !== null && patch.count !== undefined) progressCount.value = patch.count
}

function renderFetchProgress(payload: FetchProgressPayload): void {
  const { phase, done = 0, total = 0, page = 0, waitMs = 0, words = 0 } = payload
  const value = total ? done / total : 0.02
  if (phase === 'probing') {
    setProgress({ ratio: 0.02, text: '读取第一页，确认分页规则…', count: '0 / ?' })
  } else if (phase === 'waiting') {
    setProgress({
      ratio: value,
      text: `随机等待 ${waitMs} ms，避免触发限流…`,
      count: `${done} / ${total} 页`,
    })
  } else if (phase === 'fetching') {
    setProgress({ ratio: value, text: `抓取第 ${page} 页…`, count: `${done} / ${total} 页` })
  } else if (phase === 'done') {
    setProgress({ ratio: 1, text: '全部页面抓取完成', count: `${total} / ${total} 页` })
  }
  if (typeof words === 'number') {
    updateStats({ words, pages: done, seconds: (Date.now() - startedAt.value) / 1000 })
  }
}

async function runExport(): Promise<void> {
  if (busy.value) return
  const chosenMode = mode.value
  const shuffleOrder = shuffle.value
  const { min, max } = readDelay()

  busy.value = true
  controller = new AbortController()
  const now = Date.now()
  startedAt.value = now
  showProgress.value = true

  try {
    let result: { words: SimpleWord[]; totalPages: number }

    if (wordFetcher.hasAllPages) {
      result = {
        words: wordFetcher.collectWords(),
        totalPages: wordFetcher.totalPages,
      }
      setProgress({ ratio: 1, text: '复用已抓取的全部单词', count: `${result.totalPages} 页` })
    } else {
      result = await wordFetcher.fetchAll({
        minDelay: min,
        maxDelay: max,
        signal: controller.signal,
        onProgress: renderFetchProgress,
      })
    }

    if (!result.words.length) throw new Error('生词本为空，没有可导出的单词')

    updateStats({
      words: result.words.length,
      pages: result.totalPages,
      seconds: (Date.now() - now) / 1000,
    })

    setProgress({ ratio: 0.65, text: shuffleOrder ? '准备打乱顺序…' : '准备排版…', count: '' })
    const exported = await exportWordlistPdf({
      words: result.words,
      mode: chosenMode,
      shuffle: shuffleOrder,
      onProgress: (progress) => {
        if (progress.phase === 'font') {
          setProgress({
            ratio: 0.65 + progress.ratio * 0.25,
            text: progress.text,
            count: '',
          })
        } else if (progress.phase === 'render') {
          setProgress({
            ratio: 0.94,
            text: shuffleOrder ? '打乱顺序，按 A4 版式排版…' : '按 A4 版式排版…',
            count: '',
          })
        } else if (progress.phase === 'done') {
          setProgress({ ratio: 1, text: '已生成，正在下载', count: '' })
        }
      },
    })

    updateStats({
      words: exported.words,
      pages: result.totalPages,
      seconds: (Date.now() - now) / 1000,
    })
    toast(
      `已导出《${exported.filename}》· ${exported.pages} 页 · ${exported.sizeText}${
        exported.shuffled ? ' · 已乱序' : ''
      }`,
      'ok',
      6000,
    )
    exportLabel.value = '重新导出 PDF'
  } catch (error) {
    if (error instanceof FetchCancelled) {
      toast(
        `已取消。已抓取 ${wordFetcher.cachedPages} 页，进度已保留，可再次点击继续`,
        'info',
        5000,
      )
      setProgress({ ratio: 0, text: '已取消', count: '' })
    } else {
      const message = (error as Error)?.message || '导出失败'
      toast(message, 'err', 6000)
      setProgress({ ratio: 0, text: `失败：${message}`, count: '' })
      if (/登录|未注册/i.test(message)) expire()
    }
  } finally {
    busy.value = false
    controller = null
  }
}

function cancel(): void {
  controller?.abort()
}
</script>

<template>
  <aside class="export-panel" aria-labelledby="exportTitle">
    <div class="panel-head">
      <h3 id="exportTitle">导出默写 PDF</h3>
    </div>

    <fieldset class="mode-group">
      <legend class="sr-only">导出模式</legend>
      <label v-for="card in MODE_CARDS" :key="card.value" class="mode-card">
        <input v-model="mode" type="radio" name="mode" :value="card.value" @change="onModeChange" />
        <span class="mode-body">
          <span class="mode-top"><b>{{ card.label }}</b><em>{{ card.value }}</em></span>
          <span class="mode-desc">{{ card.desc }}</span>
        </span>
      </label>
    </fieldset>

    <div class="shuffle-block">
      <label class="switch">
        <input v-model="shuffle" type="checkbox" @change="onShuffleChange" />
        <span class="switch-track" aria-hidden="true"><i></i></span>
        <span class="switch-text">
          <b>乱序导出</b>
          <em>{{ shuffle ? '已开启' : '按原顺序' }}</em>
        </span>
      </label>
      <p class="micro">
        生成前把单词随机打乱：单词和释义仍然成对，只是先后顺序不可预测，避免靠位置记忆。
      </p>
    </div>

    <div class="delay-block">
      <div class="delay-head">
        <span>获取每页数据间隔时间</span>
        <span class="hint">{{ delayHint }}</span>
      </div>
      <div class="delay-inputs">
        <label>
          <span>最小</span>
          <input v-model.number="delayMin" type="number" min="0" step="50" inputmode="numeric" @change="readDelay" /> ms
        </label>
        <span class="dash" aria-hidden="true">–</span>
        <label>
          <span>最大</span>
          <input v-model.number="delayMax" type="number" min="0" step="50" inputmode="numeric" @change="readDelay" /> ms
        </label>
      </div>
      <p class="micro">每次请求之间的间隔时间。为了避免触发服务端限流，请必须设置。</p>
    </div>

    <button class="btn primary block" type="button" :disabled="busy" @click="runExport">
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path
          d="M12 4v10m0 0 4-4m-4 4-4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M5 17v2h14v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>{{ exportLabel }}</span>
    </button>
    <button v-if="busy" class="btn danger block" type="button" @click="cancel">取消抓取</button>

    <div v-if="showProgress" class="progress">
      <div class="progress-bar"><i :style="{ width: `${ratio}%` }"></i></div>
      <div class="progress-meta">
        <span>{{ progressText }}</span>
        <span>{{ progressCount }}</span>
      </div>
    </div>

    <div v-if="showStats" class="fetch-stats">
      <div><span>已抓取</span><b>{{ statWords }}</b><small>词</small></div>
      <div><span>页数</span><b>{{ statPages }}</b><small>页</small></div>
      <div><span>耗时</span><b>{{ statTime }}</b><small>s</small></div>
    </div>
  </aside>
</template>
