/**
 * 登录：二维码（SSE）与手机验证码两种方式。
 * 对应后端 /bbdc/login/* 下的四个接口。
 */

import { api, resolveAssetUrl } from './api.js';
import { $, toast } from './ui.js';

const TERMINAL_PATTERNS = [/过期/, /未注册/, /服务异常/, /未知状态/, /失败/];

export class LoginView {
  constructor({ onSuccess } = {}) {
    this.onSuccess = onSuccess || (() => {});
    this.source = null;
    this.authToken = '';
    this.countdown = 0;
    this.countdownTimer = null;
    this._bindTabs();
    this._bindQr();
    this._bindPhone();
  }

  // ------------------------------------------------------------ tab 切换
  _bindTabs() {
    const tabs = [$('#tabQr'), $('#tabPhone')];
    const panels = [$('#panelQr'), $('#panelPhone')];
    tabs.forEach((tab, index) => {
      tab?.addEventListener('click', () => {
        tabs.forEach((item, i) => {
          item.classList.toggle('is-active', i === index);
          item.setAttribute('aria-selected', String(i === index));
          panels[i].hidden = i !== index;
        });
      });
    });
  }

  // ------------------------------------------------------------ 二维码
  _bindQr() {
    $('#btnQrcode')?.addEventListener('click', () => this.startQr());
    $('#btnCopyQrPath')?.addEventListener('click', async () => {
      const text = $('#qrPath')?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        toast('路径已复制', 'ok');
      } catch {
        toast('复制失败，请手动选中文本', 'err');
      }
    });
  }

  log(message, type = '') {
    const list = $('#qrLog');
    if (!list) return;
    const li = document.createElement('li');
    if (type) li.className = type;
    li.textContent = message;
    list.appendChild(li);
    while (list.children.length > 6) list.removeChild(list.firstElementChild);
    list.scrollTop = list.scrollHeight;
  }

  resetQrStage() {
    $('#qrPlaceholder').hidden = false;
    $('#qrFallback').hidden = true;
    const image = $('#qrImage');
    image.hidden = true;
    image.removeAttribute('src');
  }

  showQrImage(serverPath) {
    const image = $('#qrImage');
    const fallback = $('#qrFallback');
    const placeholder = $('#qrPlaceholder');
    const url = resolveAssetUrl(serverPath);

    $('#qrPath').textContent = serverPath;
    image.hidden = false;
    placeholder.hidden = true;
    fallback.hidden = true;
    image.onload = () => {
      image.hidden = false;
      fallback.hidden = true;
    };
    image.onerror = () => {
      image.hidden = true;
      fallback.hidden = false;
    };
    image.src = `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  }

  startQr() {
    this.stopQr();
    this.resetQrStage();
    $('#qrLog').innerHTML = '';
    this.log('正在获取二维码…');
    const button = $('#btnQrcode');
    button.disabled = true;
    button.textContent = '等待扫码…';

    try {
      this.source = new EventSource(api.qrcodeStreamUrl());
    } catch (error) {
      this.log(`无法建立连接：${error.message}`, 'err');
      this.finishQr(false);
      return;
    }

    this.source.onmessage = (event) => this.handleQrMessage(String(event.data || ''));
    this.source.onerror = () => {
      // 服务端结束推送后会触发 error；若仍处于等待状态则提示重试
      if (this.source && this.source.readyState === EventSource.CLOSED) {
        this.log('连接已关闭', 'err');
        this.finishQr(false);
      }
    };
  }

  handleQrMessage(raw) {
    const message = raw.trim();
    if (!message) return;

    if (/\.(jpe?g|png|webp)$/i.test(message)) {
      this.showQrImage(message);
      this.log('二维码已获取，请用微信扫码');
      return;
    }

    if (message === 'ok') {
      this.log('登录成功', 'ok');
      this.finishQr(true);
      toast('登录成功', 'ok');
      this.onSuccess();
      return;
    }

    if (TERMINAL_PATTERNS.some((pattern) => pattern.test(message))) {
      this.log(message, 'err');
      this.finishQr(false);
      return;
    }

    this.log(message);
  }

  stopQr() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    const button = $('#btnQrcode');
    if (button) {
      button.disabled = false;
      button.textContent = '重新获取二维码';
    }
  }

  finishQr(success) {
    this.stopQr();
    if (success) {
      const button = $('#btnQrcode');
      if (button) button.textContent = '已登录';
    }
  }

  // ------------------------------------------------------------ 手机登录
  _bindPhone() {
    $('#btnAuthCode')?.addEventListener('click', () => this.loadAuthCode());
    $('#btnPhoneCode')?.addEventListener('click', () => this.requestPhoneCode());
    $('#phoneForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submitPhoneLogin();
    });
  }

  async loadAuthCode() {
    const button = $('#btnAuthCode');
    button.disabled = true;
    try {
      const data = await api.getAuthCode();
      this.authToken = data.token || '';
      const image = $('#authCodeImage');
      const hint = $('#authCodeHint');
      const path = $('#authCodePathHint');
      image.hidden = false;
      hint.hidden = true;
      image.onerror = () => {
        image.hidden = true;
        hint.hidden = false;
        hint.textContent = '重新获取';
        path.hidden = false;
        path.textContent = `后端未开放静态目录，图片在服务器上：${data.url || ''}`;
      };
      image.src = `${resolveAssetUrl(data.url)}?_t=${Date.now()}`;
      path.hidden = true;
    } catch (error) {
      toast(error.message || '获取图形验证码失败', 'err');
    } finally {
      button.disabled = false;
    }
  }

  _readPhoneForm() {
    const phone = ($('#phoneNumber')?.value || '').trim();
    const authCode = ($('#authCode')?.value || '').trim();
    const smsCode = ($('#smsCode')?.value || '').trim();

    if (!/^1\d{10}$/.test(phone)) {
      toast('请输入 11 位手机号', 'err');
      $('#phoneNumber')?.focus();
      return null;
    }
    if (!authCode) {
      toast('请填写图形验证码', 'err');
      $('#authCode')?.focus();
      return null;
    }
    if (!this.authToken) {
      toast('请先获取图形验证码', 'err');
      return null;
    }
    return { phone, authCode, smsCode };
  }

  async requestPhoneCode() {
    const form = this._readPhoneForm();
    if (!form) return;
    const button = $('#btnPhoneCode');
    button.disabled = true;
    button.textContent = '发送中…';
    try {
      await api.getPhoneCode({
        phoneNumber: form.phone,
        authCode: form.authCode,
        token: this.authToken,
      });
      toast('验证码已发送，请查收短信', 'ok');
      this.startCountdown(button);
    } catch (error) {
      toast(error.message || '获取短信验证码失败', 'err');
      button.disabled = false;
      button.textContent = '获取验证码';
    }
  }

  startCountdown(button) {
    this.countdown = 60;
    clearInterval(this.countdownTimer);
    const tick = () => {
      button.textContent = `${this.countdown}s 后重发`;
      button.disabled = true;
      this.countdown -= 1;
      if (this.countdown < 0) {
        clearInterval(this.countdownTimer);
        button.disabled = false;
        button.textContent = '获取验证码';
      }
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }

  async submitPhoneLogin() {
    const form = this._readPhoneForm();
    if (!form) return;
    if (!form.smsCode) {
      toast('请填写短信验证码', 'err');
      $('#smsCode')?.focus();
      return;
    }
    const submit = $('#phoneForm button[type="submit"]');
    submit.disabled = true;
    submit.textContent = '登录中…';
    try {
      await api.loginByPhone({
        phoneNumber: form.phone,
        authCode: form.authCode,
        token: this.authToken,
        code: form.smsCode,
      });
      toast('登录成功', 'ok');
      this.onSuccess();
    } catch (error) {
      toast(error.message || '登录失败', 'err');
    } finally {
      submit.disabled = false;
      submit.textContent = '登录';
    }
  }

  /** 关闭可能存在的长连接（切换视图时调用） */
  dispose() {
    this.stopQr();
    clearInterval(this.countdownTimer);
  }
}
