<script setup lang="ts">
/** 全局提示容器：与 .toasts 的样式约定一致。 */
import { dismiss, toasts } from '@/stores/toast'
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <div
      v-for="item in toasts"
      :key="item.id"
      class="toast"
      :class="item.type"
      :role="item.type === 'err' ? 'alert' : 'status'"
      :style="item.leaving ? { opacity: '0', transform: 'translateY(6px)' } : undefined"
      @click="dismiss(item.id)"
    >
      {{ item.message }}
    </div>
  </div>
</template>
