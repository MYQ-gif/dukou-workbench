# CONTRACT · 渡口 (Dukou) API 契约 v1

> 冻结时间：2026-11-21。**任何人要改这份文件，必须先开 PR 说明原因，三人同意后才能改。**
> 前端、后端、AI 链路都以本文件为唯一事实来源。

## 0. 通用约定

- Base URL 本地：`http://localhost:8787`；线上：待定（部署后写进这里）
- 所有请求/响应 `Content-Type: application/json`，上传接口除外
- 时间一律 ISO 8601 字符串（`2026-12-05T10:00:00.000Z`）
- id 一律字符串（服务端生成，前端不要自己造）
- 错误统一返回：

```json
{ "error": { "code": "NOT_FOUND", "message": "product not found" } }
```

错误码：`BAD_REQUEST` `NOT_FOUND` `PAYLOAD_TOO_LARGE` `RATE_LIMITED` `INTERNAL`

- 分页参数：`?limit=20&cursor=<id>`，返回 `{ "items": [...], "nextCursor": "…" | null }`

## 1. 数据模型

### Product（商品，全站主键）

```json
{
  "id": "p_8f2a",
  "title": "手作家具 / 餐桌",
  "category": "furniture",
  "platform": "shopee",
  "targetLangs": ["en", "th"],
  "sellingPoints": ["实木手工", "老料新做"],
  "rawText": "老爸给奶奶手做的桌子…",
  "status": "draft | ready | listed",
  "assets": ["a_1", "a_2"],
  "createdAt": "…",
  "updatedAt": "…"
}
```

> 注意：`GET /api/products/:id` 返回的 `assets` 是**完整 Asset 对象数组**（服务端已展开），
> 而列表接口 `GET /api/products` 里的 `assets` 仍是 id 数组。前端按详情接口渲染即可。

### Asset（素材/产物）

```json
{
  "id": "a_1",
  "productId": "p_8f2a",
  "kind": "upload | refined | angle | angle_real | main | marketing | detail | copy | video | subtitle | clip | faq | anchor | keyword_layer | inquiry | reply",
  "url": "/files/abc.jpg",
  "width": 1242,
  "height": 1660,
  "meta": { "model": "mock-image-v1", "lang": "en", "platform": "shopee" },
  "createdAt": "…"
}
```

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

### Job（异步任务：出图 / 视频 / 文案）

```json
{
  "id": "j_31c9",
  "type": "image | video | copy | clip | visual | geo | inquiry",
  "productId": "p_8f2a",
  "status": "queued | running | done | failed | canceled",
  "progress": 0,
  "result": { },
  "error": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

- `type=image` → result: `{ "assets": ["a_2","a_3"] }`
- `type=video` → result: `{ "videoUrl": "/files/x.mp4", "subtitles": [{ "start": 0.0, "end": 2.4, "text": "…" }], "lang": "en" }`
- `type=copy` → result: `{ "title": "…", "bullets": ["…"], "detail": "…", "lang": "en" }`
- `type=clip` → result: `{ "assets": ["a_9"], "clipUrl": "/files/a_9.mp4", "note": "Seedance 出片 5s · 38s 生成" }`（mock 时 `clipUrl: null` + `posterUrl` 首帧）
- `type=geo` → result: `{ "assets": ["a_1","a_2","a_3"], "questions": [{ "cat":"scene","catName":"场景选型","q":"…","who":"…","where":"…" }], "anchors": [{ "before":"高品质","after":"含水率 8–10%…","why":"…" }], "keywords": [{ "layer":"L1","term":"…","where":"…" }], "blocks": { "faq": [], "param": "", "compare": "" } }`（产物存 `kind=faq/anchor/keyword_layer`，正文进 `meta.text`）
- `type=inquiry` → result: `{ "assets": ["a_4","a_5"], "fields": [{ "key":"qty","label":"数量","value":"200" }], "risks": [{ "level":"warn|info","text":"…" }], "tiers": [{ "qty":200,"unit":"US$ 88.0 / pc" }], "reply": { "zh":"…","en":"…","th":"…","vi":"…" } }`（产物存 `kind=inquiry/reply`）
- `type=visual` → result: `{ "assets": ["a_1","a_2","a_3","a_4","a_5"], "spec": { "version": 1, "lighting": "…", "palette": {…} }, "analysis": { …8 项… }, "plan": { "generate": ["front","deg45","side_right"], "skip": [] } }`

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

## 2. 接口清单（10 个）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/api/health` | 健康检查 |
| 2 | POST | `/api/products` | 建商品 |
| 3 | GET | `/api/products` | 商品列表 |
| 4 | GET | `/api/products/:id` | 商品详情（含 assets） |
| 5 | PATCH | `/api/products/:id` | 更新商品字段 |
| 6 | POST | `/api/uploads` | 上传原始图（raw body） |
| 7 | POST | `/api/jobs` | 建异步任务 |
| 8 | GET | `/api/jobs/:id` | 查任务进度/结果 |
| 9 | POST | `/api/ledger` | 记一笔账 |
| 10 | GET | `/api/ledger` | 账目列表 + 汇总 |
| 11 | GET | `/api/meta` | 模型供应商状态（三链路是否配好、模型名） |
| 12 | POST | `/api/meta/check` | 单链路自检（body `{cap:"TEXT"}`），返回 ok/ms/error |

### 1) GET /api/health

```json
{ "ok": true, "version": "1.0.0", "aiMode": "mock | live" }
```

### 2) POST /api/products

请求：

```json
{ "title": "手作家具 / 餐桌", "category": "furniture", "platform": "shopee",
  "targetLangs": ["en"], "sellingPoints": ["实木手工"], "rawText": "…" }
```

必填：`title`。其余可选。返回 201 + Product。

### 3) GET /api/products

`?limit=20&cursor=…` → `{ items: Product[], nextCursor }`

### 4) GET /api/products/:id

返回 `{ ...Product, assets: Asset[] }`。不存在 → 404 `NOT_FOUND`。

### 5) PATCH /api/products/:id

只允许改 `title / category / platform / targetLangs / sellingPoints / rawText / status`。
返回更新后的 Product。写入 `updatedAt`。

### 6) POST /api/uploads

- Header：`Content-Type: image/jpeg|image/png|image/webp`（图片，≤ 15 MB）或 `video/*`、`audio/*`（视频/音频，≤ 80 MB）；超出 → 413 `PAYLOAD_TOO_LARGE`
- Body：文件原始字节（≤ 80 MB）
- 可选 `?productId=p_8f2a` 自动挂到商品 assets

返回 201：

```json
{ "assetId": "a_1", "url": "/files/9f2c.jpg", "width": 1242, "height": 1660 }
```

> 视频/音频上传时 `width`/`height` 返回 0，`url` 供后续 `params.fileUrl` 使用。

> 前端约定：**直传 raw body，不要 multipart**，实现简单且不会踩边界问题。

### 7) POST /api/jobs

请求：

```json
{ "type": "image", "productId": "p_8f2a",
  "params": { "assetId": "a_1", "platform": "shopee", "template": "main", "lang": "en",
              "count": 2, "width": null, "height": null, "quality": "1k" } }
```

- `type=image`：`params.template ∈ main|marketing|detail|sub`，`params.lang`
  - `params.count` 1–6，默认 main/marketing 2 张、detail 3 张
  - `params.width` / `params.height` 基准像素，`null` 表示跟平台规格走（200–4000）
  - `params.quality ∈ 1k|2k|4k`，输出尺寸 = 基准 × (1 / 1.5 / 2)
- `type=video`：`params.fileUrl`（先 `/api/uploads` 传上来的 `/files/x.mp4`）、`params.targetLang`、可选 `params.duration`（秒，ASR 不给时间戳时兜底）
- `type=copy`：`params.lang`，可选 `params.style`
- `type=clip`：`params.prompt`（画面描述，可不传）、`params.duration ∈ 5|10`、`params.resolution ∈ 480p|720p|1080p`、可选 `params.imageUrl`（首帧，不传就用该商品最后一张上传图）、可选 `params.cameraFixed`
- `type=geo`：`params.platform`、`params.lang`、可选 `params.brief`。产出买家问题库、事实锚点、六层关键词与三类内容块（FAQ/参数表/对比）。
- `type=inquiry`：`params.text`（询盘原文，必填）、`params.langs`（回信语种数组，如 `["en","zh","th","vi"]`）、可选 `params.productHint`。产出五要素、风险条目、阶梯价骨架、多语回信。
- `type=visual`：备料任务。`params.platform`、`params.brief`（`{usage, market, selling}`，全部可空）、`params.realAngles`（用户已上传的实拍角度数组，可空）。产物：`kind=refined`（`meta.crop ∈ 1:1|3:4`）+ `kind=angle`（`meta.angle`）+ `product.visualSpec`；result 为 `{ assets, spec, analysis, plan:{generate,skip}, errors }`

> `video` 结果：`{ lang, videoUrl: null, srtUrl, assetId, subtitles: [{start,end,text}], note }`。只出字幕轨，不做口型同步。

> 这三个参数由前端「出图参数询问框」给出，默认值按模板与平台预选，用户可改。

返回 202：

```json
{ "jobId": "j_31c9", "status": "queued" }
```

### 8) GET /api/jobs/:id

返回 Job。前端每 1.5 s 轮询一次，`status` 为 `done/failed/canceled` 时停止。

### 9) POST /api/ledger

```json
{ "productId": "p_8f2a", "type": "income", "amount": 128.5, "currency": "CNY", "note": "首单" }
```

返回 201 + LedgerEntry（服务端补 `id` / `occurredAt`）。

### 10) GET /api/ledger

`?productId=p_8f2a&limit=50` →

```json
{ "items": [LedgerEntry], "summary": { "income": 128.5, "cost": 40, "profit": 88.5, "currency": "CNY" } }
```

## 3. 静态资源

- `GET /files/*` → `data/uploads/` 下的文件
- `GET /` → `web/index.html`（同目录静态文件全部可访问）

## 4. 前端不得依赖的东西

- 不得直接调用任何模型 API（key 不进前端）
- 不得假设接口支持 WebSocket（v1 只有轮询）
- 不得在 URL 里传 token

## 5. 变更记录

| 日期 | 版本 | 变更 | 提出人 |
|------|------|------|--------|
| 2026-11-21 | v1.1 | `platform` 扩到 8 个平台并决定出图尺寸；文案产物存成 `kind=copy` 的 Asset 进仓库 | 主人 |
| 2026-11-21 | v1 | 首版冻结 | 主人 |
| 2026-11-24 | v1.3 | 新增 type=geo（买家问题库/事实锚点/六层关键词）与 type=inquiry（询盘解析+风险+多语回信），新增 5 个 Asset kind | 主人 |
| 2026-11-22 | v1.2 | 新增 type=clip（Seedance 商品短视频，异步 1–3 分钟）与 kind=clip 资产；/api/jobs 白名单同步 | 主人 |
