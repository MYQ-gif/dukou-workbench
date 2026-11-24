# 接入真模型（30 分钟版）

目标：把 `AI_MOCK=1` 换成 `AI_MOCK=0`，三条链路各自接上真模型，且 key 只留在本机。

## 0. 三件事各用什么

| 链路 | 干什么 | 默认供应商 | 默认模型 | 单次成本（估） |
| --- | --- | --- | --- | --- |
| 文案 `TEXT` | 标题 / 三条卖点 / 一段 listing | DeepSeek | `deepseek-chat` | 一次约 0.001–0.01 元 |
| 出图 `IMAGE` | 主图 / 详情图，按平台尺寸 | 硅基流动 | `Kwai-Kolors/Kolors` | 一张 0.1–0.3 元 |
| 语音 `ASR` | 视频先转文字，再翻译成字幕 | 硅基流动 | `FunAudioLLM/SenseVoiceSmall` | 每分钟约 0.01–0.05 元 |

三者都是 OpenAI 兼容接口，所以换供应商只改 `.env` 里的 `*_BASE_URL`，代码不用动。

## 1. 填 .env（只在本机）

```bash
cp .env.example .env
```

然后编辑 `.env`：

```ini
AI_MOCK=0
TEXT_BASE_URL=https://api.deepseek.com/v1
TEXT_API_KEY=sk-xxxx
TEXT_MODEL=deepseek-chat

IMAGE_BASE_URL=https://api.siliconflow.cn/v1
IMAGE_API_KEY=sk-xxxx
IMAGE_MODEL=Kwai-Kolors/Kolors

ASR_BASE_URL=https://api.siliconflow.cn/v1
ASR_API_KEY=sk-xxxx
ASR_MODEL=FunAudioLLM/SenseVoiceSmall
```

规矩（很重要）：

- key 只写 `.env`，`.gitignore` 已经挡住它，**不要**贴到群里、不要写进任何 `.md`、不要截图时露出来。
- 只配一条链路也行：另一条没配就继续用它自己的 mock，状态页会写「未配置」。

## 2. 重启并自检

```bash
# Windows：双击 start.cmd，或
node server.mjs
```

浏览器打开 <http://localhost:8787> → 「接口」页 → 上面有「模型接入」三行：

- 绿色「已接」= 配好了，右边显示模型名和 base URL
- 灰色「未配置」= 缺哪个变量直接写出来（照着补）
- 点「自检」：文案会真发一次 ping，出图/语音会探一次 `/models` 并核对模型名是否存在

命令行等价物：

```bash
node scripts/aitest.mjs
```

输出每条链路的耗时与失败原因；`AI_MOCK` 还是 1 时它会直接告诉你先改 `.env`。

## 3. 三条链路在代码里落在哪

| 文件 | 职责 |
| --- | --- |
| `lib/providers.mjs` | 读 `.env`、按能力拆配置、统一超时/错误、`/models` 探活 |
| `lib/ai.mjs` → `run()` | 按 `job.type` 选能力；mock 还是 live 在这里分叉 |
| `lib/ai.mjs` → `liveCopy` | 调 `TEXT` `/chat/completions`，强制 JSON 输出，落成 `kind:'copy'` 资产 |
| `lib/ai.mjs` → `liveImage` | 调 `IMAGE` `/images/generations`，同时兼容 `b64_json`（OpenAI）和 `images[].url`（硅基流动） |
| `lib/ai.mjs` → `liveVideo` | 视频先传到 `/api/uploads`，再走 `ASR` `/audio/transcriptions`，翻译后写 `.srt` |
| `server.mjs` | `GET /api/meta` 给前端看状态；`POST /api/meta/check` 做自检 |

## 4. 视频链路的真实边界

- 做：语音识别 → 逐句翻译 → 生成 `.srt` 字幕文件（存进仓库）
- 不做：口型同步（lip sync）、原声音色克隆
- 上限：单文件 80MB；1 分钟视频约 40–90 秒出结果
- 如果 ASR 不返回时间戳（`segments` 为空），字幕会退回整段一条，并在结果里注明

## 5. 常见错误与处理

| 看到 | 原因 | 处理 |
| --- | --- | --- |
| `没配 TEXT_API_KEY` | `.env` 没填或没重启 | 填上，重启 `node server.mjs` |
| `upstream 401` | key 错或过期 | 重新生成 key |
| `upstream 403` / `model not found` | 模型名或权限不对 | 自检里会提示候选模型名 |
| `upstream timeout after 180s` | 出图排队 | 换更快的模型（Flux schnell）或把张数降到 1 |
| `出图接口没有返回图片` | 供应商字段变了 | 看 `lib/ai.mjs` 里 `first` 的兼容分支，补一种字段 |
| 视频一直转圈 | 文件太大或没人声 | 裁到 60 秒内再试 |

## 6. 答辩口径

- 模型是调用第三方 API，不是我们训练的——规则允许，但必须如实说。
- 我们的工程价值在：平台规格库（8 个平台的尺寸/比例）、中文原图 → 外文 listing + 套图的稳定链路、以及三个环节塞进一个对话里。
- 有评测集：拿 30 条真实商品，人工判「标题可用 / 卖点不编造 / 图能上架」，通过率写在 README。
## 商品短视频（Seedance）

出图用 `IMAGE_*`，**出视频用 `VIDEO_*`**：Seedance 是视频生成模型（火山方舟 Ark），不是出图模型。别拿它顶替主图。

| 项 | 值 |
| --- | --- |
| 端点 | `POST {VIDEO_BASE_URL}/contents/generations/tasks` 建任务，`GET …/tasks/{id}` 查状态 |
| 默认模型 | `doubao-seedance-1-0-lite-i2v-250428`（图生视频；纯文字的话用 `…-t2v-…`） |
| 首帧 | 商品最后一张上传图，服务端读成 `data:image/…;base64,…` 塞进 `image_url`；也可传 `params.imageUrl` |
| 参数 | 分辨率/时长/机位写在 text 尾巴：`--resolution 720p --duration 5 --camerafixed false` |
| 耗时 | 5 秒片约 40–150 秒（异步轮询，每 5 秒查一次，最多等 4 分钟） |
| 成本 | 720p / 5s 一条大约 1–3 元，按生成时长计费；演示 5–10 条够用 |

在界面里怎么触发：对话框直接说「出一段 5 秒短视频」「用这张图做个运镜短片」，或点空状态里的「出商品短视频」卡片。

没配 key 时：`AI_MOCK=1` 会出一张 720×1280 的首帧占位图并注明「mock 不出视频」，流程能走通，评委看得出这是占位。

常见错误：

| 现象 | 原因 |
| --- | --- |
| `没配 VIDEO_API_KEY` | `.env` 里少了 VIDEO 三项，或没重启服务 |
| `Seedance 失败：…` | 首帧图太大/格式不支持，或模型 ID 写错 |
| `Seedance 超时（等了 240s…）` | 队列拥挤，换 lite 模型或缩短时长重试 |

## 出图提示词是怎么拼的（画质相关）

`lib/ai.mjs` 的 `imagePrompt()` 现在按这个顺序拼，最后交给供应商：

1. **主体与占比**：`Professional e-commerce <kind> of "<标题>"`，产品占画面 70%，真实比例
2. **类目方向**（`lib/visual.mjs` 的 12 类目）：场景 / 光位 / 关键词 / 三色调色板
3. **视觉规范 spec**：lighting、composition、mood（同一商品所有物料共用，保证成套一致）
4. **卖点**：3 条以内，要求「能被看见」而不是念一遍
5. **卖家原话**（`product.brief.selling`）与商品描述
6. **用户这一句要求**
7. **镜头与画质约束**：full-frame / 50mm / soft key + rim light / true-to-life colour / 自然材质 / 无塑料反光 / 无过饱和 / 无 HDR 辉光
8. **负向**：`Avoid: warped geometry, extra parts, floating objects, fake bokeh, text, watermark, logo, extra props`
9. **尺寸与安全区**：目标宽高 + 平台名 + 标题留白

硅基流动（`/siliconflow/`）另外带 `negative_prompt`、`num_inference_steps: 28`、`guidance_scale: 7`；如果有 `refined` 资产，会作为图生图参考（`image: dataUri`）一起发过去。

一条实例（家居 / Shopee 1242×1660）见 `node scripts/promptcheck.mjs` 的输出。

注：spec 里的类目与光位是中文，Kolors / 通义系能读；换纯英文模型（Flux、SDXL）时会自动切英文。

## 中英文提示词怎么切

`lib/ai.mjs` 的 `imagePromptLang()` 决定用哪套词：

1. `IMAGE_PROMPT_LANG=en` / `zh` 显式指定（最高优先级）
2. 否则看 `IMAGE_BASE_URL`：命中 `siliconflow|flux|stability|replicate|fal|openai|together|deepinfra|novita|bfl` → 英文
3. 没配（mock）或别家 → 中文

英文路径用 `lib/visual.mjs` 的两张表：

- `CATEGORY_EN`：12 个类目的英文打法（`scene` / `light` / `words[3]`），替代中文 `CATEGORIES` 那一行
- `SPEC_GLOSSARY` + `specEn(spec)`：把视觉规范里的中文词（窗光、柔光、浅景深、留白、俯拍…）换成英文短语，最多取 5 条拼成一行 `Look: …`；没命中的直接丢，不硬翻
- `promptFor(step, {lang:'en'})`：精修 / 视角 / 主图 / 海报 / 详情段 / 模特这六步模板也有英文版，避免 Flux 收到中文指令

想看两版差异：`node scripts/promptcheck.mjs`（会打印中文版、英文版、四个分步模板的英文版，以及英文版里还剩几个中文字符——只剩商品标题这类必须保留的）。

