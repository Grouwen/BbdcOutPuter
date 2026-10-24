/**
 * 路由：hash 模式。
 *
 * 用 hash 是为了零后端改动 —— 后端只用 StaticFiles 托管 dist 时，
 * 刷新 /words 这种 history 路径会 404，而 /#/words 永远命中 index.html。
 * 若后端已加 SPA 回退（任意路径都返回 index.html），把下面换回
 * createWebHistory(import.meta.env.BASE_URL) 即可。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import ReadingView from '@/views/ReadingView.vue'
import WordsView from '@/views/WordsView.vue'
import { check, session } from '@/stores/session'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: { name: 'login' } },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/words', name: 'words', component: WordsView, meta: { requiresAuth: true } },
    { path: '/reading', name: 'reading', component: ReadingView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'login' } },
  ],
})

/**
 * 首次进入：先完成一次 autoLogin，再决定落地页（等价于原 bootstrap）。
 *   · 未登录 → 登录页
 *   · 已登录且目标是某个内页（如 /#/reading）→ 保留深链接
 *   · 已登录但落在登录页 / 根路径 → 进生词本
 * 之后的导航只做鉴权判断，不再重复请求后端。
 */
router.beforeEach(async (to) => {
  if (!session.checked) {
    const isLogin = await check()
    if (!isLogin) return { name: 'login' }
    return to.name === 'login' || !to.name ? { name: 'words' } : true
  }
  if (to.meta.requiresAuth && !session.isLogin) return { name: 'login' }
  return true
})
