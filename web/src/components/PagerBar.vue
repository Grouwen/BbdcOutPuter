<script setup lang="ts">
/** 分页条：上一页 / 跳页 / 下一页。页码对外一律用「第几页」的一基显示值。 */
import { ref, watch } from 'vue'

const props = defineProps<{
  displayPage: number
  totalPages: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  jump: [page: number]
}>()

const inputValue = ref(String(props.displayPage))

watch(
  () => props.displayPage,
  (page) => {
    inputValue.value = String(page)
  },
)

function commit(): void {
  const raw = Number(inputValue.value)
  if (!Number.isFinite(raw)) {
    inputValue.value = String(props.displayPage)
    return
  }
  emit('jump', raw)
  inputValue.value = String(props.displayPage)
}
</script>

<template>
  <nav class="pager" aria-label="分页">
    <button
      class="pager-btn"
      type="button"
      :disabled="disabled || displayPage <= 1"
      @click="emit('prev')"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M14.5 6.5 9 12l5.5 5.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      上一页
    </button>

    <div class="pager-info">
      <span>第</span>
      <label class="sr-only" for="pageInput">跳转到页</label>
      <input
        id="pageInput"
        v-model="inputValue"
        type="number"
        min="1"
        :max="totalPages"
        inputmode="numeric"
        :disabled="disabled"
        @change="commit"
      />
      <span>/ <b>{{ totalPages }}</b> 页</span>
    </div>

    <button
      class="pager-btn"
      type="button"
      :disabled="disabled || displayPage >= totalPages"
      @click="emit('next')"
    >
      下一页
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M9.5 6.5 15 12l-5.5 5.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </nav>
</template>
