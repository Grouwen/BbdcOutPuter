<script setup lang="ts">
/**
 * 登录页：二维码（SSE）与手机验证码两种方式。
 * 对应后端 /bbdc/login/* 下的四个接口。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PhonePanel from '@/components/PhonePanel.vue'
import QrPanel from '@/components/QrPanel.vue'
import { refresh } from '@/stores/session'

type TabKey = 'qr' | 'phone'

const router = useRouter()
const activeTab = ref<TabKey>('qr')

/** 登录成功后以后端保存的 cookie 为准，重新走一遍 autoLogin 再进生词本 */
async function onLoginSuccess(): Promise<void> {
  const ok = await refresh()
  if (ok) await router.replace({ name: 'words' })
}

async function retryAuto(): Promise<void> {
  const ok = await refresh()
  if (ok) await router.replace({ name: 'words' })
}
</script>

<template>
  <section class="view login-view">
    <div class="hero">
      <h1 class="hero-title">英语单词助手</h1>
      <p class="hero-desc">
        读取不背单词生词本，按 A4 双栏版式排版，支持<b>英文+释义</b>、<b>仅英文</b>、<b>仅中文</b>三种模式
      </p>

      <ol class="steps">
        <li>
          <span class="step-no">1</span>
          <div><b>登录账号</b><span>扫码或手机验证码，凭证只保存在本地。</span></div>
        </li>
        <li>
          <span class="step-no">2</span>
          <div><b>读取生词本</b><span>获取生词本全部数据</span></div>
        </li>
        <li>
          <span class="step-no">3</span>
          <div><b>导出 PDF</b><span>浏览器本地排版生成，数据不上传第三方。</span></div>
        </li>
      </ol>

      <div class="paper-preview" aria-hidden="true">
        <div class="pp-half">
          <div class="pp-head"><span class="pp-chip">Word</span><span>Meaning</span></div>
          <div class="pp-row"><i>1</i><b>corresponding</b><span></span><u></u></div>
          <div class="pp-row alt"><i>2</i><b>barely</b><span></span><u></u></div>
          <div class="pp-row"><i>3</i><b>abandon</b><span></span><u></u></div>
        </div>
        <div class="pp-half">
          <div class="pp-head"><span class="pp-chip">Word</span><span>Meaning</span></div>
          <div class="pp-row"><i>1</i><b></b><span>adj. 符合的，相应的</span><u></u></div>
          <div class="pp-row alt"><i>2</i><b></b><span>adv. 仅仅，勉强</span><u></u></div>
          <div class="pp-row"><i>3</i><b></b><span>v. 放弃，抛弃</span><u></u></div>
        </div>
      </div>
    </div>

    <div class="login-card">
      <div class="tabs" role="tablist" aria-label="登录方式">
        <button
          class="tab"
          :class="{ 'is-active': activeTab === 'qr' }"
          role="tab"
          :aria-selected="activeTab === 'qr'"
          aria-controls="panelQr"
          type="button"
          @click="activeTab = 'qr'"
        >
          二维码登录
        </button>
        <button
          class="tab"
          :class="{ 'is-active': activeTab === 'phone' }"
          role="tab"
          :aria-selected="activeTab === 'phone'"
          aria-controls="panelPhone"
          type="button"
          @click="activeTab = 'phone'"
        >
          手机号登录
        </button>
      </div>

      <!-- 二维码 -->
      <div v-show="activeTab === 'qr'" id="panelQr" class="tab-panel" role="tabpanel" aria-labelledby="tabQr">
        <QrPanel @success="onLoginSuccess" />
      </div>

      <!-- 手机号 -->
      <div
        v-show="activeTab === 'phone'"
        id="panelPhone"
        class="tab-panel"
        role="tabpanel"
        aria-labelledby="tabPhone"
      >
        <PhonePanel @success="onLoginSuccess" />
      </div>

      <button class="link-btn" type="button" @click="retryAuto">我最近已登录过，重新检测</button>
    </div>
  </section>
</template>
