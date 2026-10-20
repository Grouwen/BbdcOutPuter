<script setup lang="ts">
/** 连接设置：只改接口/静态资源地址，保存后由父组件重新检测登录态。 */
import { ref, watch } from 'vue'
import { resetSettings, saveSettings, settings } from '@/stores/settings'
import { toast } from '@/stores/toast'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const dialog = ref<HTMLDialogElement | null>(null)
const apiBase = ref('')
const assetBase = ref('')

watch(
  () => props.modelValue,
  (open) => {
    const node = dialog.value
    if (!node) return
    if (open) {
      apiBase.value = settings.apiBase
      assetBase.value = settings.assetBase
      if (!node.open) node.showModal()
    } else if (node.open) {
      node.close()
    }
  },
)

/** Esc / 「取消」关闭时同步外部状态 */
function onClose(): void {
  emit('update:modelValue', false)
}

function onSave(): void {
  const nextApi = (apiBase.value || '').trim()
  const nextAsset = (assetBase.value || '').trim()
  saveSettings({ apiBase: nextApi.replace(/\/+$/, ''), assetBase: nextAsset.replace(/\/+$/, '') })
  emit('update:modelValue', false)
  emit('saved')
}

function onReset(): void {
  const defaults = resetSettings()
  apiBase.value = defaults.apiBase
  assetBase.value = defaults.assetBase
  toast('已恢复默认设置', 'info')
}
</script>

<template>
  <dialog ref="dialog" class="dialog" @close="onClose">
    <form method="dialog" class="dialog-body">
      <h3>连接设置</h3>
      <p class="micro">前端只通过下列地址访问后端接口，配置保存在本机浏览器。</p>

      <label class="field">
        <span>接口地址</span>
        <input v-model="apiBase" type="url" placeholder="留空 = 与页面同源（集成部署时无需填写）" />
        <p class="micro">
          集成到后端后页面与接口同源，这里留空即可。仅当前端单独部署在别的域名时，才需要填完整地址，例如
          <code>http://127.0.0.1:20056</code>。
        </p>
      </label>

      <label class="field">
        <span>静态资源地址（可选）</span>
        <input v-model="assetBase" type="url" placeholder="留空 = 与接口地址相同" />
        <p class="micro">
          二维码 / 图形验证码由后端写入 <code>output/</code> 目录。集成包已把该目录挂载到
          <code>/output</code>，图片可直接显示；若改用 nginx 托管，把对应地址填在这里。
        </p>
      </label>

      <div class="dialog-actions">
        <button class="btn quiet" type="button" @click="onReset">恢复默认</button>
        <span class="spacer"></span>
        <button class="btn ghost" value="cancel" type="submit">取消</button>
        <button class="btn primary" value="save" type="button" @click="onSave">保存</button>
      </div>
    </form>
  </dialog>
</template>
