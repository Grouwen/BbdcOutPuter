<script setup lang="ts">
/**
 * 登录页：二维码（SSE）与手机验证码两种方式。
 * 对应后端 /bbdc/login/* 下的四个接口。
 *
 * 布局用 grid 分区：桌面是「左说明 / 右登录卡」，窄屏把登录卡提到标题正下方，
 * 避免手机上要先滚过说明和纸样才够得着登录。
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
    <div class="login-intro">
      <h1 class="hero-title">
        英语单词助手
      </h1>
      <p class="hero-lede">
        基于「不背单词」的学习助手
      </p>
    </div>

    <ol class="steps">
      <li class="step">
        <span class="step-no">01</span>
        <div class="step-body">
          <b>登录账号</b>
          <span>支持扫码或手机验证码登录，凭证只保存在本机</span>
        </div>
      </li>
      <li class="step">
        <span class="step-no">02</span>
        <div class="step-body">
          <b>获取生词本数据</b>
          <span>逐页获取生词、音标、词性与考试标签</span>
        </div>
      </li>
      <li class="step">
        <span class="step-no">03</span>
        <div class="step-body">
          <b>导出单词</b>
          <span>支持英文+释义 / 仅英文 / 仅中三种模式</span>
        </div>
      </li>
      <li class="step">
        <span class="step-no">04</span>
        <div class="step-body">
          <b>阅读练习</b>
          <span>基于生词本数据，生成阅读题</span>
        </div>
      </li>
    </ol>

    <figure class="paper" aria-hidden="true">
      <div class="paper-head">
        <span class="paper-title">单词默写</span>
        <span class="paper-fields">姓名 <i></i> 日期 <i></i></span>
      </div>
      <div class="paper-cols">
        <div class="paper-col">
          <div class="paper-col-head"><span>Word</span><span>Meaning</span></div>
          <div class="paper-row"><i>01</i><b>corresponding</b><span>adj. 符合的，相应的</span></div>
          <div class="paper-row"><i>02</i><b>barely</b><span>adv. 仅仅，勉强</span></div>
          <div class="paper-row"><i>03</i><b>abandon</b><span>v. 放弃；抛弃</span></div>
          <div class="paper-row"><i>04</i><b>coherent</b><span>adj. 连贯的，有条理的</span></div>
          <div class="paper-row"><i>05</i><b>feasible</b><span>adj. 可行的</span></div>
        </div>
        <div class="paper-col">
          <div class="paper-col-head"><span>Word</span><span>Meaning</span></div>
          <div class="paper-row"><i>06</i><b>advocate</b><span>v. 提倡，拥护</span></div>
          <div class="paper-row"><i>07</i><b>concede</b><span>v. 承认；让步</span></div>
          <div class="paper-row"><i>08</i><b>arbitrary</b><span>adj. 任意的，专断的</span></div>
          <div class="paper-row"><i>09</i><b>diminish</b><span>v. 减少，减小</span></div>
          <div class="paper-row"><i>10</i><b>genuine</b><span>adj. 真诚的；真正的</span></div>
        </div>
      </div>
      <figcaption class="paper-cap">A4 · 双栏 · 每页 20 词 · 三种模式</figcaption>
      <span class="paper-stamp">默写</span>
    </figure>

    <aside class="login-card">
      <header class="login-card-head">
        <h2>登录不背单词</h2>
        <p>登录状态由后端保存，浏览器不存任何凭证。</p>
      </header>

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
    </aside>
  </section>
</template>
