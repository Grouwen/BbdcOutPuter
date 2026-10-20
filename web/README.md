# 生词本 · 默写工坊（Vue 3 + Vite + TypeScript）

把原来的原生 ES Module 单页应用重构为 Vue 3 + Vite + TypeScript，**功能、文案、样式、接口调用全部保持原样**：
页面结构、CSS（`app.css` 一行未改）、三种 PDF 版式、限流随机延迟、二维码 SSE、断点续抓、
设置持久化都逐项对齐；差异只有工程形态（组件化 + 路由 + 类型）。

---

## 1. 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173，已内置 /bbdc 与 /output 的反向代理
npm run build      # 类型检查 + 产出 dist/
npm run preview    # 本地预览构建产物
```

开发期后端地址默认 `http://127.0.0.1:20056`，需要改就：

```bash
VITE_API_TARGET=http://192.168.1.10:20056 npm run dev
```

> 原来的 `serve.py` 已删除，它的职责（静态托管 + `/bbdc`、`/output` 反代）由
> `vite.config.ts` 的 `server.proxy` 承担，前端代码依旧只用**同源相对路径**，
> 与「构建产物交给后端托管」后的行为完全一致。

---

## 2. 目录结构

```
src/
├── main.ts                 入口
├── App.vue                 顶栏 + 视图容器 + 全局提示 + 设置弹窗
├── router/index.ts         /login、/words（hash 模式）
├── api/
│   ├── client.ts           fetch 封装：超时/取消/错误归类/统一返回体解包
│   └── index.ts            6 个后端接口 + 静态资源 URL 解析
├── stores/
│   ├── settings.ts         localStorage 配置（key 未变）
│   ├── session.ts          登录态（唯一事实来源：autoLogin）
│   └── toast.ts            提示队列
├── lib/
│   ├── fetcher.ts          WordFetcher（纯逻辑类 + 全局单例）
│   ├── exporter.ts         字体加载 → 排版 → 下载
│   ├── word-utils.ts       Word 对象 → 界面/PDF 形状
│   ├── utils.ts            sleep/randomInt/formatDate/formatBytes
│   └── pdf/                pdfdoc.js、ttf.js、wordlist.js（原样保留，未改动）
├── components/
│   ├── QrPanel.vue         二维码登录（EventSource）
│   ├── PhonePanel.vue      手机验证码登录
│   ├── WordCard.vue        单个生词卡片
│   ├── PagerBar.vue        分页条
│   ├── ExportPanel.vue     模式选择 / 间隔设置 / 抓取进度 / 导出
│   ├── SettingsDialog.vue  接口地址设置
│   └── ToastStack.vue      提示渲染
├── views/
│   ├── LoginView.vue       登录页
│   └── WordsView.vue       生词本页
├── styles/app.css          原样式表，未改动
└── assets/fonts/           两个 TTF（构建时带 hash 输出，走长期缓存）
```

原文件 → 新位置的对应关系：

| 原文件 | 新位置 | 处理方式 |
| --- | --- | --- |
| `index.html` | `index.html` + `App.vue` + `views/*` | 结构与文案原样迁移 |
| `assets/css/app.css` | `src/styles/app.css` | 未改动 |
| `assets/js/config.js` | `src/stores/settings.ts` | 存储 key、默认值不变，改为响应式 |
| `assets/js/api.js` | `src/api/client.ts` + `src/api/index.ts` | 拆成传输层 / 接口层 |
| `assets/js/ui.js` | `src/stores/toast.ts` + `src/lib/utils.ts` | DOM 操作交给 Vue，纯函数保留 |
| `assets/js/word-utils.js` | `src/lib/word-utils.ts` | 仅补类型 |
| `assets/js/fetcher.js` | `src/lib/fetcher.ts` | 类与算法原样，导出单例 |
| `assets/js/exporter.js` | `src/lib/exporter.ts` | 字体 URL 改用 Vite 的 `?url` 导入 |
| `assets/js/pdf/*.js` | `src/lib/pdf/*.js` | 一行未改（纯算法，无框架依赖） |
| `assets/js/login.js` | `LoginView` + `QrPanel` + `PhonePanel` | 类 → 组件 |
| `assets/js/words.js` | `WordsView` + `WordCard` + `PagerBar` | 同上 |
| `assets/js/app.js` | `App.vue` + `router` + `stores/session` | 编排逻辑拆分 |
| `serve.py` | `vite.config.ts` 的 `server.proxy` | 职责等价 |

---

## 3. 怎么和后端对接

前端只认 **6 个接口**，且全部走**同源相对路径**（`apiBase` 留空时）。

### 3.1 接口契约

| 方法 | 路径 | 请求体 | 期望返回 `data` | 前端消费点 |
| --- | --- | --- | --- | --- |
| POST | `/bbdc/login/autoLogin` | 无 | `{ is_login: boolean }` | 启动/切账号时的登录态判定 |
| GET | `/bbdc/login/qrcode` | 无 | SSE 文本流 | 二维码登录 |
| GET | `/bbdc/login/getAuthCode` | 无 | `{ url, token }` | 图形验证码（`url` 是服务器路径） |
| POST | `/bbdc/login/getPhoneCode` | `{ phone_number, auth_code, token, code: '' }` | 任意 | 发短信验证码 |
| POST | `/bbdc/login/phone` | `{ phone_number, auth_code, token, code }` | 任意 | 手机号登录 |
| GET | `/bbdc/service/getNewword/{page}` | 无 | `{ wordList, pageInfo }` | 生词列表 / 全量抓取 |

必须保持的几条约定：

1. **统一返回体** `{ code, message, data }`：只有 `code === 200` 才算成功，其余 `message` 会直接弹给用户。
2. **分页起点自适应**：前端先请求 `page=0`，若空且 `totalRecord > 0` 再请求 `page=1`，
   之后按 `pageInfo.currentPage` 判断是 0 基还是 1 基。后端保持现状即可。
3. **SSE 消息语义**：
   - 以 `.png/.jpg/.webp` 结尾 → 二维码图片路径，前端拼成 `/output/xxx.png` 显示；
   - `ok` → 登录成功；
   - 命中 `过期/未注册/服务异常/未知状态/失败` → 终态，停止等待；
   - 其它文本 → 原样打到"事件日志"里。
4. **`/output/*` 必须可访问**：后端把二维码、图形验证码写进 `output/` 目录，
   前端按 `/output/<文件名>` 取图（`api.js` 里的 `resolveAssetUrl` 逻辑原样保留）。
5. **会话保存在后端**：前端 `fetch` 用 `credentials: 'omit'`，浏览器不存任何凭证。

### 3.2 方案 A：FastAPI 同源托管（推荐，零 CORS）

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# 1) 先注册 API 与 output，顺序不能反
app.include_router(bbdc_router, prefix="/bbdc")
app.mount("/output", StaticFiles(directory="output"), name="output")

# 2) 最后把前端产物挂到根路径
app.mount("/", StaticFiles(directory="web/dist", html=True), name="web")
```

要点：

- `app.mount("/", ...)` **必须最后注册**，否则 `/bbdc` 会被它先吃掉。
- 前端用 **hash 路由**（`/#/words`），所以不需要 SPA 的 `try_files` 回退，
  `StaticFiles(html=True)` 足够；刷新任何页面都命中 `index.html`。
- 前端 API 地址留空（同源），无需 CORS 配置。

### 3.3 方案 B：nginx 托管 + 反代

```nginx
server {
  listen 80;
  root /srv/web/dist;
  index index.html;

  # 静态资源：hash 文件名，长缓存
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # 页面不缓存，改完前端立刻生效
  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
  }

  # SSE 关键三行：不缓冲、长超时、HTTP/1.1
  location /bbdc/ {
    proxy_pass http://127.0.0.1:20056;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_set_header Connection "";
  }

  location /output/ {
    proxy_pass http://127.0.0.1:20056;
    expires 1h;
  }
}
```

> 二维码登录走 SSE，`proxy_buffering off` 是硬要求；否则浏览器收不到中间状态，
> 表现为"一直等待扫码"。

### 3.4 方案 C：前后端分域部署

1. 打开页面右上角「设置」，把**接口地址**填成后端完整地址，例如 `http://192.168.1.10:20056`；
   如果 `/output` 走别的域名/CDN，再填**静态资源地址**。
2. 后端需要放行跨域（前端不发 cookie，所以 `allow_credentials` 保持 `False` 即可）：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend.example.com"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
```

配置存在 `localStorage` 的 `bbdc.wordlist.settings.v1` 里，用户可随时在设置里改回默认。

### 3.5 部署注意

| 项 | 说明 |
| --- | --- |
| 中文字体 11MB | `NotoSansSC-Regular.ttf` 只在导出时才下载，前端用 `cache: 'force-cache'`。请给 `.ttf` 配 `Cache-Control: public, max-age=31536000, immutable`，否则每次导出都要重下 |
| SSE | 不能开 gzip、不能缓冲；反向代理要 `proxy_buffering off` |
| 鉴权模型 | 后端用服务器端 session 记住登录态（前端不带 cookie），属**单用户本地服务**模型，多人同时访问会串号。若要多用户，需要后端按 token 隔离 session，前端再把 token 放进请求头 |
| 构建产物 | `base: './'`，可以挂在任意子路径（`/`、`/app/` 都行），不需要改配置 |

---

## 4. 本轮重构的验收记录

- 生词本页、登录页、二维码面板、手机号面板：与旧版**逐像素一致**（截图对比，除鼠标 hover 态）。
- 三种模式的 PDF：与旧版**同一份数据导出的文件逐像素一致**（同为 80694 bytes，仅 PDF 元数据 `CreationDate` 不同）。
- 功能回归：分页、跳页、当前页搜索、断点续抓、取消抓取、设置保存/恢复默认、切换账号、
  会话失效回登录页，全部通过。
- 构建产物在**子路径**（`/app/`）下加载正常，控制台无报错。
- 请求次数实测：`autoLogin` 每个页面生命周期只发 **1 次**；切换路由（含前进/后退/改 hash）**0 次**；
  只有「重新检测」按钮、登录成功、保存设置会主动再检测一次；F5 整页重载必然重发。

## 5. 与旧版的差异（仅这些）

1. 多了一个 hash 路由：`/#/login`、`/#/words`。刷新时仍以 `autoLogin` 结果为准。
2. 原来的 `window.__app` 调试钩子没有保留（Vue 里改用 Vue Devtools 更直接）。
3. 原 HTML 里的 `id`（如 `#btnExport`、`#delayMin`）不再需要，已由组件内的响应式绑定取代。
   如果有自动化脚本依赖这些选择器，告诉我，我可以补回来。
4. `stores/session.ts` 的 `check()` 改成**单飞**（single-flight）：并发触发（例如保存设置后
   立刻点「切换账号」）只会真正发一次 `autoLogin`。单次触发的行为与原来完全一致。
