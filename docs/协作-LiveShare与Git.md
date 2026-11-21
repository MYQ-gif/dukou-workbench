# 协作方式：Live Share 和 Git 是两层，不要混

> 一句话：**Live Share 用来「一起写」，Git 用来「记住写了什么」。**
> 只靠 Live Share，会话一结束，对方电脑里不一定还留着文件。

## 一、Live Share（实时结对，临时）

### 只是看一眼 / 一起改一段代码
1. 打开 VS Code
2. `Ctrl+Shift+P` → 输入 `Live Share: Join Collaboration Session` → 回车
3. 粘贴邀请链接 → 回车
4. 首次会让你登录（GitHub 或 Microsoft 都可以，两人不必同一个账号）

### 发起会话（推荐由**代码在你这里**的人发起）
1. VS Code 打开 `dukou-workbench` 文件夹
2. `Ctrl+Shift+P` → `Live Share: Start Collaboration Session`
3. 复制弹出的链接发给马和卓
4. 需要对方能在你终端里跑命令：`Ctrl+Shift+P` → `Live Share: Share Server` / 在会话面板里把终端设为可读写

### 三个必须知道的限制
- **访客默认只读**：没登录的匿名访客只能看，不能改。要改必须登录。
- **访客的改动落在主持人电脑上**：你的编辑实时改的是对方的文件，你本地不留副本。
- **三人同时改一个文件会互相覆盖**：Live Share 不是合并工具，同一文件请只让一个人动。

## 二、Git（长期留痕，必须做）

```bash
git clone <私有库地址>
git checkout -b feat/你的部分
# 干完
git add -A && git commit -m "feat: 出图任务轮询"
git push -u origin feat/你的部分
# 去网页开 PR，等主人合并
```

规矩写在 `AGENTS.md` 第 6 节：一人一条分支、main 只能 PR、12:00 / 22:00 两个对时点。

## 三、48 小时里怎么配

| 场景 | 用什么 |
|------|--------|
| 三人对接口、改契约 | Live Share（15 分钟，说完就散） |
| 各自写自己那份文件 | Git 分支，别开 Live Share |
| 联调排错 | Live Share + 共享终端 |
| 12.06 晚上冻结版本 | 只走 Git，禁止再开 Live Share 改代码 |

## 四、最容易被 Live Share 坑死的三件事

1. **以为改完就存下了** —— 实际存在对方电脑，你的仓库里没有提交。
2. **三个人挤一个会话** —— 光标互相跳，改同一文件时静默覆盖。
3. **会话中跑了 `git checkout`** —— 所有人的工作区一起变，直接炸。

> 结论：Live Share 每天最多用 30 分钟（对接口 + 联调），剩下时间各写各的分支，靠 PR 合并。
