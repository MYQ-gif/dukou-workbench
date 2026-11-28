# CONTRACT · 渡口 (Dukou) API 契约 v2

> v1 冻结于 2026-11-21。**v2 于 2026-11-28 由后端对齐实现**：把代码里早已存在、但一直没写进文档的接口与字段补全。
> 规则不变：**任何人要改这份文件，必须先说明原因，三人同意后才能改。**
> 前端、后端、AI 链路都以本文件为唯一事实来源。
>
> v2 不删除任何 v1 字段，不改变任何已有字段的类型或含义 —— **现有前端无需修改即可继续工作**。
> 新增内容在下文均标注 `[v2 新增]`。

## 0. 通用约定

- Base URL 本地：`http://localhost:8790`（**[v2 变更]** 端口统一为 `process.env.PORT || 8790`；8787 常被本机网关占用）；线上：待定
- 所有请求/响应 `Content-Type: application/json`，上传接口除外
- 时间一律 ISO 8601 字符串（`2026-12-05T10:00:00.000Z`）
- id 一律字符串（服务端生成，前端不要自己造）
- 错误统一返回：

```json
{ "error": { "code": "NOT_FOUND", "message": "product not found" } }
```

错误码：`BAD_REQUEST` `NOT_FOUND` `METHOD_NOT_ALLOWED` `PAYLOAD_TOO_LARGE` `RATE_LIMITED` `INTERNAL`

> **[v2 新增]** `METHOD_NOT_ALLOWED`：方法不对时统一返回它（HTTP 405）并带 `Allow` 响应头。
> v1 时期 products 分支在这种场景返回 `BAD_REQUEST`、assets 分支返回 `METHOD_NOT_ALLOWED`，现已统一。

- 分页参数：`?limit=20&cursor=<id>`，返回 `{ "items": [...], "nextCursor": "…" | null }`
- **[v2 新增]** 轮询间隔统一 **1000ms**（v1 文档写 1.5s、README 写 1.2s、代码是 1s，现以 1000ms 为准）
- **[v2 新增]** 限流：写接口按 IP 滑动窗口限流，超限返回 **429 + `RATE_LIMITED`**，响应头带 `Retry-After`（秒）。
  本机回环地址默认豁免（可用 `RL_LOCALHOST=strict` 关闭豁免）。

| 动作 | 默认上限 | 环境变量 |
|------|----------|----------|
| `POST /api/jobs` | 20 次/分 | `RL_JOBS_PER_MIN` |
| `POST /api/uploads` | 30 次/分 | `RL_UPLOADS_PER_MIN` |
| 其余写接口（建/改商品、记账、删恢复资产、自检） | 120 次/分 | `RL_WRITES_PER_MIN` |

- **[v2 新增]** 额度护栏（**仅 `AI_MOCK=0` 真实模式生效**，mock 一律放行）。超限同样返回 429 `RATE_LIMITED`：

| 护栏 | 默认 | 环境变量 |
|------|------|----------|
| 单次任务出图张数 | 6 | `QUOTA_IMAGES_PER_JOB` |
| 当日出图张数 | 120 | `QUOTA_IMAGES_PER_DAY` |
| 当日预估花费（CNY） | 80 | `QUOTA_SPEND_PER_DAY_CNY` |

## 1. 数据模型

### Product（商品，全站主键）

```json
{
  "id": "p_8f2a",
  "title": "手作家具 / 餐桌",
  "category": "furniture",
  "platform": "shopee",
  "market": "sg",
  "targetLangs": ["en", "th"],
  "sellingPoints": ["实木手工", "老料新做"],
  "rawText": "老爸给奶奶手做的桌子…",
  "status": "draft | ready | listed",
  "assets": ["a_1", "a_2"],
  "brief": { "usage": "…", "market": "…", "selling": "…", "angles": ["front"], "model": "yes|no", "askedAt": "…" },
  "visualSpec": { "version": 1, "lighting": "…", "composition": "…", "palette": { "base": "#…", "accent": "#…", "support": "#…" } },
  "analysis": { "category": "…", "categoryName": "…", "positioning": "…", "target_user": "…", "visual_style": "…", "selling_points": [], "differences": [] },
  "detailOrder": ["a_5", "a_6"],
  "createdAt": "…",
  "updatedAt": "…"
}
```

**[v2 新增] 5 个字段**（代码与前端一直在用，v1 只补过 `detailOrder`）：

| 字段 | 类型 | 谁写 | 用途 |
|------|------|------|------|
| `market` | string | 前端 PATCH / 建商品时按平台取默认 | 目标市场（见 `/api/meta` 的 `markets`） |
| `brief` | object | 前端「视觉导演确认卡」PATCH | 用户确认的交付意图；`askedAt` 存在即表示已确认过，前端据此跳过二次提问 |
| `visualSpec` | object | `analyze`/`visual` 任务写入 | 主视觉规范（光影/构图/色板），出图时锁定复用 |
| `analysis` | object | `analyze` 任务写入 | 8 维商业分析结果 |
| `detailOrder` | string[] | 前端拖拽排序 PATCH | 详情段展示顺序（asset id 数组） |

> 注意：`GET /api/products/:id` 返回的 `assets` 是**完整 Asset 对象数组**（服务端已展开），
> 而列表接口 `GET /api/products` 里的 `assets` 仍是 id 数组。前端按详情接口渲染即可。

### Asset（素材/产物）

```json
{
  "id": "a_1",
  "productId": "p_8f2a",
  "kind": "upload | angle_real | refined | angle | main | display | marketing | mockup | detail | sub | copy | video | subtitle | clip | faq | anchor | keyword_layer | inquiry | reply",
  "url": "/files/abc.jpg",
  "width": 1242,
  "height": 1660,
  "meta": { "model": "mock-image-v1", "lang": "en", "platform": "shopee", "originalName": "我的照片.jpg" },
  "deletedAt": null,
  "createdAt": "…"
}
```

**[v2 变更] `kind` 枚举补齐**：新增 `display`（产品展示图）、`mockup`（商业样机）、`angle_real`（用户上传的多视角实拍）。
v1 文档漏写这三个，但代码与前端早在使用；`refine` 是前端交付模式名，落库后 `kind` 为对应模板名。

**[v2 新增] 两个 meta 字段**：

- `meta.originalName`：用户上传时的原始文件名（来自 `x-filename` 头）。v1 时期前端一直在发，服务端从没读过，文件名白白丢失。
- `meta.angle`：多视角实拍的角度标识（`front|deg45|side_right|back|detail_macro`）。

**[v2 新增] `deletedAt`**：软删标记。存在即表示已删除，前端应过滤掉。

**平台枚举 `platform`**（出图规格按它定，仓库图标按它显示）：

| id | 名字 | 区域 | 出图尺寸 |
|----|------|------|----------|
| taobao | 淘宝 | 国内 | 800×800 |
| xianyu | 闲鱼 | 国内 | 800×800 |
| jd | 京东 | 国内 | 800×800 |
| amazon | Amazon | 海外 | 2000×2000 |
| ebay | eBay | 海外 | 1600×1600 |
| shopee | Shopee | 海外 | 1242×1660 |
| lazada | Lazada | 海外 | 1000×1000 |
| tiktok | TikTok Shop | 海外 | 1080×1920 |

**文案产物也走 Asset**：`kind: "copy"`，`url` 为 `null`，正文在 `meta` 里
（`title / bullets[] / detail / lang / platform / model`）。前端「仓库 → 文案」直接读它。

### Job（异步任务：出图 / 视频 / 文案 / 分析）

```json
{
  "id": "j_31c9",
  "type": "image | video | copy | clip | visual | analyze | geo | inquiry | detail",
  "productId": "p_8f2a",
  "status": "queued | running | done | failed | canceled",
  "progress": 0,
  "stage": "已完成 2/3 张",
  "result": { },
  "error": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

**[v2 新增] `type=analyze`**：阶段一纯文本商业分析，**不生图、不消耗出图额度**，只走 TEXT 能力。
前端「视觉导演」流程第一步就是它，v1 文档完全没有登记。
result: `{ "analysis": { …8 项… }, "spec": { "version": 1, "lighting": "…", "palette": {…} } }`

**[v2 新增] `stage`**：人读的阶段文案（如 `已完成 2/3 张`）。前端可选展示，不展示也不影响。

**[v2 变更] `progress` 语义**：v1 是先把百分比爬到 cap 再开始干活（用户盯着 90% 干等几十秒）。
v2 改为**真实阶段上报**：出图链路按「已完成 i/n 张」推进，无上报的链路用慢心跳兜底且永不越过 92%，
只有真正完成才是 100。

- `type=image` → result: `{ "assets": ["a_2","a_3"], "errors": [], "usedRefined": true }`
- `type=video` → result: `{ "lang": "en", "videoUrl": null, "srtUrl": "/files/x.srt", "assetId": "a_9", "subtitles": [{ "start": 0.0, "end": 2.4, "text": "…" }], "note": "…" }`
- `type=copy` → result: `{ "title": "…", "bullets": ["…"], "detail": "…", "lang": "en" }`
- `type=clip` → result: `{ "assets": ["a_9"], "clipUrl": "/files/a_9.mp4", "note": "Seedance 出片 5s · 38s 生成" }`（mock 时 `clipUrl: null` + `posterUrl` 首帧）
- `type=geo` → result: `{ "assets": ["a_1","a_2","a_3"], "questions": [{ "cat":"scene","catName":"场景选型","q":"…","who":"…","where":"…" }], "anchors": [{ "before":"高品质","after":"含水率 8–10%…","why":"…" }], "keywords": [{ "layer":"L1","term":"…","where":"…" }], "blocks": { "faq": [], "param": "", "compare": "" } }`（产物存 `kind=faq/anchor/keyword_layer`，正文进 `meta.text`）
- `type=detail` → result: `{ "assets": ["a_1"…"a_6"], "segments": [{ "index":1,"id":"brand","title":"品牌认知","w":1242,"h":1739,"copy":"标题\n· 锚点\n· 卖点" }], "errors": [], "note": "六段出完" }`（产物 `kind=detail`，`meta.segment/segTitle/index/copy`）
- `type=inquiry` → result: `{ "assets": ["a_4","a_5"], "fields": [{ "key":"qty","label":"数量","value":"200" }], "risks": [{ "level":"warn|info","text":"…" }], "tiers": [{ "qty":200,"unit":"US$ 88.0 / pc" }], "reply": { "zh":"…","en":"…","th":"…","vi":"…" } }`（产物存 `kind=inquiry/reply`）
- `type=visual` → result: `{ "assets": ["a_1"…"a_5"], "spec": { "version": 1, "lighting": "…", "palette": {…} }, "analysis": { …8 项… }, "plan": { "generate": ["front","deg45","side_right"], "skip": [] }, "errors": [] }`
- **[v2 新增]** `type=analyze` → result: `{ "analysis": {…}, "spec": {…} }`

### LedgerEntry（账目）

```json
{
  "id": "l_77",
  "productId": "p_8f2a",
  "type": "income | cost | fee | shipping | ads | refund",
  "amount": 128.5,
  "currency": "CNY",
  "note": "首单",
  "occurredAt": "2026-12-05T09:00:00.000Z"
}
```

`currency` 服务端会统一转大写。

## 2. 接口清单（16 个）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查 |
| 2 | POST | `/api/products` | 建商品 |
| 3 | GET | `/api/products` | 商品列表 |
| 4 | GET | `/api/products/:id` | 商品详情（含 assets） |
| 5 | PATCH | `/api/products/:id` | 更新商品字段 |
| 6 | POST | `/api/uploads` | 上传原始图/视频（raw body） |
| 7 | POST | `/api/jobs` | 建异步任务 |
| 8 | GET | `/api/jobs/:id` | 查任务进度/结果 |
| 9 | POST | `/api/ledger` | 记一笔账 |
| 10 | GET | `/api/ledger` | 账目列表 + 汇总 |
| 11 | GET | `/api/meta` | 模型供应商状态、市场列表、用量 |
| 12 | POST | `/api/meta/check` | 单链路自检（body `{cap:"TEXT"}`） |
| 13 | DELETE | `/api/assets/:id` | **[v2 补登记]** 软删资产（仓库多选删除） |
| 14 | POST | `/api/assets/:id/restore` | **[v2 补登记]** 撤销软删 |
| 15 | DELETE | `/api/jobs/:id` | **[v2 补登记]** 取消任务 |
| 16 | GET | `/api/jobs` | **[v2 新增]** 任务列表（按商品/状态过滤） |

> 13–15 在 v1 时期就已实现并被前端调用（仓库删除 + 6 秒撤销条），只是从没写进契约。

### 1) GET /api/health

```json
{ "ok": true, "version": "1.2.0", "aiMode": "mock | live" }
```

### 2) POST /api/products

请求：

```json
{ "title": "手作家具 / 餐桌", "category": "furniture", "platform": "shopee",
  "market": "sg", "targetLangs": ["en"], "sellingPoints": ["实木手工"], "rawText": "…" }
```

必填：`title`。其余可选。返回 201 + Product。
`market` 不传时按 `platform` 取默认值。`id`、`createdAt`、`status` 由服务端生成，请求体里写了也不生效。

### 3) GET /api/products

`?limit=20&cursor=…` → `{ items: Product[], nextCursor }`。`limit` 上限 100。

### 4) GET /api/products/:id

返回 `{ ...Product, assets: Asset[] }`。不存在 → 404 `NOT_FOUND`。

### 5) PATCH /api/products/:id

只允许改：`title / category / platform / market / targetLangs / sellingPoints / rawText / status / brief / visualSpec / analysis / detailOrder`。
（**[v2 对齐]** v1 只列了前 7 个，实际白名单一直是这 12 个。）
返回更新后的 Product，写入 `updatedAt`。其他方法 → 405 `METHOD_NOT_ALLOWED`。

### 6) POST /api/uploads

- Header：`Content-Type: image/jpeg|image/png|image/webp|image/gif`（图片，≤ **15 MB**）或 `video/*`、`audio/*`（≤ **80 MB**）；超出 → 413 `PAYLOAD_TOO_LARGE`
  （**[v2 修正]** 413 的 message 现按实际上限生成，不再一律写 "15MB"）
- Body：文件原始字节
- 可选 Header `x-filename`：URL 编码的原始文件名，**[v2 新增]** 会存进 `meta.originalName`
- 可选 Query：
  - `?productId=p_8f2a` 自动挂到商品 assets
  - **[v2 补登记]** `?kind=upload|angle_real`（也可用 `x-asset-kind` 头），其它值一律按 `upload` 处理
  - **[v2 补登记]** `?angle=front|deg45|side_right|back|detail_macro`，存进 `meta.angle`

返回 201：

```json
{ "assetId": "a_1", "url": "/files/9f2c.jpg", "kind": "upload", "width": 1242, "height": 1660 }
```

> **[v2 变更] 内容校验**：服务端改为流式接收到临时文件，按**真实字节魔数**判定类型，
> 通过后才入库。声明 `image/png` 但内容不是图片的请求将被 400 拒绝，不再落盘。
> WebP 现在能解析出真实宽高（v1 一律返回 0×0）。视频/音频做容器级粗校验（mp4/webm/mp3/wav）。

> 视频/音频上传时 `width`/`height` 返回 0，`url` 供后续 `params.fileUrl` 使用。

> 前端约定：**直传 raw body，不要 multipart**，实现简单且不会踩边界问题。

### 7) POST /api/jobs

请求：

```json
{ "type": "image", "productId": "p_8f2a",
  "params": { "assetId": "a_1", "platform": "shopee", "template": "main", "lang": "en",
              "count": 2, "width": null, "height": null, "quality": "1k" } }
```

- `type=analyze`：**[v2 新增登记]** `params.platform`、`params.lang`、可选 `params.brief`。纯文本，不生图。
- `type=image`：`params.template ∈ refine|display|main|marketing|mockup|detail|sub`（**[v2 对齐]**，v1 只写了 4 个），`params.lang`
  - `params.count` 1–6，默认 main/marketing 2 张、detail 6 张
  - `params.width` / `params.height` 基准像素，`null` 表示跟平台规格走（200–4000）
  - `params.quality ∈ 1k|2k|4k`，输出尺寸 = 基准 × (1 / 1.5 / 2)
  - `params.needModel`：是否需要模特出镜
- `type=video`：`params.fileUrl`（先 `/api/uploads` 传上来的 `/files/x.mp4`）、`params.targetLang`、可选 `params.duration`、`params.filename`
- `type=copy`：`params.lang`，可选 `params.style`、`params.platform`
- `type=clip`：`params.prompt`、`params.duration ∈ 5|10`、`params.resolution ∈ 480p|720p|1080p`、可选 `params.imageUrl`、`params.cameraFixed`
- `type=geo`：`params.platform`、`params.lang`、可选 `params.brief`
- `type=detail`：`params.platform`、`params.lang`。一次出六段，尺寸按平台宽度 ×1.4
- `type=inquiry`：`params.text`（必填）、`params.langs`、可选 `params.productHint`
- `type=visual`：`params.platform`、`params.brief`、`params.realAngles`、可选 `params.specOnly`

返回 202：

```json
{ "jobId": "j_31c9", "status": "queued" }
```

**[v2 新增] 失败路径**：
- `type` 不在白名单、`productId` 缺失或不存在 → 400 `BAD_REQUEST`
- 触发 IP 限流或真实模式额度护栏 → **429 `RATE_LIMITED`**（带 `Retry-After`）

**[v2 变更] 执行模型**：任务进并发池（默认 3，`JOB_CONCURRENCY` 可调），**长任务不再阻塞其他任务的进度推进**。
服务重启后，上次残留的 `queued`/`running` 任务会被统一标记为 `failed`（message 含「服务已重启」），
前端轮询可立即收口，不会再对着一个永不完成的任务无限轮询。

### 8) GET /api/jobs/:id

返回 Job（不含 `params`）。前端每 **1000ms** 轮询一次，`status` 为 `done/failed/canceled` 时停止。

### 8b) GET /api/jobs　**[v2 新增]**

`?productId=p_8f2a&status=done&limit=50` → `{ "items": Job[] }`（按创建时间倒序，不含 `params`）。

### 8c) DELETE /api/jobs/:id　**[v2 补登记]**

取消 `queued`/`running` 的任务，返回更新后的 Job。已完成的任务不受影响。

### 9) POST /api/ledger

```json
{ "productId": "p_8f2a", "type": "income", "amount": 128.5, "currency": "CNY", "note": "首单" }
```

返回 201 + LedgerEntry（服务端补 `id` / `occurredAt`）。`amount` 必须为正数，`type` 必须在枚举内，否则 400。

### 10) GET /api/ledger

`?productId=p_8f2a&limit=50` →

```json
{
  "items": [LedgerEntry],
  "summary": {
    "income": 128.5, "cost": 40, "profit": 88.5, "currency": "CNY",
    "byCurrency": [
      { "currency": "CNY", "count": 3, "income": 128.5, "cost": 40, "profit": 88.5 },
      { "currency": "USD", "count": 1, "income": 50, "cost": 0, "profit": 50 }
    ],
    "mixed": true
  }
}
```

**[v2 修正] 混币不再混算**。v1 把不同币种的 `amount` 直接相加、`currency` 取第一条记录 —— 跨境项目记一笔 USD 一笔 CNY，利润就是错的。

- `byCurrency`：按币种分组，条目多的排前面。**新前端应读这个。**
- 顶层 `income/cost/profit/currency`：**保留不变**，取 `byCurrency[0]`（条目最多的币种）。**现有前端三张卡无需任何修改。**
- `mixed`：存在多币种时为 `true`，前端可据此提示用户，不用也无妨。

### 11) GET /api/meta

```json
{
  "version": "1.2.0",
  "counts": { "products": 1, "assets": 9, "jobs": 4 },
  "providers": { "mock": true, "mode": "mock", "caps": [ { "name": "text", "configured": false, "model": null, "missing": ["TEXT_API_KEY"], "active": false } ] },
  "mockCaps": [],
  "markets": [{ "id": "sg", "label": "新加坡", "lang": "en" }],
  "usage": {
    "day": "2026-11-28", "images": 0, "clips": 0, "texts": 0, "estimatedSpendCNY": 0,
    "limits": { "imagesPerJob": 6, "imagesPerDay": 120, "spendPerDayCNY": 80, "jobsPerMin": 20, "uploadsPerMin": 30 }
  },
  "inFlight": 0
}
```

**[v2 新增]** `usage`（当日用量与护栏阈值，真实模式下才累加）与 `inFlight`（当前并发执行中的任务数）。

### 12) POST /api/meta/check

body `{ "cap": "TEXT" | "IMAGE" | "ASR" | "VIDEO" }` → `{ ok, cap, ms, model, error? }`。永远返回 200，用 `ok` 区分通断。

## 3. 静态资源

- `GET /files/*` → `data/uploads/` 下的文件
- `GET /` → `web/index.html`（同目录静态文件全部可访问）

**[v2 新增] 缓存与范围请求**：

- 两类资源都返回 `ETag` / `Last-Modified` / `Accept-Ranges: bytes`
- 带 `If-None-Match` 且未变 → **304**，不重传正文
- 带 `Range: bytes=start-end` → **206** + `Content-Range`；非法范围 → **416**（视频能拖进度条的前提）
- `/files/*` 文件名自带 assetId、内容不可变 → `Cache-Control: public, max-age=31536000, immutable`
- `web/` 下的前端源码会改 → `Cache-Control: no-cache`（走协商缓存，改了立刻生效）

## 4. 前端不得依赖的东西

- 不得直接调用任何模型 API（key 不进前端）
- 不得假设接口支持 WebSocket（v2 仍只有轮询）
- 不得在 URL 里传 token
- **[v2 新增]** 不得假设 `GET /api/jobs/:id` 会返回 `params`（服务端已剔除，可能含用户询盘原文）

## 5. 运行与环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | 8790 | 服务端口 |
| `AI_MOCK` | 1 | 1=全链路假数据；0=走真模型 |
| `JOB_CONCURRENCY` | 3 | 任务并发池大小 |
| `DUKOU_DATA_DIR` | `./data` | 数据目录（自测用临时目录隔离） |
| `TRUST_PROXY` | 0 | 1=信任 `X-Forwarded-For`（**仅在可信反代之后开启**） |
| `RL_LOCALHOST` | — | `strict`=本机也走限流（默认豁免回环地址） |
| `RL_JOBS_PER_MIN` / `RL_UPLOADS_PER_MIN` / `RL_WRITES_PER_MIN` | 20 / 30 / 120 | 限流阈值 |
| `QUOTA_IMAGES_PER_JOB` / `QUOTA_IMAGES_PER_DAY` / `QUOTA_SPEND_PER_DAY_CNY` | 6 / 120 / 80 | 真实模式额度护栏 |

存储保证（v2）：`data/db.json` 走 **tmp → fsync → rename** 原子替换，写入串行化；
解析失败时转存为 `db.corrupt-<时间戳>.json` 而非静默清空；进程退出（SIGINT/SIGTERM）前同步刷盘。

自测：`node --test test/`（28 条用例，全部在 `AI_MOCK=1` 下跑，不消耗真实额度）。

## 6. 变更记录

| 日期 | 版本 | 变更 | 提出人 |
|------|------|------|--------|
| 2026-11-28 | **v2** | **契约与实现对齐**：补登记 `DELETE /api/assets/:id`、`POST /api/assets/:id/restore`、`DELETE /api/jobs/:id`；新增 `GET /api/jobs`；补登记 `type=analyze`；Product 补 `market/brief/visualSpec/analysis`；Asset `kind` 补 `display/mockup/angle_real`，meta 补 `originalName/angle`，补 `deletedAt`；PATCH 白名单补全；uploads 补 `kind/angle/x-filename` 与魔数校验；端口统一 8790；轮询统一 1000ms；错误码补 `METHOD_NOT_ALLOWED`；新增限流与额度护栏（`RATE_LIMITED` 落地）；ledger 新增 `byCurrency`（顶层字段保持兼容）；静态资源支持 ETag/304/Range；Job 新增 `stage` 且 `progress` 改为真实上报 | 后端 |
| 2026-11-24 | v1.5 | 新增 `DELETE /api/assets/:id` 与 `PATCH` 的 `detailOrder` | 主人 |
| 2026-11-24 | v1.4 | 新增 type=detail：一次出六段详情页图 + 每段文案 | 主人 |
| 2026-11-24 | v1.3 | 新增 type=geo 与 type=inquiry，新增 5 个 Asset kind | 主人 |
| 2026-11-22 | v1.2 | 新增 type=clip（Seedance 商品短视频）与 kind=clip 资产 | 主人 |
| 2026-11-21 | v1.1 | `platform` 扩到 8 个平台并决定出图尺寸；文案产物存成 `kind=copy` 的 Asset | 主人 |
| 2026-11-21 | v1 | 首版冻结 | 主人 |
