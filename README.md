# 英语单词助手

> 导出「不背单词」生词本，并生成pdf

![](assets/img_1.png)

## 目录

- [一、这个项目能做什么](#一这个项目能做什么)
- [二、快速开始](#二快速开始)
  - [环境要求](#0-环境要求)
  - [安装依赖](#1-安装依赖)
  - [下载离线词典（必须）](#2-下载离线词典必须)
  - [启动](#3-启动)
- [三、使用教程](#三使用教程)
  - [前置条件](#1前置条件)
  - [登录](#2登录)
  - [浏览生词本](#3浏览生词本)
  - [导出默写 PDF](#4导出默写-pdf)
- [四、技术结构（简）](#四技术结构简)
  - [接口一览](#接口一览)
- [五、F&Q](#五fq)
- [隐私与免责](#隐私与免责)
- [许可](#许可)
- [致谢](#致谢)


---
## 一、这个项目能做什么

| 能力              | 说明                                                        |
| --------------- | --------------------------------------------------------- |
| **读取生词本**       | 登录后分页拉取「不背单词」生词本，每页 24 词，含单词、美/英音标、加入时间                   |
| **自动补全释义**      | 用本地 ECDICT-ultimate 离线词典补齐中文释义、词性、柯林斯星级、牛津核心、考试标签、词频等     |
| **浏览与搜索**       | 卡片式生词列表，显示音标、分词性释义、标签，支持在本页内按单词或释义过滤                      |
| **一键导出默写 PDF**  | 三种版式：英文+释义（双向默写）、仅英文、仅中文，A4 双栏，带序号与勾选框，可直接打印              |
| **全量抓取 + 断点续抓** | 自动翻完所有页，请求间插入随机延迟防限流；中途取消后再次点击可接着抓                        |
| **登录态保持**       | 扫码 / 手机验证码登录，Cookie 以 pickle 存到本地 `cookies/`，下次启动自动检测登录状态 |
| **字体子集嵌入**      | PDF 里只嵌入本次用到的中文字形，导出的文件通常只有几十 KB，手机、打印机都不会出现方块字           |

> 项目与「不背单词」官方无关，仅通过其网页端接口读取你本人账号下的生词本，不提供任何破解或代登录服务。

---

## 二、快速开始

### 0. 环境要求

- **Python 3.12+**
- 能访问 `bbdc.cn`与 GitHub（首次下载词典）
- 推荐用 [uv](https://docs.astral.sh/uv/) 管理依赖；用 pip 也可以

### 1. 安装依赖

```bash
# 方式一：uv（项目自带 uv.lock，一键装齐，推荐）
uv sync
uv run python -m app.main        # 用 uv 运行时前面加 uv run

# 方式二：pip
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install aiofiles ddddocr fastapi httpx pydantic pyyaml reportlab requests sse-starlette uvicorn
```

> 项目没有配置构建后端（`build-system`），所以 `pip install -e .` 会因为自动发现包失败而报错。直接按上面的依赖列表安装即可，源码不需要装进环境。

### 2. 下载离线词典（必须）

释义来自 **ECDICT-ultimate** 的 SQLite 版本。项目**不附带**这个数据库（约一百多 MB），需要自己下载一次：

**下载地址**

<https://github.com/skywind3000/ECDICT-ultimate/releases/download/1.0.0/ecdict-ultimate-sqlite.zip>

**放到项目根目录下的 `translate/ultimate.db`**

下载 zip → 解压 → 把里面的 `ultimate.db` 拖进项目的 `translate/` 文件夹。

最终目录应该长这样：

```
项目根目录/
├── app/
├── config/
├── fonts/
├── web/
└── translate/
    └── ultimate.db      ← 必须有这个文件
```

> **为什么这步不能省**：启动时 `StarDict` 会用 `sqlite3.connect()` 打开这个路径。文件不存在时 SQLite 会**静默新建一个空库**，查词全部返回空，接口随即报错。所以看到「释义拿不到 / 接口 500」，先回来检查这个文件。
>
> 需要换词典也可以：任何兼容 ECDICT 表结构（`stardict` 表）的 SQLite 文件都可以直接替换 `translate/ultimate.db`。

### 3. 启动

```bash
# uv
uv run python -m app.main

# 或者已激活虚拟环境
python -m app.main
```

默认监听 `http://127.0.0.1:20056`，浏览器打开即可：

```
http://127.0.0.1:20056
```

改端口或监听地址，编辑 `config/config.yaml`：

```yaml
web:
  host: 127.0.0.1
  port: 20056
```

> 想改前端界面时，可以在**另一个终端**跑 `python web/serve.py`（默认 5173 端口，会把 `/bbdc/*`、`/output/*` 反向代理到后端）。注意必须用 HTTP 打开页面，直接双击 `index.html`（`file://`）会因同源策略加载不了字体和模块。

---

## 三、使用教程

### 1、前置条件：
在[不背单词生词本](https://bbdc.cn/newword)（或手机app）中添加单词到生词本

***注意：***

1.必须添加到默认的单词本，即生词本中，否则获取不到数据。

2.数据可能有延迟，只有[不背单词生词本页面](https://bbdc.cn/newword)中显示了单词，本项目才可接收到。

<img src="assets/img_3.png" alt="img_3" width="300">

### 2、登录

打开首页，两种方式任选：

- **二维码登录**：点「开始扫码登录」，用微信扫码并在手机上确认。页面会实时显示「已扫描，待确认 → ok」的状态流；二维码过期就重新点一次。
- **手机号登录**：填手机号 → 点验证码图片获取图形验证码 → 填图形码后点「获取验证码」→ 填短信码 → 登录。

登录成功后 Cookie 会写到 `cookies/cookies.pkl`。下次打开页面会自动检测登录态，顶部状态显示「已登录」就直接进生词本；失效时点「切换账号」重新登录。

### 3、浏览生词本

进入生词本后，每一页展示 24 个词：单词、音标（优先美音）、按词性拆分的释义、柯林斯星级 / 牛津核心 / 四六级等标签，以及加入日期。

- 顶部搜索框只过滤**当前页**，不会触发额外的网络请求
- 底部分页可上一页 / 下一页，也能直接输入页码跳转

### 4、导出默写 PDF

右侧「导出默写 PDF」面板选版式，再点「抓取全部并导出」：

| 模式                | 每页词数 | 版式                    | 适合               |
| ----------------- | ---- | --------------------- | ---------------- |
| **英文+释义**（`both`） | 20   | 左栏印单词、释义留空；右栏印释义、单词留空 | 双向自测：看词写义 + 看义写词 |
| **仅英文**（`en`）     | 40   | 两栏连续排布，只印英文单词，释义栏留白   | 中译英默写            |
| **仅中文**（`zh`）     | 40   | 两栏连续排布，只印中文释义，单词栏留白   | 英译中默写            |

> 几个实用细节：
> - **抓取间隔**：默认每次请求随机等 300–900 ms，可在面板里改。词多的时候别调到 0，容易触发服务端限流。
> - **进度与统计**：底部实时显示进度条、已完成页数、已抓词数和耗时。
> - **断点续抓**：中途点「取消抓取」，已抓的页会留在内存里；再次点导出会跳过已抓页继续。
> - **PDF 在浏览器里生成**：首次导出要先下载约 10 MB 的中文字体（之后走缓存），字体只嵌入用到的字形，所以成品质地很轻。文件名形如 `单词默写_英文+释义_20260101-1200.pdf`。

---

## 四、技术结构（简）

```
app/
├── main.py                  # 启动入口（uvicorn）
├── api/
│   ├── app.py               # FastAPI 实例、lifespan（初始化 httpx / 词典连接）
│   ├── static_web.py        # 挂载 web/ 与 output/ 静态目录
│   └── routers/
│       ├── bbdc_login.py    # 登录相关路由（二维码走 SSE）
│       └── bbdc_newword.py  # 生词本分页路由
├── services/bbdc_service.py # 业务编排：登录、验证码、抓词、查词补全
├── oper/
│   ├── httpx_oper.py        # httpx 封装（UA、超时、JSON）
│   └── ultimate_oper.py     # StarDict：ECDICT SQLite 查询层
├── repositories/            # Cookie 持久化、文件写入
├── domain/                  # Word / UltimateResult 数据模型
└── util/generate_pdf_util.py# 服务端 PDF 版式参考实现（reportlab）

web/                         # 纯静态前端（原生 ES Module，无需构建）
├── index.html
├── serve.py                 # 本地调试服务器 + 反向代理
└── assets/
    ├── js/pdf/              # 自实现的 TrueType 子集化 + PDF 写入
    └── fonts/               # 思源黑体（Noto Sans SC）
```

 接口一览

| 方法   | 路径                                | 说明                    |
| ---- | --------------------------------- | --------------------- |
| GET  | `/bbdc/login/qrcode`              | 微信扫码登录，SSE 推送状态与二维码路径 |
| POST | `/bbdc/login/phone`               | 手机号 + 图形码 + 短信码登录     |
| GET  | `/bbdc/login/getAuthCode`         | 获取图形验证码图片与 token      |
| POST | `/bbdc/login/getPhoneCode`        | 发送短信验证码               |
| POST | `/bbdc/login/autoLogin`           | 检测本地 Cookie 是否仍有效     |
| GET  | `/bbdc/service/getNewword/{page}` | 分页生词（含 ECDICT 释义）     |
| GET  | `/output/...`                     | 二维码、验证码图片等静态文件        |
| GET  | `/`                               | 前端页面                  |

统一返回体：`{ code, message, data }`。

---

## 五、F&Q

**Q：接口 500，释义是空的 / 一打开生词本就报错？**  
九成是 `translate/ultimate.db` 没放好。确认文件名完全一致（不是 `ecdict.db`、不是套了一层文件夹），且项目根目录下确实是 `translate/ultimate.db`。

**Q：二维码图片显示不出来？**  
确认是通过 `http://127.0.0.1:20056` 访问（后端会自动把 `output/` 挂到 `/output`）。图片实际保存在 `output/qrcode/qrcode.jpg`，前端也提供了「复制路径」的兜底方案。

**Q：抓到一半断了，或者提示请求过于频繁？**  
把导出面板里的间隔调大（比如 800–1500 ms）再试。已抓页面会保留，重新导出不用从头来。

**Q：为什么导出 PDF 第一次特别慢？**  
首次要下载约 10 MB 的思源黑体并解析，之后浏览器缓存会复用。这是为了保证中文在任何设备上都能正常显示（不嵌入字形的 PDF 在手机上常显示为空白）。

**Q：端口被占用？**  
改 `config/config.yaml` 里的 `port`，重启即可。

**Q：登录态突然失效？**  
上游 Cookie 有有效期。点「切换账号」重新登录；也可以直接删掉 `cookies/cookies.pkl` 再登录一次。

**Q：为什么这里的释义可能和「不背单词」里看到的不一样？**  
因为翻译的来源不同，本项目基于开源库[ECDICT](https://github.com/skywind3000/ECDICT-ultimate)获得翻译数据，因此和不背单词的官方翻译有出入

---

### 隐私与免责

- Cookie 以 pickle 形式**仅保存在本机** `cookies/cookies.pkl`，不会上传到任何服务器。请不要把这个文件提交到 Git 或分享给别人。
- 二维码、验证码图片写在 `output/` 下，属于临时文件，可随时清理。
- 本工具通过「不背单词」网页端接口读取**本人账号**的数据，请控制抓取频率，避免对上游服务造成压力。
- 仅供个人学习、复习使用。请勿用于商业用途、批量采集或再分发他人词表。

### 许可

- 本项目代码：MIT（见 `LICENSE`）
- ECDICT 数据：MIT，版权归 Linwei / skywind3000 及贡献者（见 `LICENSES/ECDICT-MIT.txt`）
- 思源黑体 Noto Sans SC：SIL Open Font License 1.1（见 `LICENSES/NotoSansSC-OFL.txt`）

### 致谢

本项目的释义、音标补充、词性、柯林斯星级、牛津核心标记、考试标签、词频等信息，全部来自开源项目 **ECDICT-ultimate**：

- 项目主页：<https://github.com/skywind3000/ECDICT-ultimate>
- 本项目使用的数据：<https://github.com/skywind3000/ECDICT-ultimate/releases/download/1.0.0/ecdict-ultimate-sqlite.zip>

ECDICT 由 **skywind3000** 创建并长期维护，采用 MIT 协议，是中文社区里质量与覆盖度都很出色的离线英汉词典数据。**感谢作者与所有贡献者。**

数据来源的边界请留意：

- ECDICT 本身是对多部开源词典数据的整理与合并，其版权与许可遵循上游约定（见 `LICENSES/ECDICT-MIT.txt`）
- 本项目只读取你本地这份 `ultimate.db`，**不分发、不转售**词典数据
- 若你二次分发本项目的成品或衍生数据，请自行确认符合 ECDICT 及其上游词典的许可要求


