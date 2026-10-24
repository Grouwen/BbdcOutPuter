<script setup lang="ts">
/**
 * 应用外壳：顶栏（品牌 / 主导航 / 登录态 / 设置）、视图容器、全局提示、设置弹窗。
 * 视图切换交给 vue-router（hash 模式），登录态变化时在这里统一跳转。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SettingsDialog from '@/components/SettingsDialog.vue'
import ToastStack from '@/components/ToastStack.vue'
import { wordFetcher } from '@/lib/fetcher'
import { resetReading } from '@/stores/reading'
import { refresh, session } from '@/stores/session'
import { toast } from '@/stores/toast'

const route = useRoute()
const router = useRouter()

const settingsOpen = ref(false)
/** 保存设置后强制重建视图，等价于原来重新走一遍 bootstrap + loadFirst */
const viewKey = ref(0)

const onLoginPage = computed(() => route.name === 'login')

watch(
  () => session.isLogin,
  (isLogin) => {
    if (!isLogin && route.name !== 'login') router.replace({ name: 'login' })
  },
)

function openSettings(): void {
  settingsOpen.value = true
}

/** 保存接口地址后：清空抓取缓存 → 重新检测登录态 → 落到对应视图 */
async function onSettingsSaved(): Promise<void> {
  toast('设置已保存，正在重新连接…', 'info')
  wordFetcher.reset()
  resetReading()

  const ok = await refresh()
  if (ok) {
    if (route.name === 'words' || route.name === 'reading') viewKey.value += 1
    else await router.replace({ name: 'words' })
  } else if (route.name !== 'login') {
    await router.replace({ name: 'login' })
  }
}

function jumpLogin(): void {
  router.push({ name: 'login' })
}

onMounted(() => {
  window.addEventListener('online', () => toast('网络已恢复', 'info'))
})
</script>

<template>
  <header class="topbar" :class="{ 'has-nav': session.isLogin && !onLoginPage }">
    <div class="topbar-inner">
      <router-link class="brand" :to="{ name: session.isLogin ? 'words' : 'login' }">
        <span class="brand-seal" aria-hidden="true">词</span>
        <span class="brand-text">
          <strong>英语单词助手</strong>
          <em>KEEP IT UP</em>
        </span>
      </router-link>

      <nav v-if="session.isLogin && !onLoginPage" class="nav" aria-label="主导航">
        <router-link class="nav-item" :to="{ name: 'words' }">
          生词本
        </router-link>
        <router-link class="nav-item" :to="{ name: 'reading' }">阅读练习</router-link>
      </nav>

      <div class="topbar-actions">
        <span class="status" :data-state="session.status">
          <i class="status-dot" aria-hidden="true" />
          <span>{{ session.statusText }}</span>
        </span>
        <button
          v-if="!onLoginPage && session.isLogin"
          class="btn ghost small"
          type="button"
          @click="jumpLogin"
        >
          切换账号
        </button>
        <button class="btn ghost small" type="button" @click="openSettings">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.2-2-3.4-2.2 1a7.7 7.7 0 0 0-1.7-1L15.1 4h-4l-.4 2.4c-.6.2-1.2.5-1.7 1l-2.2-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.2 2 3.4 2.2-1c.5.4 1.1.7 1.7 1l.4 2.4h4l.4-2.4c.6-.2 1.2-.5 1.7-1l2.2 1 2-3.4-2-1.2Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          设置
        </button>
      </div>
    </div>
  </header>

  <main class="shell" :class="{ 'shell-login': onLoginPage }">
    <router-view v-slot="{ Component }">
      <component :is="Component" :key="viewKey" />
    </router-view>
  </main>

  <ToastStack />

  <SettingsDialog v-model="settingsOpen" @saved="onSettingsSaved" />
</template>
