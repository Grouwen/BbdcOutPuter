<script setup lang="ts">
/** 单个生词卡片：词、音标、词性+释义、变形、标签、加入时间与发音按钮。 */
import { computed } from 'vue'
import { formatDate } from '@/lib/utils'
import { audioOf, definitionsOf, exchangeOf, phoneticOf, tagsOf, wordTextOf } from '@/lib/word-utils'
import type { Word } from '@/types'

const props = defineProps<{ item: Word; index: number }>()
const emit = defineEmits<{ play: [url: string] }>()

// 后端字段一律先经 lib/word-utils 转义解析，模板只负责展示（Vue 插值本身会再做 HTML 转义）
const title = computed(() => wordTextOf(props.item))
const defs = computed(() => definitionsOf(props.item))
const tags = computed(() => tagsOf(props.item))
const forms = computed(() => exchangeOf(props.item))
const phonetic = computed(() => phoneticOf(props.item))
const audio = computed(() => audioOf(props.item))
const no = computed(() => String(props.index).padStart(2, '0'))
</script>

<template>
  <article class="word-card">
    <span class="no">{{ no }}</span>
    <div class="wc-head">
      <h4 class="wc-word">{{ title || '—' }}</h4>
      <span v-if="phonetic" class="wc-phonetic">{{ phonetic }}</span>
    </div>
    <div class="wc-defs">
      <p v-for="(def, index) in defs" :key="index">
        <span v-if="def.pos" class="pos">{{ def.pos }}</span>{{ def.text }}
      </p>
      <p v-if="!defs.length" style="color: #b0a69e">暂无释义</p>
    </div>
    <p v-if="forms.length" class="wc-forms">
      <span v-for="form in forms" :key="form.key + form.value" class="wc-form">
        <i>{{ form.label }}</i>{{ form.value }}
      </span>
    </p>
    <div v-if="tags.length" class="wc-tags">
      <span v-for="(tag, index) in tags" :key="index" class="tag" :class="{ hot: tag.hot }">
        {{ tag.text }}
      </span>
    </div>
    <div class="wc-foot">
      <span>{{ formatDate(item.updatetime) || '—' }} 加入</span>
      <button
        v-if="audio"
        class="icon-btn"
        type="button"
        :aria-label="`播放 ${title} 的发音`"
        @click="emit('play', audio)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" />
          <path
            d="M15 8.5a4.5 4.5 0 0 1 0 7"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <span v-else></span>
    </div>
  </article>
</template>
