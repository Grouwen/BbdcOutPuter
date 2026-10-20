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
    <button class="btn quiet" type="button" :disabled="disabled || displayPage <= 1" @click="emit('prev')">
      上一页
    </button>
    <div class="pager-info">
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
      class="btn quiet"
      type="button"
      :disabled="disabled || displayPage >= totalPages"
      @click="emit('next')"
    >
      下一页
    </button>
  </nav>
</template>
