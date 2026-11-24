# 渡口 · 出海工作台（黑客松 S3 参赛作品）

一个人做跨境电商的辅助工作台：**拍一张图 → 出套图 → 出文案 → 上架 → 记账**。

三人队，48 小时，零依赖，克隆下来就能跑。

## 界面长什么样

没有侧栏，四个 tab 一条顶栏走完：

| tab | 谁负责 | 形态 |
|-----|--------|------|
| 生图 | 主人 | **对话框**：选平台 → 发图 + 说要求 → 出来就是套图，可以连续追问。**没有新建表单**：直接说话或发图就自动开商品，想换就说「新建商品：名字」 |
| 视频翻译 | 马 | 上传视频 → 选语言 → 出字幕表（不做 lip sync） |
| 记账 | 主人 | 记一笔 + 收入/成本/利润三张卡 |
| 接口 | 卓 | 10 个端点的作业清单，带一键自测 |
| 仓库 | 主人 | 右上角抽屉：生成过的**图片 + 文案**都在这儿，点图放大、文案一键复制 |

**平台**在输入框左边选，分两组：国内 淘宝 / 闲鱼 / 京东，海外 Amazon / eBay / Shopee / Lazada / TikTok Shop。
选中哪个，出图尺寸就按那个平台来（淘宝 800×800、Shopee 1242×1660、TikTok 1080×1920…）。

商品靠顶栏的小下拉切换；不用点按钮新建，说话就建。

## 30 秒跑起来

```bash
node --version     # 需要 ≥ 18
node server.mjs
# 打开 http://localhost:8787

# 想先看看有数据的样子（另开一个终端）：
node scripts/seed-demo.mjs
```

不需要 `npm install`，不需要构建。

## 目录

```
server.mjs        集成层：路由 / 存储 / 静态服务 / 上传      （主人）
lib/ai.mjs        AI 链路：出图 / 文案 / 视频字幕            （马）
lib/jobs.mjs      任务队列：建任务 / 推进度 / 落结果          （卓）
lib/ledger.mjs    记账：加减法 + 汇总                        （卓）
web/              前端：原生 HTML/CSS/JS，无构建
CONTRACT.md       接口契约（唯一事实来源）
AGENTS.md         给三个 AI 的协作规则
data/             运行时数据（db.json + uploads/），不进 git
```

## 三个 AI 怎么配合

1. 每次开工，先让 AI 读 `AGENTS.md` + 把 `CONTRACT.md` **全文贴给它**。
2. 一个 AI 只负责一个目录，输出完整文件，不要片段。
3. 契约要改：先改 `CONTRACT.md` 并在变更记录里写一行，再改代码。

## 模式

- 默认 `AI_MOCK=1`：全部走假数据，链路能跑通（出的是占位图，文案是模板，短视频只出首帧）。
- 接真模型：复制 `.env.example` 成 `.env`，把 `AI_MOCK` 改成 `0`，四条链路各自填 key：

  ```ini
  TEXT_BASE_URL / TEXT_API_KEY / TEXT_MODEL      # 文案，默认 DeepSeek
  IMAGE_BASE_URL / IMAGE_API_KEY / IMAGE_MODEL   # 出图，默认硅基流动 Kolors
  ASR_BASE_URL / ASR_API_KEY / ASR_MODEL         # 语音识别，默认 SenseVoiceSmall
  VIDEO_BASE_URL / VIDEO_API_KEY / VIDEO_MODEL   # 商品短视频，默认火山方舟 Seedance
  ```

  重启后打开「接口」页，顶部会显示每条链路「已接 / 未配置」，点「自检」当场测通断。
  命令行版：`node scripts/aitest.mjs`（另有 `node scripts/clipcheck.mjs` 测短视频、`node scripts/contentcheck.mjs` 测内容资产与询盘、`node scripts/detailcheck.mjs` 测详情页六段）。逐步说明见 [`docs/接入AI.md`](docs/接入AI.md)。

  key 只在本机 `.env`，**永不入库、永不进前端、永不贴群**。

## 接口速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/products` | 建商品 |
| GET | `/api/products` | 商品列表 |
| GET | `/api/products/:id` | 商品详情 |
| PATCH | `/api/products/:id` | 更新商品 |
| POST | `/api/uploads` | 上传图片（raw body） |
| POST | `/api/jobs` | 建任务 image/copy/video/clip/visual/geo/inquiry/detail |
| GET | `/api/jobs/:id` | 查进度（前端 1.2s 轮询） |
| POST | `/api/ledger` | 记一笔 |
| GET | `/api/ledger` | 账目 + 汇总 |
| GET | `/api/meta` | 三条链路配没配好、用的哪个模型 |
| POST | `/api/meta/check` | 单链路自检（`{cap:"TEXT"}`） |

细节字段见 [`CONTRACT.md`](CONTRACT.md)。

## 已知限制（demo 阶段）

- 视频翻译只返回字幕样例，不出成片（48h 内不做 lip sync）
- 存储是单文件 JSON，不支持并发写多人（比赛够用）
- 没有登录体系，作品集展示不做多租户

## 动效清单（都在真实交互上，不做装饰）

| 位置 | 动效 | 说明 |
|------|------|------|
| 新到的 AI 消息 | 文字揭示 | 段落按 55ms 递进擦出，回放历史不重播 |
| 顶栏商品按钮 → 抽屉 | 径向展开 | `clip-path: circle()` 以按钮圆心为原点 |
| 仓库成品图（详情段） | 拖拽排序 | 拖动改顺序，存 `product.detailOrder` |
| 仓库「选择」模式 | 错峰多选 | 卡片入场 26ms 递进 + 勾选 tick |
| 参数卡「要几张」 | 速度吸附滑块 | 松手按拖动速度多走一格再吸附整数 |
| 任务进度条 | 弹簧步进 | rAF 弹簧追目标值，不再一格一格跳 |
| tab / chip / 平台项 / 按钮 | 波纹 | 点击处涟漪，只给开关类控件 |
| 仓库删图 | 弧形折叠 | `clip-path + rotate` 收走后再删 |

规则：所有动效在 `prefers-reduced-motion: reduce` 下关闭；不引入渐变与光晕，uiverse 上只借手法不贴颜色。
