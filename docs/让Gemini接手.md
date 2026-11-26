# 让 Gemini 接手改「渡口」

> 项目根目录已经有 `GEMINI.md`（Gemini CLI 会自动读）。这份文档是给人看的操作说明 + 可直接复制的提示词。
> 适用：Gemini CLI / Antigravity / VS Code Gemini 插件 / 网页 Gemini，四种都能接，区别只在「Gemini 能不能直接动文件」。

## 0. 先分清两条路

| 方式 | Gemini 能干什么 | 你还要干什么 |
|------|----------------|-------------|
| **有文件权限**（Gemini CLI、Antigravity、IDE 插件打开这个文件夹） | 直接读代码、改文件、跑 `node` 命令 | 只需要说要改什么 |
| **没有文件权限**（网页 gemini.google.com / AI Studio） | 只能读你贴的内容、输出代码文本 | 你负责把输出粘回文件、跑命令验证 |

**推荐第一条**。网页版适合「讨论 + 出方案」，落地改代码还是让 CLI 来。

## 1. 最快路径：Gemini CLI（能直接改）

```powershell
cd C:\Users\20708\Documents\deepseek-harness\default-workspace\dukou-workbench
gemini
```

进去后第一条消息就发这个（复制即用）：

```
你在做「渡口」黑客松项目，接手主人这台机器上的开发。
开工前先完整读三份文件：GEMINI.md、AGENTS.md、CONTRACT.md。
读完先复述三件事：项目干什么、技术栈三条铁律、当前还差什么。复述完停下等我派任务。
```

要点：
- `GEMINI.md` 是给 Gemini 的入口（当前进度 + 规矩 + 验收），`AGENTS.md` 是团队规则，`CONTRACT.md` 是接口契约。
- 不要让 Gemini「凭印象」改，要求它**先读文件再动手**。
- 它改完，你自己跑一遍验收（见第 4 节）。

如果 `gemini` 命令不存在：装 Gemini CLI（`npm i -g @google/gemini-cli`）或用 Antigravity 打开这个目录，效果一样。

## 2. 网页 Gemini（不能直接改）

网页版没有文件权限，要喂上下文。两个做法：

**做法 A：贴三份文档（推荐，够用）**

1. 打开 `dukou-workbench/GEMINI.md`、`AGENTS.md`、`CONTRACT.md`，全文贴进对话。
2. 再贴**当前要改的那一个文件**（比如 `lib/jobs.mjs`）。
3. 发第 5 节的「任务模板」。

**做法 B：传 zip（Gemini 能读压缩包内容时）**

上传 `dukou-workbench-for-gemini.zip`，然后说「这是整个项目，先读 GEMINI.md / AGENTS.md / CONTRACT.md」。

网页版的关键约束（写进提示词里）：

```
你没有文件权限，只能输出文本。要求：
1. 只改我指定的文件，其它文件不要动。
2. 输出完整文件内容，不要「...省略...」片段，不要只给 diff（除非我要求）。
3. 不引入任何 npm 依赖，技术栈锁死：Node 原生 http + 原生 HTML/CSS/ESM。
4. 改完自查：字段名与 CONTRACT 一致、错误码只使用约定的 5 种、没把 key 写死。
```

## 3. 交接时必须让 Gemini 知道的三件事

1. **它没有历史上下文**：DSH 会话里发生的事它看不到，全靠 `GEMINI.md` + 你贴的文件。所以每次换话题，重新贴相关文件。
2. **契约是唯一事实来源**：`CONTRACT.md` 冻结了 10 个接口的数据模型与错误码；Gemini 想加字段，必须先改 CONTRACT 的「变更记录」，再改代码。
3. **零依赖是红线**：任何 `import` 第三方包、`npm install`、构建步骤都直接拒绝。这个项目 48 小时能跑起来全靠零依赖。

## 4. 验收（Gemini 改完，你跑这一遍）

```powershell
cd C:\Users\20708\Documents\deepseek-harness\default-workspace\dukou-workbench
node server.mjs
# 另开一个终端：
curl.exe http://localhost:8787/api/health
node scripts/seed-demo.mjs
git status --short
git diff --stat
```

人工检查：
- 打开 http://localhost:8787 ，四个 tab（生图 / 视频翻译 / 记账 / 接口）都能点，控制台无红字。
- 上传一张图 → 出套图 → 追问一句 → 仓库抽屉里能看到图。
- 记一笔账 → 三张卡数字对得上。

## 5. 任务模板（把方括号换成你的需求）

**A. 修 bug**

```
先读 GEMINI.md、AGENTS.md、CONTRACT.md。
问题：[具体现象，例如「上传第二张图后，套图只出第一张」]。
复现步骤：[1… 2… 3…]。
先定位到文件与行号，说明原因，再改。只改必要的地方，不顺手重构。
改完跑 node server.mjs 和 scripts/seed-demo.mjs 验证，回复里写：根因 / 改了哪几行 / 验证结果。
```

**B. 加功能**

```
先读 GEMINI.md、AGENTS.md、CONTRACT.md。
需求：[一句话]。验收标准：[可观测的结果]。
如果涉及新接口字段：先告诉我 CONTRACT 要怎么改，我确认后再动代码。
实现时只改 [具体文件]，不新增依赖，不改配色。
```

**C. 改界面**

```
先读 GEMINI.md 的「视觉」一节，以及 web/style.css 末尾的像素风覆盖层（约 743 行起）。
要改的地方：[页面/组件]。想要的效果：[一句话]。
颜色只从 style.css 已有的 token 取，不新增 hex，不用渐变/光晕/圆角/柔和阴影。
改完给我一张截图或说明怎么验。
```

**D. 部署 / 上线**

```
先读 GEMINI.md 的「还没做完」。
目标：把 8787 的服务放到公网，让我用手机能打开演示。
约束：零依赖不变；key 仍然只在 .env，不写进代码；给我一条命令能起/停。
先给方案（平台、步骤、成本、风险），我选了再动手。
```

## 6. 常见坑

- **Gemini 会想装包**：直接说「不许 npm install，项目零依赖」。
- **Gemini 会改配色**：它习惯「优化视觉」，而这个项目配色是用户拍板的，改之前必须问。
- **Gemini 会重写整个文件**：说「只改这几行，保留其余原样」，否则一次改动会淹没在重构里。
- **网页版会漏上下文**：长对话后它会忘契约，隔几轮重新贴一次 `CONTRACT.md` 的关键段。
- **不要把 `.env` 发给任何 AI**：key 只在本机，`GEMINI.md` 里也不含 key。
