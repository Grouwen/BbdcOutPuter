<script setup lang="ts">
/**
 * 生词本列表：只消费 /bbdc/service/getNewword/{page}，一次一页。
 * 搜索只作用于当前页（后端没有搜索接口，不臆造）。
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import ExportPanel from '@/components/ExportPanel.vue'
import PagerBar from '@/components/PagerBar.vue'
import WordEntry from '@/components/WordEntry.vue'
import { prefetchTypefaces } from '@/lib/exporter'
import { searchTextOf } from '@/lib/word-utils'
import { expire } from '@/stores/session'
import { toast } from '@/stores/toast'
import { setVocabMeta } from '@/stores/vocab'
import type { PageInfo, Word } from '@/types'

const SKELETON_COUNT = 6

const words = ref<Word[]>([])
const pageInfo = ref<PageInfo | null>(null)
const zeroBased = ref(true)
const page = ref(0)
const pageSize = ref(24)
const loading = ref(false)
const searchText = ref('')

const meta = ref('正在读取…')
const viewState = ref<'skeleton' | 'error' | 'list'>('skeleton')
const errorNeedLogin = ref(false)
const errorMessage = ref('')

let audio: HTMLAudioElement | null = null

const filter = computed(() => searchText.value.trim().toLowerCase())

const totalPages = computed(() => Number(pageInfo.value?.totalPage) || 1)
const displayPage = computed(() => (zeroBased.value ? page.value + 1 : page.value))
const lastPage = computed(() => (zeroBased.value ? Math.max(0, totalPages.value - 1) : totalPages.value))
const offset = computed(() =>
  zeroBased.value ? page.value * pageSize.value : (page.value - 1) * pageSize.value,
)

/** 保留原始下标，页码序号才不会因为搜索而错位 */
const visible = computed(() =>
  words.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (!filter.value) return true
      // 搜索文本同样走后端的转义解析（translation 可能是字符串或数组）
      return searchTextOf(item).includes(filter.value)
    }),
)

function renderSkeleton(text: string): void {
  viewState.value = 'skeleton'
  meta.value = text
}

function renderError(error: unknown): void {
  const message = (error as Error)?.message || '未知错误'
  const needLogin = /登录|login|未注册/i.test(message)
  errorNeedLogin.value = needLogin
  errorMessage.value = message
  viewState.value = 'error'
  meta.value = needLogin ? '未登录' : '读取失败'
  if (needLogin) expire(message)
}

function render(): void {
  const total = Number(pageInfo.value?.totalRecord) || 0
  meta.value = `共 ${total} 词 · 第 ${displayPage.value} / ${totalPages.value} 页 · 每页 ${pageSize.value} 词`
  setVocabMeta({ totalRecord: total, pageSize: pageSize.value })
  viewState.value = 'list'
}

/** 首次进入：探测分页规则并读取第一页 */
async function loadFirst(): Promise<boolean> {
  renderSkeleton('正在读取生词本…')
  try {
    let data = await api.getNewword(0)
    let used = 0
    if (!(data.wordList || []).length && Number(data.pageInfo?.totalRecord) > 0) {
      data = await api.getNewword(1)
      used = 1
    }
    const info = data.pageInfo || {}
    const current = Number(info.currentPage)
    zeroBased.value = Number.isFinite(current) ? current === 0 : used === 0
    pageInfo.value = info
    page.value = Number.isFinite(current) ? current : zeroBased.value ? 0 : 1
    pageSize.value = Number(info.pageSize) || (data.wordList || []).length || 24
    words.value = data.wordList || []
    render()
    return true
  } catch (error) {
    renderError(error)
    return false
  }
}

async function load(target: number): Promise<void> {
  loading.value = true
  renderSkeleton('正在翻页…')
  try {
    const data = await api.getNewword(target)
    page.value = Number(data.pageInfo?.currentPage ?? target)
    pageInfo.value = data.pageInfo || pageInfo.value
    words.value = data.wordList || []
    render()
  } catch (error) {
    renderError(error)
  } finally {
    loading.value = false
  }
}

async function go(target: number): Promise<void> {
  if (loading.value) return
  if (target < (zeroBased.value ? 0 : 1) || target > lastPage.value) return
  await load(target)
}

/** 分页条给的是「第几页」（一基），这里换回后端页码 */
async function jump(displayTarget: number): Promise<void> {
  const target = zeroBased.value ? displayTarget - 1 : displayTarget
  await go(Math.min(Math.max(target, zeroBased.value ? 0 : 1), lastPage.value))
}

function refresh(): void {
  void load(page.value)
}

/** 窄屏把导出面板排在列表之后，用这个入口把用户直接带到面板 */
function jumpToExport(): void {
  document.getElementById('export-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function play(url: string): void {
  if (!url) return
  audio?.pause?.()
  audio = new Audio(url)
  audio.play().catch(() => toast('发音播放失败', 'err'))
}

onMounted(async () => {
  const ok = await loadFirst()
  if (ok) prefetchTypefaces()
})
</script>

<template>
  <section class="view words-view">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title"><span class="page-index">01</span>生词本</h1>
        <p class="page-sub">{{ meta }}</p>
      </div>
      <div class="page-tools">
        <button class="btn primary small only-narrow export-jump" type="button" @click="jumpToExport">
          导出默写纸
        </button>
        <label class="search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <input
            v-model="searchText"
            type="search"
            placeholder="搜索本页单词或释义"
            aria-label="搜索本页单词或释义"
          />
        </label>
        <span v-if="filter" class="search-count">{{ visible.length }} / {{ words.length }}</span>
        <button class="btn ghost small" type="button" @click="refresh">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.3-5.6"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
            <path
              d="M20 4v5h-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          刷新
        </button>
      </div>
    </header>

    <div class="words-layout">
      <div class="words-main">
        <div class="list-head" aria-hidden="true">
          <span>#</span>
          <span>单词</span>
          <span>释义 / 标签</span>
          <span>加入</span>
        </div>

        <div class="word-list" aria-live="polite">
          <template v-if="viewState === 'skeleton'">
            <div v-for="n in SKELETON_COUNT" :key="n" class="entry-skeleton">
              <i /><span /><b />
            </div>
          </template>

          <div v-else-if="viewState === 'error'" class="state-block">
            <span class="state-mark">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                <template v-if="errorNeedLogin">
                  <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
                  <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
                </template>
                <template v-else>
                  <path d="M12 4.5 21 19.5H3L12 4.5Z" />
                  <path d="M12 10v4" stroke-linecap="round" />
                  <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
                </template>
              </svg>
            </span>
            <h2>{{ errorNeedLogin ? '需要先登录' : '读取失败' }}</h2>
            <p>{{ errorMessage }}</p>
            <p class="state-note">
              {{ errorNeedLogin ? '完成登录后会自动载入生词本。' : '请确认后端已启动，且接口地址配置正确。' }}
            </p>
          </div>

          <template v-else>
            <div v-if="!words.length" class="state-block">
              <span class="state-mark">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                  <rect x="4.5" y="4" width="15" height="16" rx="2" />
                  <path d="M8 9h8M8 13h5" stroke-linecap="round" />
                </svg>
              </span>
              <h2>这一页没有生词</h2>
              <p>生词本可能是空的，或者这一页刚好没有内容。</p>
            </div>

            <div v-else-if="!visible.length" class="state-block">
              <span class="state-mark">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
              </span>
              <h2>本页没有匹配「{{ filter }}」的词</h2>
              <p class="state-note">搜索只作用于当前页，翻页后再试试。</p>
            </div>

            <template v-else>
              <WordEntry
                v-for="entry in visible"
                :key="entry.index"
                :item="entry.item"
                :index="offset + entry.index + 1"
                @play="play"
              />
            </template>
          </template>
        </div>

        <PagerBar
          :display-page="displayPage"
          :total-pages="totalPages"
          :disabled="viewState === 'error'"
          @prev="go(page - 1)"
          @next="go(page + 1)"
          @jump="jump"
        />
      </div>

      <ExportPanel />
    </div>
  </section>
</template>
