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
