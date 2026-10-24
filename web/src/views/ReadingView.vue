<script setup lang="ts">
/**
 * 阅读练习：把生词本交给大模型，生成一篇英语阅读与 5 道选择题。
 *
 * 唯一的接口是 POST /llm/generate/readComprehension（SSE），
 * 事件流与状态机都在 stores/reading 里，这里只负责画面。
 */
import { computed } from 'vue'
import {
  cancelReading,
  generateReading,
  isRunning,
  pickOption,
  reading,
  setScale,
  toggleAnswers,
} from '@/stores/reading'
import { vocab } from '@/stores/vocab'
import { toast } from '@/stores/toast'
import type { ReadingQuestion, ReadingScale } from '@/types'

const SCALES: Array<{ value: ReadingScale; label: string }> = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]

const running = computed(() => isRunning())
const article = computed(() => reading.article)
const total = computed(() => (vocab.checked ? vocab.totalRecord : 0))

const sub = computed(() =>
  total.value > 0
    ? `用生词本里的 ${total.value} 个单词生成一篇英语阅读。`
    : '用生词本里的全部单词出一篇英语阅读。',
)

/** 取词阶段的确定性进度：留出后 40% 给写作阶段，避免进度条提前贴满 */
const collectRatio = computed(() => {
  if (!reading.pagesTotal) return 0.06
  return Math.min(0.6, Math.max(0.06, (reading.pagesDone / reading.pagesTotal) * 0.6))
})

/** 主区域标题直接写当前步骤，取词和写作分开 */
const phaseTitle = computed(() => {
  if (reading.phase === 'collecting') return '正在读取生词本…'
  if (reading.phase === 'writing') return '正在写这篇文章…'
  return '正在准备…'
})

/** 主区域副标题：取词阶段给页码与词数，写作阶段给标题 */
const phaseDetail = computed(() => {
  if (reading.phase === 'collecting') {
    const parts: string[] = []
    if (reading.pagesTotal) parts.push(`第 ${reading.pagesDone} / ${reading.pagesTotal} 页`)
    if (reading.wordsFetched) parts.push(`已读 ${reading.wordsFetched} 词`)
    parts.push(`已用时 ${reading.elapsed} 秒`)
    return parts.join(' · ')
  }
  if (reading.phase === 'writing') {
    const title = reading.liveTitle ? `《${reading.liveTitle}》` : 'AI 正在写作'
    return `${title} · 已用时 ${reading.elapsed} 秒`
  }
  return reading.status
})

/** 侧栏只留状态词：页码、词数、用时都只在主区域显示，不重复 */
const collectText = computed(() => {
  if (reading.phase === 'collecting') return '进行中'
  if (reading.phase === 'writing' || reading.phase === 'done') return '已读完'
  return '等待开始'
})

const writeText = computed(() => {
  if (reading.phase === 'writing') return '进行中'
  if (reading.phase === 'done') return `完成 · ${article.value?.wordCount ?? 0} 词`
  return '等待开始'
})

/** 已有作答时，按钮同时承担「判分」，文案要说清 */
const answerLabel = computed(() => {
  if (reading.answerShown) return '隐藏答案'
  const picked = article.value
    ? article.value.questions.filter((question) => reading.picks[question.number]).length
    : 0
  return picked > 0 ? '判分并显示答案' : '显示答案'
})

function stepState(step: 0 | 1): string {
  const phase = reading.phase
  if (step === 0) {
    if (phase === 'collecting') return 'is-active'
    if (phase === 'writing' || phase === 'done') return 'is-done'
    return ''
  }
  if (phase === 'writing') return 'is-active'
  if (phase === 'done') return 'is-done'
  return ''
}

const answered = computed(() => {
  if (!article.value) return 0
  return article.value.questions.filter((question) => reading.picks[question.number]).length
})

const correct = computed(() => {
  if (!article.value) return 0
  return article.value.questions.filter(
    (question) => question.answer && reading.picks[question.number] === question.answer,
  ).length
})

function optionState(question: ReadingQuestion, letter: string): Record<string, boolean> {
  const picked = reading.picks[question.number] === letter
  if (!reading.answerShown) return { 'is-picked': picked }
  return {
    'is-correct': question.answer === letter,
    'is-wrong': picked && question.answer !== letter,
  }
}

function onGenerate(): void {
  void generateReading()
}

function onCancel(): void {
  cancelReading()
  toast('已停止生成', 'info')
}

function onScale(value: ReadingScale): void {
  setScale(value)
}

/** 狭窄屏幕上把「跳到题目」做成一次平滑滚动 */
function scrollToQuestions(): void {
  const node = document.getElementById('questions')
  node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section class="view reading-view">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title"><span class="page-index">02</span>阅读练习</h1>
        <p class="page-sub">{{ sub }}</p>
      </div>
    </header>

    <div class="reading-layout" :class="{ 'has-article': !!article }">
      <div class="reading-main">
        <!-- 窄屏：文章顶部的操作条，避免要滚完整篇文章才找得到按钮 -->
        <div v-if="article" class="reading-toolbar">
          <div class="tool-row">
            <span class="tool-label">字号</span>
            <div class="seg seg-tiny" role="group" aria-label="正文字号">
              <button
                v-for="item in SCALES"
                :key="item.value"
                class="seg-btn"
                :class="{ 'is-active': reading.scale === item.value }"
                type="button"
                :aria-pressed="reading.scale === item.value"
                @click="onScale(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="tool-actions">
            <button class="btn quiet small" type="button" @click="toggleAnswers">{{ answerLabel }}</button>
            <button class="btn ghost small" type="button" @click="scrollToQuestions">
              题目 {{ article.questions.length }} 道
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  d="M12 5v13m0 0 5-5m-5 5-5-5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- 生成中：主区域显示当前步骤与页码，操作按钮留在右侧面板 -->
        <div v-if="running && !article" class="sheet sheet-generating">
          <h2 class="sheet-title">{{ phaseTitle }}</h2>
          <p class="sheet-sub">{{ phaseDetail }}</p>
          <div class="progress sheet-progress">
            <div class="progress-bar" :class="{ 'is-indeterminate': reading.phase === 'writing' }">
              <i v-if="reading.phase === 'writing'" />
              <i v-else :style="{ width: `${collectRatio * 100}%` }" />
            </div>
          </div>
          <div class="ghost-lines" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </div>
          <p class="sheet-note">生词本页数多的账号，取词会久一些；写作阶段后端不提供百分比，进度条会来回走。</p>
        </div>

        <!-- 失败 -->
        <div v-else-if="reading.phase === 'error'" class="sheet sheet-state">
          <span class="state-mark">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <path d="M12 4.5 21 19.5H3L12 4.5Z" />
              <path d="M12 10v4" stroke-linecap="round" />
              <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h2 class="sheet-title">这篇没生成出来</h2>
          <p class="sheet-error">{{ reading.error }}</p>
          <p class="sheet-note">在服务端的 .env 里补上 API Key 与模型名后重试即可，前端不需要改动。</p>
          <button class="btn primary" type="button" @click="onGenerate">再试一次</button>
        </div>

        <!-- 还没有内容 -->
        <div v-else-if="!article" class="sheet sheet-empty">
          <h2 class="sheet-title">还没有生成内容</h2>
          <div class="paper-lines" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </div>
          <ul class="empty-list">
            <li><span>1</span>一篇英语短文，尽量覆盖生词本里的词</li>
            <li><span>2</span>五道四选一阅读题，附正确选项与中文解析</li>
            <li><span>3</span>点「显示答案」才开始判分，先自己读一遍</li>
          </ul>
          <p class="sheet-note">点击「生成阅读文章」开始。</p>
        </div>

        <!-- 文章 + 题目 -->
        <template v-else>
          <article class="sheet passage" :data-scale="reading.scale">
            <h2 class="passage-title">{{ article.title }}</h2>
            <p class="passage-meta">
              {{ article.wordCount }} 词 · {{ article.questions.length }} 题 · 用时
              {{ reading.elapsed }} 秒
            </p>
            <hr class="rule" />
            <p v-for="(paragraph, index) in article.paragraphs" :key="index" class="passage-p">
              {{ paragraph }}
            </p>
            <div v-if="article.corePoint" class="core-point">
              <span class="core-label">核心考点</span>
              <p>{{ article.corePoint }}</p>
            </div>
          </article>

          <section id="questions" class="questions">
            <header class="questions-head">
              <h2>题目</h2>
              <div class="questions-tools">
                <span v-if="reading.answerShown" class="score">
                  答对 <b>{{ correct }}</b> / {{ article.questions.length }}
                  <em v-if="answered < article.questions.length">（未作答 {{ article.questions.length - answered }} 题）</em>
                </span>
                <button class="btn quiet small" type="button" @click="toggleAnswers">
                  {{ answerLabel }}
                </button>
              </div>
            </header>

            <ol class="question-list">
              <li v-for="question in article.questions" :key="question.number" class="question">
                <div class="q-head">
                  <span class="q-no">{{ question.number }}</span>
                  <h3 class="q-stem">{{ question.stem }}</h3>
                </div>

                <div class="q-options">
                  <button
                    v-for="option in question.options"
                    :key="option.letter"
                    class="q-option"
                    :class="optionState(question, option.letter)"
                    type="button"
                    :aria-pressed="reading.picks[question.number] === option.letter"
                    :disabled="reading.answerShown"
                    @click="pickOption(question.number, option.letter)"
                  >
                    <span class="q-letter">{{ option.letter }}</span>
                    <span class="q-text">{{ option.text }}</span>
                    <svg
                      v-if="reading.answerShown && question.answer === option.letter"
                      class="q-check"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 12.5 4.5 4.5L19 7"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div v-if="reading.answerShown" class="q-analysis">
                  <span class="core-label">解析</span>
                  <p>{{ question.analysis || '后端没有返回这道题的解析。' }}</p>
                </div>
              </li>
            </ol>
          </section>
        </template>
      </div>

      <aside class="reading-aside">
        <div class="panel generate-panel">
          <header class="panel-head">
            <h2>出题</h2>
            <p class="panel-sub">
              后端会取当前账号生词本里的全部单词，交给ai写一篇阅读题目并给出 5 道题。
            </p>
          </header>

          <button
            class="btn block"
            :class="article ? 'ghost' : 'primary'"
            type="button"
            :disabled="running"
            @click="onGenerate"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M12 4v12m0-12 4.2 3M12 4 7.8 7M6 15.5A5.5 5.5 0 0 0 12 20a5.5 5.5 0 0 0 6-4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>{{ running ? '正在生成…' : article ? '重新生成一篇' : '生成阅读文章' }}</span>
          </button>
          <button v-if="running" class="btn ghost block" type="button" @click="onCancel">
            停止生成
          </button>

          <div class="gen-steps" :class="{ 'is-idle': reading.phase === 'idle' }">
            <div class="gen-step" :class="stepState(0)">
              <span class="gen-dot" aria-hidden="true" />
              <div class="step-body">
                <b>读取生词本</b>
                <em>{{ collectText }}</em>
              </div>
            </div>
            <div class="gen-step" :class="stepState(1)">
              <span class="gen-dot" aria-hidden="true" />
              <div class="step-body">
                <b>写文章与题目</b>
                <em>{{ writeText }}</em>
              </div>
            </div>
          </div>

          <div v-if="article" class="reader-tools">
            <div class="tool-row">
              <span class="tool-label">正文字号</span>
              <div class="seg seg-tiny" role="group" aria-label="正文字号">
                <button
                  v-for="item in SCALES"
                  :key="item.value"
                  class="seg-btn"
                  :class="{ 'is-active': reading.scale === item.value }"
                  type="button"
                  :aria-pressed="reading.scale === item.value"
                  @click="onScale(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </div>

          <p class="note">
            生成耗时取决于模型与生词量；结果保存在这个标签页里，关掉标签页后需要重新生成。
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>
