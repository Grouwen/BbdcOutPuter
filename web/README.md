# 生词本工坊（Vue 3 + Vite + TypeScript）

> 读取「不背单词」生词本 → 浏览释义 → 导出 A4 默写 PDF → 用同一份词表生成英语阅读与选择题。

界面按「纸质复习册」的方向重做过一轮：暖白纸底、朱红单色强调、英文用衬线、中文用无衬线、
细线分隔、等宽数字编号。功能、接口、PDF 版式与文案语义保持兼容，只改前端呈现与交互组织。

本轮在原有功能上新增：

- **阅读练习**：调用后端 `POST /llm/generate/readComprehension`（SSE），把生词本全部单词交给大模型，
  生成一篇英语阅读 + 5 道四选一题 + 中文解析，可作答、显示答案、切换正文字号。
- **界面改版**：新的设计变量与版式（生词本改为词条一览表、登录页重排、导出面板重做），
  导航新增「阅读练习」，窄屏适配到 390px。

---

## 1. 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173，已内置 /bbdc、/llm 与 /output 的反向代理
npm run build      # 类型检查 + 产出 dist/
npm run preview    # 本地预览构建产物
npm run verify     # 自检：转义规则、洗牌均匀性、PDF 里的实际绘制顺序、阅读解析与 SSE 帧
```

开发期后端地址默认 `http://127.0.0.1:20056`，需要改就：

```bash
VITE_API_TARGET=http://192.168.1.10:20056 npm run dev
```

> 原来的 `serve.py` 已删除，它的职责（静态托管 + `/bbdc`、`/llm`、`/output` 反代）由
> `vite.config.ts` 的 `server.proxy` 承担，前端代码依旧只用**同源相对路径**，
> 与「构建产物交给后端托管」后的行为完全一致。

---

## 2. 目录结构

```
src/
├── main.ts                 入口
├── App.vue                 顶栏（品牌 / 主导航 / 登录态 / 设置）+ 视图容器 + 全局提示
├── router/index.ts         /login、/words、/reading（hash 模式）
├── api/
│   ├── client.ts           fetch 封装：超时/取消/错误归类/统一返回体解包
│   ├── sse.ts              SSE over fetch：读流、切帧、解析 event/data
│   └── index.ts            7 个后端接口 + 静态资源 URL 解析
├── stores/
│   ├── settings.ts         localStorage 配置（导出模式、间隔、乱序、阅读字号）
│   ├── session.ts          登录态（唯一事实来源：autoLogin）
│   ├── vocab.ts            词表元信息（总词数 / 每页词数），跨页共享
│   ├── reading.ts          阅读生成状态机：进度、失败、文章、作答、字号
│   └── toast.ts            提示队列
├── lib/
│   ├── fetcher.ts          WordFetcher（纯逻辑类 + 全局单例）
│   ├── exporter.ts         字体加载 → 排版 → 下载
│   ├── reading.ts          大模型返回值 → 文章/题目形状（含容错与转义）
│   ├── word-utils.ts       Word 对象 → 界面/PDF 形状（字段语义的唯一解释处）
│   ├── text.ts             后端文本的解析与转义（剥标签/解实体/压空白/URL 白名单）
│   ├── shuffle.ts          乱序导出用的 Fisher–Yates 洗牌
│   ├── utils.ts            sleep/randomInt/formatDate/formatBytes
│   └── pdf/                pdfdoc.js、ttf.js、wordlist.js（原样保留，未改动）
├── components/
│   ├── QrPanel.vue         二维码登录（EventSource）
│   ├── PhonePanel.vue      手机验证码登录
│   ├── WordEntry.vue       词条行（单词 / 音标 / 释义 / 变形 / 标签 / 发音）
│   ├── PagerBar.vue        分页条
│   ├── ExportPanel.vue     模式选择 / 间隔设置 / 抓取进度 / 导出
│   ├── SettingsDialog.vue  接口地址设置
│   └── ToastStack.vue      提示渲染
├── views/
│   ├── LoginView.vue       登录页（说明 + 纸样预览 + 登录卡）
│   ├── WordsView.vue       生词本页（页头 + 词条一览 + 导出面板）
│   └── ReadingView.vue     阅读练习页（文章 + 题目 + 出题面板）
├── styles/app.css          设计变量 + 全部界面样式（本轮重写）
└── assets/fonts/           两个 TTF（只用于 PDF 嵌入，构建时带 hash 输出）
scripts/verify.ts           本地自检（转义规则 + 洗牌分布 + PDF 顺序 + 阅读解析），npm run verify
```

---

## 3. 设计说明（本轮改版）

设计变量集中在 `src/styles/app.css` 的 `:root`，全部界面只引用变量：

| 组 | 变量 | 用法 |
| --- | --- | --- |
| 纸 | `--paper` `--paper-deep` `--sheet` | 页面底、分段控件底、卡片面 |
| 墨 | `--ink` `--ink-2` `--ink-3` | 标题 / 正文 / 次要信息（对比度均 ≥ 4.5:1） |
| 线 | `--rule` `--rule-soft` `--rule-strong` | 分隔线、输入框描边，代替重阴影 |
| 朱 | `--seal` `--seal-ink` `--seal-soft` `--seal-line` | 主动作、编号、强调、焦点环 |
| 语义 | `--ok` `--err` `--warn` 及各自的 soft/line | 答题对错、错误态、登录状态 |
| 字 | `--serif` `--sans` `--mono` | 英文词条与文章用衬线，中文用无衬线，编号与数字用等宽 |

几条贯穿全站的规则：

1. **一屏一个主角**：生词本页是词条列表（导出面板在侧栏），阅读页是文章（出题面板在侧栏），
   登录页是登录卡（说明与纸样在左侧）。
2. **不叠卡片**：分区用 1px 细线与留白，不再「卡片里再放卡片」；只有真正的纸面（文章、登录卡、面板）才用面。
3. **编号有语义**：页头的 `01` / `02` 对应导航顺序；词条行左侧是序号；题目用圆形题号。
4. **动效三处**：视图进入（`view-in`）、生成进度（确定进度条 / 不定长滑动条 + 步骤点亮）、
   文章与题目入场（`sheet-in` + 题目逐个 `reveal`）；选项、按钮、行悬停只做 120–180ms 的颜色与位移。
   全部尊重 `prefers-reduced-motion`。

---

## 4. 怎么和后端对接

前端只认 **7 个接口**，且全部走**同源相对路径**（`apiBase` 留空时）。

### 4.1 接口契约

| 方法 | 路径 | 请求体 | 期望返回 | 前端消费点 |
| --- | --- | --- | --- | --- |
| POST | `/bbdc/login/autoLogin` | 无 | `data.is_login` | 启动 / 切账号时的登录态判定 |
| GET | `/bbdc/login/qrcode` | 无 | SSE 文本流 | 二维码登录 |
| GET | `/bbdc/login/getAuthCode` | 无 | `{ url, token }` | 图形验证码 |
| POST | `/bbdc/login/getPhoneCode` | `{ phone_number, auth_code, token, code: '' }` | 任意 | 发短信验证码 |
| POST | `/bbdc/login/phone` | `{ phone_number, auth_code, token, code }` | 任意 | 手机号登录 |
| GET | `/bbdc/service/getNewword/{page}` | 无 | `{ wordList, pageInfo }` | 生词列表 / 全量抓取 |
| POST | `/llm/generate/readComprehension` | 无 | SSE 事件流 | 阅读练习 |

必须保持的几条约定：

1. **统一返回体** `{ code, message, data }`：只有 `code === 200` 才算成功，其余 `message` 会直接弹给用户。
2. **分页起点自适应**：前端先请求 `page=0`，若空且 `totalRecord > 0` 再请求 `page=1`，
   之后按 `pageInfo.currentPage` 判断是 0 基还是 1 基。后端保持现状即可。
3. **二维码 SSE 消息语义**（`sse_starlette` 文本流）：
   - 以 `.png/.jpg/.webp` 结尾 → 二维码图片路径，前端拼成 `/output/xxx.png` 显示；
   - `ok` → 登录成功；
   - 命中 `过期/未注册/服务异常/未知状态/失败` → 终态，停止等待；
   - 其它文本 → 原样打到「事件日志」里。
4. **`/output/*` 必须可访问**：二维码、图形验证码写在 `output/` 下，前端按 `/output/<文件名>` 取图。
5. **会话保存在后端**：前端 `fetch` 用 `credentials: 'omit'`，浏览器不存任何凭证。
6. **阅读接口是 POST + SSE**，原生 `EventSource` 只能 GET，所以 `src/api/sse.ts` 自己读 `fetch` 的流并切帧。

### 4.2 阅读接口的事件格式

后端用 FastAPI 原生 `ServerSentEvent`，每帧只有 `event:` 与 `data:` 两行，`data` 一律是 JSON：

| `event` | `data` 形状 | 前端处理 |
| --- | --- | --- |
| `progress` | 两种都见过：<br>① 整页结果 `{ wordList:[…], pageInfo:{ currentPage, totalPage, … } }`<br>② 只有文案 `{ message: '获取第1.0/21.0页单词成功。' }` | 优先读 `pageInfo`（0 基 +1、`totalPage` 是页数）；没有 `pageInfo` 时用文案里的页码（**允许小数**，首帧为 0 判为 0 基，否则 1 基）。主区域显示「第 N / M 页 · 已读 K 词 · 已用时 T 秒」 |
| `warn` | `{ code:2001, message:'获取页面20失败，将重试一次。原始返回：…', data:{} }` | **不是终态**：只更新状态行，等后端重试，不中断 |
| `words_ready` | `{}` | 取词结束，进入写作阶段 |
| `token` | `{ token: '{"title":"…' }`（后端只给 partial JSON 的前 100 个字符） | 数片段、尝试读出标题，不做增量渲染 |
| `done` | `{ code:200, message:'ok', data:{ result: { title, content, questions, core_point } } }` | 解析成文章与题目 |
| `error` | `{ code:2001, message:'api_key或model_name为空', data:{} }` | 终态：直接展示 message，附「去服务端 .env 补配置」的提示 |

题目里 `options[].option_number` 可能是 `A` / `A.` / `1`，`correct_option` 可能是字母也可能是整条选项内容，
`lib/reading.ts` 统一归一化并在解析不出答案时留空，界面据此决定是否标红/标绿。

> **对接注意**：同一份代码在不同环境跑出来，`progress` 的形状可能不一样——实测曾同时遇到
> 「整页结果 + 从第 20 页起」和「只有文案、页码是 `1.0/21.0` 这种小数且 1 基」两种。
> 前端两种都兼容，但**后端自己最好统一**：页码建议给整数、写清 0 基还是 1 基；
> `current_page = 20` 这种起始值会让词少页数的账号直接取空。

### 4.3 方案 A：FastAPI 同源托管（推荐，零 CORS）

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# 1) 先注册 API 与 output，顺序不能反
app.include_router(bbdc_router, prefix="/bbdc")
app.include_router(llm_router, prefix="/llm")
app.mount("/output", StaticFiles(directory="output"), name="output")

# 2) 最后把前端产物挂到根路径
app.mount("/", StaticFiles(directory="web/dist", html=True), name="web")
```

要点：

- `app.mount("/", ...)` **必须最后注册**，否则 `/bbdc`、`/llm` 会被它先吃掉。
- 前端用 **hash 路由**（`/#/words`、`/#/reading`），刷新任何页面都命中 `index.html`。
- 前端 API 地址留空（同源），无需 CORS 配置。

### 4.4 方案 B：nginx 托管 + 反代

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

  # 阅读生成同样是 SSE，读超时给足（大模型可能写很久）
  location /llm/ {
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

> 两个 SSE 接口都不能开 gzip、不能缓冲，否则浏览器收不到中间状态：
> 二维码表现为「一直等待扫码」，阅读生成表现为「一直转圈到结束」。

### 4.5 方案 C：前后端分域部署

1. 打开页面右上角「设置」，把**接口地址**填成后端完整地址，例如 `http://192.168.1.10:20056`；
   如果 `/output` 走别的域名/CDN，再填**静态资源地址**。
2. 后端放行跨域（前端不发 cookie，`allow_credentials` 保持 `False` 即可）：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend.example.com"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
```

配置存在 `localStorage` 的 `bbdc.wordlist.settings.v1` 里，用户可随时在设置里改回默认。

### 4.6 部署注意

| 项 | 说明 |
| --- | --- |
| 中文字体 11MB | `NotoSansSC-Regular.ttf` 只在导出时才下载（`cache: 'force-cache'`）。请给 `.ttf` 配 `Cache-Control: public, max-age=31536000, immutable` |
| SSE | 不能开 gzip、不能缓冲；反向代理要 `proxy_buffering off`，`/llm` 的读超时要足够长 |
| 大模型配置 | 后端 `.env` 需要 `api_key` 与 `model_name`，缺失时阅读接口返回 `api_key或model_name为空` |
| 鉴权模型 | 后端用服务器端 session 记住登录态（前端不带 cookie），属**单用户本地服务**模型 |
| 构建产物 | `base: './'`，可以挂在任意子路径（`/`、`/app/` 都行），不需要改配置 |

---

## 5. 阅读练习（本轮新增）

### 5.1 用户流程

1. 进入「阅读练习」→ 空态说明会生成什么；
2. 点「生成阅读文章」→ 面板分两步显示 `读取生词本`（含页码）与 `写文章与题目`（含模型返回的标题片段、已用时）；
3. 出结果后：文章（衬线、限宽 70ch）、核心考点、5 道题；
4. 作答后点「显示答案」→ 正确项标绿、选错项标红、每题展开解析、标题右侧显示「答对 N / 5」；
5. 可切正文字号（小 / 中 / 大，写入 `localStorage`）、重新生成、停止生成。

### 5.2 状态与容错

- **生成中**：主区域标题直接写当前步骤（「正在读取生词本…」/「正在写这篇文章…」），副标题给
  「第 N / M 页 · 已读 K 词 · 已用时 T 秒」，并带一条进度条（取词阶段封顶 60%，写作阶段是不定长滑动条，
  后端不提供百分比，不编造）。侧栏只保留两步流程，不再重复进度条。
- **重试**：后端的 `warn`（某页失败、将重试一次）只更新状态行，不当作失败。
- **失败**：展示后端原文（例如 `api_key或model_name为空`）+ 一句可执行的提示；「再试一次」不丢页面。
- **中断**：120 秒收不到任何事件会主动中断并提示，避免界面一直转圈。
- **提前结束**：流结束但没有 `done` 事件，按失败处理，不会把半截结果当成功。
- **留存**：结果与作答保存在 `sessionStorage`，切页、误刷新都还在；只在当前标签页有效，关掉标签页后清空（界面有明示）。
- **窄屏工具栏**：文章上方常驻「字号 / 判分并显示答案 / 跳到题目 N 道」，手机上不用滚完整篇文章找按钮。

### 5.3 安全与转义

大模型返回的文本和词典数据走同一层 `lib/text.ts`：剥 HTML、解实体、压控制字符，
答案字母再做归一化；音频地址仍走协议白名单。界面一律用 Vue 插值，不拼 HTML。

---

## 6. 验证记录

```bash
npm run build     # vue-tsc 类型检查 + 构建通过
npm run verify    # 62 项断言全部通过（转义 / 字段映射 / 洗牌 / PDF 绘制顺序 / 阅读解析与 SSE 帧）
```

浏览器联调（本地 mock：47 词、字段刻意做脏 `<b>` / `&amp;` / `&lt;b&gt;`、字符串型 `translation`）：

| 检查点 | 结果 |
| --- | --- |
| 词卡标题 `<b>abandon</b>` | 显示 `abandon` |
| 释义 `放任，狂热&amp;放纵` | 显示 `放任，狂热&放纵` |
| 分页、页内搜索、刷新 | 正常；搜索结果计数显示在搜索框右侧（`n / 24`） |
| 导出面板模式 / 乱序开关 | 切换即写入 localStorage，刷新后保持；单语模式配对应的乱序说明 |
| 导出面板「请求间隔」 | 默认收起、只显示当前值；展开后可改，改完即落盘 |
| 阅读：生成 → 出文 | 取词阶段标题为「正在读取生词本…」，副标题显示「第 N / M 页 · 已读 K 词」；读完切「正在写这篇文章…」并显示实时标题，约 5s 出结果 |
| 阅读：某页失败重试 | `warn` 只更新状态行（「获取页面 N 失败，将重试一次」），不中断，随后继续推进页码 |
| 阅读：作答 2 题 + 判分 | 正确项绿、选错项红、解析展开、`答对 2 / 5（未作答 2 题）`；有作答时按钮文案为「判分并显示答案」 |
| 阅读：字号切「大」 | 正文 20px，切页后保持 |
| 阅读：停止生成 | 回到空态并提示「已停止生成」 |
| 阅读：接口报错 | 展示 `api_key或model_name为空` + 可执行提示 |
| 阅读：刷新页面（F5） | 文章、用时、字号、作答从 `sessionStorage` 恢复，不用重新生成 |
| 阅读：切到生词本再回来 | 文章、作答、字号仍在 |
| 窄屏 390×844 | 顶栏分两行；标题下有「导出默写纸」入口；词条行纵向排布；登录卡在标题下方；出题面板在正文之前；生成后文章上方有操作条 |

---

## 7. 与旧版的差异

1. 新增路由 `/#/reading`；已登录时深链会保留目标页，不再一律跳到生词本。
2. 新增阅读接口与 SSE 客户端、阅读状态机、文章解析层；结果存 `sessionStorage`，刷新不丢。
3. 词条从卡片网格改为「序号 / 单词 / 释义+标签 / 加入时间」的一览表行；发音按钮保留。
4. 导出面板的三种模式从三张卡片改为分段控件 + 一行说明；请求间隔收进折叠项；其余设置项与默认值不变。
5. 登录页新增第四步说明与阅读入口描述；登录卡在窄屏提到标题正下方；二维码等待中可随时重新获取。
6. 窄屏（≤720px）新增「导出默写纸」入口与阅读页操作条，顶栏改为两行。
7. 旧文件 `src/components/WordCard.vue` 由 `WordEntry.vue` 取代，已删除。
