<script setup lang="ts">
/** 词条行：单词、音标、释义、变形、标签、加入时间与发音按钮。 */
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
const added = computed(() => formatDate(props.item.updatetime))
const no = computed(() => String(props.index).padStart(2, '0'))
const formsText = computed(() => forms.value.map((form) => `${form.label} ${form.value}`).join(' · '))
</script>

<template>
  <article class="entry">
    <span class="entry-no" aria-hidden="true">{{ no }}</span>

    <div class="entry-head">
      <h3 class="entry-word">{{ title || '—' }}</h3>
      <p v-if="phonetic" class="entry-phonetic">{{ phonetic }}</p>
      <p v-if="forms.length" class="entry-forms" :title="formsText">{{ formsText }}</p>
    </div>

    <div class="entry-defs">
      <p v-for="(def, index) in defs" :key="index" class="entry-def">
        <span v-if="def.pos" class="entry-pos">{{ def.pos }}</span>
        <span>{{ def.text }}</span>
      </p>
      <p v-if="!defs.length" class="entry-def is-empty">暂无释义</p>

      <ul v-if="tags.length" class="entry-tags" aria-label="标签">
        <li v-for="(tag, index) in tags" :key="index" class="tag" :class="{ 'is-hot': tag.hot }">
          {{ tag.text }}
        </li>
      </ul>
    </div>

    <div class="entry-side">
      <span class="entry-date">{{ added || '—' }}</span>
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
    </div>
  </article>
</template>
