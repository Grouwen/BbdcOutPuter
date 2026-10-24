<script setup lang="ts">
/**
 * 手机号登录：图形验证码 → 短信验证码 → 登录。
 * POST /bbdc/login/getAuthCode（GET）、getPhoneCode、phone。
 */
import { onUnmounted, ref } from 'vue'
import { api, resolveAssetUrl } from '@/api'
import { toast } from '@/stores/toast'

const emit = defineEmits<{ success: [] }>()

const phoneNumber = ref('')
const authCode = ref('')
const smsCode = ref('')
const authToken = ref('')

const codeImageSrc = ref('')
/** 后端返回的服务器绝对路径，图片加载失败时展示给用户 */
const codeServerPath = ref('')

const phoneInput = ref<HTMLInputElement | null>(null)
const authInput = ref<HTMLInputElement | null>(null)
const smsInput = ref<HTMLInputElement | null>(null)
const showCodeImage = ref(false)
const showCodeHint = ref(true)
const codeHintText = ref('获取')
const codePathHint = ref('')
const showCodePathHint = ref(false)

const sending = ref(false)
const submitting = ref(false)
const counting = ref(false)
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

function clearCountdown(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function loadAuthCode(): Promise<void> {
  sending.value = true
  try {
    const data = await api.getAuthCode()
    authToken.value = data.token || ''
    codeServerPath.value = data.url || ''
    codeImageSrc.value = `${resolveAssetUrl(data.url || '')}?_t=${Date.now()}`
    showCodeImage.value = true
    showCodeHint.value = false
    showCodePathHint.value = false
  } catch (error) {
    toast((error as Error).message || '获取图形验证码失败', 'err')
  } finally {
    sending.value = false
  }
}

/** 后端未开放静态目录时的兜底提示 */
function onCodeImageError(): void {
  showCodeImage.value = false
  showCodeHint.value = true
  codeHintText.value = '重新获取'
  showCodePathHint.value = true
  codePathHint.value = `后端未开放静态目录，图片在服务器上：${codeServerPath.value}`
}

interface PhoneForm {
  phone: string
  authCode: string
  smsCode: string
}

function readForm(): PhoneForm | null {
  const phone = (phoneNumber.value || '').trim()
  const code = (authCode.value || '').trim()
  const sms = (smsCode.value || '').trim()

  if (!/^1\d{10}$/.test(phone)) {
    toast('请输入 11 位手机号', 'err')
    phoneInput.value?.focus()
    return null
  }
  if (!code) {
    toast('请填写图形验证码', 'err')
    authInput.value?.focus()
    return null
  }
  if (!authToken.value) {
    toast('请先获取图形验证码', 'err')
    return null
  }
  return { phone, authCode: code, smsCode: sms }
}

function startCountdown(): void {
  countdown.value = 60
  counting.value = true
  clearCountdown()
  const tick = () => {
    if (countdown.value <= 0) {
      counting.value = false
      clearCountdown()
      return
    }
    countdown.value -= 1
  }
  countdownTimer = setInterval(tick, 1000)
}

async function requestPhoneCode(): Promise<void> {
  const form = readForm()
  if (!form) return
  sending.value = true
  try {
    await api.getPhoneCode({
      phoneNumber: form.phone,
      authCode: form.authCode,
      token: authToken.value,
    })
    toast('验证码已发送，请查收短信', 'ok')
    startCountdown()
  } catch (error) {
    toast((error as Error).message || '获取短信验证码失败', 'err')
  } finally {
    sending.value = false
  }
}

async function submit(): Promise<void> {
  const form = readForm()
  if (!form) return
  if (!form.smsCode) {
    toast('请填写短信验证码', 'err')
    smsInput.value?.focus()
    return
  }
  submitting.value = true
  try {
    await api.loginByPhone({
      phoneNumber: form.phone,
      authCode: form.authCode,
      token: authToken.value,
      code: form.smsCode,
    })
    toast('登录成功', 'ok')
    emit('success')
  } catch (error) {
    toast((error as Error).message || '登录失败', 'err')
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => clearCountdown())
</script>

<template>
  <form class="form" novalidate @submit.prevent="submit">
    <label class="field">
      <span>手机号</span>
      <input
        ref="phoneInput"
        v-model="phoneNumber"
        name="phone"
        type="tel"
        inputmode="numeric"
        autocomplete="tel"
        placeholder="11 位手机号"
        maxlength="11"
        required
      />
    </label>

    <div class="field">
      <span>图形验证码</span>
      <div class="captcha-row">
        <input
          ref="authInput"
          v-model="authCode"
          name="authCode"
          type="text"
          autocomplete="off"
          placeholder="输入图片中的字符"
          maxlength="8"
          required
        />
        <button
          class="captcha-box"
          type="button"
          aria-label="获取图形验证码"
          :disabled="sending"
          @click="loadAuthCode"
        >
          <img v-if="showCodeImage" :src="codeImageSrc" alt="图形验证码" @error="onCodeImageError" />
          <span v-if="showCodeHint">{{ codeHintText }}</span>
        </button>
      </div>
      <p v-if="showCodePathHint" class="note">{{ codePathHint }}</p>
    </div>

    <div class="field">
      <span>短信验证码</span>
      <div class="captcha-row">
        <input
          ref="smsInput"
          v-model="smsCode"
          name="smsCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="6 位验证码"
          maxlength="8"
          required
        />
        <button
          class="btn quiet"
          type="button"
          :disabled="sending || counting"
          @click="requestPhoneCode"
        >
          {{ sending ? '发送中…' : counting ? `${countdown}s 后重发` : '获取验证码' }}
        </button>
      </div>
    </div>

    <button class="btn primary block" type="submit" :disabled="submitting">
      {{ submitting ? '登录中…' : '登录' }}
    </button>
    <p class="note">验证码由不背单词服务器下发，请留意短信。</p>
  </form>
</template>
