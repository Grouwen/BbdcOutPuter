<script setup lang="ts">
/**
 * 二维码登录：EventSource 直连 GET /bbdc/login/qrcode（SSE）。
 *
 * 后端推送三类消息：
 *   1. 服务器上的图片路径（.png/.jpg/.webp）→ 展示二维码
 *   2. 'ok' → 登录成功
 *   3. 过期 / 未注册 / 服务异常 / 未知状态 / 失败 → 终态，提示重试
 */
import { nextTick, onUnmounted, ref } from 'vue'
import { api, resolveAssetUrl } from '@/api'
import { toast } from '@/stores/toast'

const emit = defineEmits<{ success: [] }>()

const TERMINAL_PATTERNS = [/过期/, /未注册/, /服务异常/, /未知状态/, /失败/]

type Stage = 'placeholder' | 'image' | 'fallback'
interface LogLine {
  text: string
  type: string
}

let source: EventSource | null = null

const stage = ref<Stage>('placeholder')
const qrPath = ref('')
const imageSrc = ref('')
const logs = ref<LogLine[]>([])
const logList = ref<HTMLUListElement | null>(null)
const buttonLabel = ref('开始扫码登录')
const buttonDisabled = ref(false)

async function log(message: string, type = ''): Promise<void> {
  logs.value.push({ text: message, type })
  while (logs.value.length > 6) logs.value.shift()
  await nextTick()
  if (logList.value) logList.value.scrollTop = logList.value.scrollHeight
}

function resetQrStage(): void {
  stage.value = 'placeholder'
  imageSrc.value = ''
}

function showQrImage(serverPath: string): void {
  qrPath.value = serverPath
  const url = resolveAssetUrl(serverPath)
  imageSrc.value = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
  stage.value = 'image'
}

function onImageError(): void {
  stage.value = 'fallback'
}

function handleQrMessage(raw: string): void {
  const message = raw.trim()
  if (!message) return

  if (/\.(jpe?g|png|webp)$/i.test(message)) {
    showQrImage(message)
    void log('二维码已获取，请用微信扫码')
    return
  }

  if (message === 'ok') {
    void log('登录成功', 'ok')
    finishQr(true)
    toast('登录成功', 'ok')
    emit('success')
    return
  }

  if (TERMINAL_PATTERNS.some((pattern) => pattern.test(message))) {
    void log(message, 'err')
    finishQr(false)
    return
  }

  void log(message)
}

function startQr(): void {
  stopQr()
  resetQrStage()
  logs.value = []
  void log('正在获取二维码…')
  buttonDisabled.value = true
  buttonLabel.value = '等待扫码…'

  try {
    source = new EventSource(api.qrcodeStreamUrl())
  } catch (error) {
    void log(`无法建立连接：${(error as Error).message}`, 'err')
    finishQr(false)
    return
  }

  source.onmessage = (event) => handleQrMessage(String(event.data || ''))
  source.onerror = () => {
    // 服务端结束推送后会触发 error；若仍处于等待状态则提示重试
    if (source && source.readyState === EventSource.CLOSED) {
      void log('连接已关闭', 'err')
      finishQr(false)
    }
  }
}

function stopQr(): void {
  if (source) {
    source.close()
    source = null
  }
  buttonDisabled.value = false
  buttonLabel.value = '重新获取二维码'
}

function finishQr(success: boolean): void {
  stopQr()
  if (success) buttonLabel.value = '已登录'
}

async function copyQrPath(): Promise<void> {
  try {
    await navigator.clipboard.writeText(qrPath.value || '')
    toast('路径已复制', 'ok')
  } catch {
    toast('复制失败，请手动选中文本', 'err')
  }
}

/** 切换视图时关闭长连接 */
onUnmounted(() => stopQr())
</script>

<template>
  <div class="qr-stage">
    <div v-if="stage === 'placeholder'" class="qr-placeholder">
      <svg
        viewBox="0 0 48 48"
        width="40"
        height="40"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linejoin="round"
      >
        <rect x="6" y="6" width="14" height="14" rx="2" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect x="28" y="6" width="14" height="14" rx="2" />
        <rect x="32.5" y="10.5" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <rect x="6" y="28" width="14" height="14" rx="2" />
        <rect x="10.5" y="32.5" width="5" height="5" rx="1" fill="currentColor" stroke="none" />
        <path d="M28 28h6v6h-6zM36 36h6v6h-6z" fill="currentColor" stroke="none" />
        <path d="M28 40h4M40 28h2v4" stroke-linecap="round" />
      </svg>
      <p>点击下方按钮获取登录二维码</p>
    </div>

    <!-- 保留 id 以复用样式表里的 #qrImage 尺寸规则 -->
    <img v-if="stage === 'image'" id="qrImage" :src="imageSrc" alt="微信登录二维码" @error="onImageError" />

    <div v-if="stage === 'fallback'" class="qr-fallback">
      <p>后端未开放静态目录，图片无法直接显示。可在服务器上打开该文件扫码：</p>
      <code>{{ qrPath || '—' }}</code>
      <button class="btn tiny" type="button" @click="copyQrPath">复制路径</button>
    </div>
  </div>

  <button class="btn primary block" type="button" :disabled="buttonDisabled" @click="startQr">
    {{ buttonLabel }}
  </button>

  <ul ref="logList" class="event-log" aria-live="polite">
    <li v-for="(line, index) in logs" :key="index" :class="line.type">{{ line.text }}</li>
  </ul>

  <p class="micro">登录成功后自动跳转到生词本。若二维码过期，重新点击即可。</p>
</template>
