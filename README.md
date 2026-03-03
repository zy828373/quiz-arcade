# ⚔ Quiz Arcade — 像素風闯关问答游戏

一款復古 Pixel Art 街機風格的闯关问答网页游戏，使用 React + Vite 开发，搭配 Google Sheets 作为题库与成绩数据库、Google Apps Script 作为后端 API。

---

## 📦 安装与启动

### 前置条件

- [Node.js](https://nodejs.org/) v18+
- npm（随 Node.js 一起安装）
- 一个 Google 帐号

### 安装步骤

```bash
# 1. 克隆或下载专案
git clone <your-repo-url>
cd 第二个项目

# 2. 安装依赖
npm install

# 3. 复制环境变数文件并填入设定
#    (.env 已存在于专案根目录，直接编辑即可)
```

### 环境变数说明

编辑专案根目录的 `.env` 文件：

```env
# Google Apps Script 部署后的 Web App URL（留空则启用 Mock 模式）
VITE_GOOGLE_APP_SCRIPT_URL=

# 通过门槛：答对几题才算通关（默认 8）
VITE_PASS_THRESHOLD=8

# 每次游戏的题目数量（默认 10）
VITE_QUESTION_COUNT=10
```

> 💡 **Mock 模式**：当 `VITE_GOOGLE_APP_SCRIPT_URL` 为空时，游戏会使用内建的示例题目运行，方便你在设置 Google Sheets 之前先测试 UI。

### 启动开发服务器

```bash
npm run dev
```

浏览器打开 `http://localhost:5173` 即可开始游玩。

### 打包生产版本

```bash
npm run build
```

产出档案位于 `dist/` 目录。

---

## 🚀 部署到 GitHub Pages

本专案内建 GitHub Actions 自动部署，推送到 `main` 分支即自动构建并发布。

### 第一步：建立 GitHub 仓库

1. 前往 [github.com/new](https://github.com/new) 建立新仓库
2. 仓库名称填入 `quiz-arcade`（或你喜欢的名称）
3. 选择 **Public**
4. ⚠️ **不要勾选** "Add a README"、"Add .gitignore" 等初始化选项
5. 点击 **Create repository**

### 第二步：推送代码到 GitHub

```bash
# 初始化 Git（如果还没有的话）
git init
git add .
git commit -m "first commit"
git branch -M main

# 关联远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/<你的用户名>/quiz-arcade.git

# 推送代码
git push -u origin main
```

### 第三步：配置 GitHub Pages

1. 进入仓库 **Settings → Pages**
2. **Source** 下拉菜单选择 **GitHub Actions**（不是 "Deploy from a branch"）

### 第四步：设置环境变量

进入仓库 **Settings → Secrets and variables → Actions**：

**Secrets**（点击 "New repository secret"）：

| Name | Value | 说明 |
|------|-------|------|
| `VITE_GOOGLE_APP_SCRIPT_URL` | `https://script.google.com/macros/s/.../exec` | GAS Web App URL |

**Variables**（切换到 Variables 标签页，可选）：

| Name | Default | 说明 |
|------|---------|------|
| `VITE_PASS_THRESHOLD` | `8` | 通关门槛 |
| `VITE_QUESTION_COUNT` | `10` | 每次题数 |

> 💡 如果不设置 Variables，将自动使用默认值。

### 第五步：触发部署

Secret 设好后，推送一次即可触发部署：

```bash
git commit --allow-empty -m "ci: trigger GitHub Pages deployment"
git push origin main
```

也可以在仓库 **Actions** 页面手动点击 **Run workflow** 触发。

### 第六步：访问网站

1. 进入仓库 **Actions** 标签页，确认部署流程显示 ✅ 绿色通过
2. 进入 **Settings → Pages** 查看网站地址，格式为：

```
https://<你的用户名>.github.io/quiz-arcade/
```

---

## 📊 Google Sheets 设置（详细操作）

### 第一步：建立 Google Sheets

1. 前往 [Google Sheets](https://sheets.google.com)，点击 **「空白」** 建立新的电子表格
2. 将档案命名为 `Quiz Arcade 题库`（或你喜欢的名称）

### 第二步：建立「题目」工作表

1. 左下角的工作表标签，双击 **「工作表1」** 重新命名为 **`题目`**
2. 在第一行输入以下表头：

| A 列 | B 列 | C 列 | D 列 | E 列 | F 列 | G 列 |
|------|------|------|------|------|------|------|
| 题号 | 题目 | A | B | C | D | 解答 |

3. 从第 2 行开始填入题目数据（可参考下方「测试题目」章节直接复制贴上）

> ⚠️ **解答栏位**只填写 **A / B / C / D** 其中一个字母。

### 第三步：建立「回答」工作表

1. 点击左下角的 **「+」** 新增工作表
2. 将新工作表命名为 **`回答`**
3. 在第一行输入以下表头：

| A 列 | B 列 | C 列 | D 列 | E 列 | F 列 | G 列 |
|------|------|------|------|------|------|------|
| ID | 闯关次数 | 总分 | 最高分 | 第一次通关分数 | 花了几次通关 | 最近游玩时间 |

> 只需建立表头即可，数据会由系统自动写入。

---

## ⚙️ Google Apps Script 设置（详细操作）

### 第一步：打开 Apps Script 编辑器

1. 在你刚建立的 Google Sheets 中，点击顶部菜单的 **「扩充功能」→「Apps Script」**
2. 这会打开一个新的 Apps Script 编辑器页面

### 第二步：贴上后端代码

1. 编辑器左侧会显示一个默认的 `Code.gs` 文件
2. **全选并删除**编辑器中的默认代码
3. 打开专案中的 `google-apps-script/Code.gs` 文件
4. **复制全部内容**，贴到 Apps Script 编辑器中
5. 按 `Ctrl + S` 保存

### 第三步：部署为 Web App

1. 点击编辑器右上角的 **「部署」→「新增部署作业」**
2. 点击左上角的�的 ⚙️ �的图标，选择 **「网页应用程式」**
3. 填写设定：
   - **说明**：`Quiz Arcade API`（任意）
   - **执行身分**：选择 **「我」**（你的 Google 帐号）
   - **谁可以存取**：选择 **「所有人」**
4. 点击 **「部署」**
5. 首次部署会要求授权，点击 **「授权存取」**，跟随 Google 的授权流程
6. 部署完成后，会显示一个 **Web App URL**，格式如下：

```
https://script.google.com/macros/s/AKfycbx.../exec
```

7. **复制这个 URL**

### 第四步：设定前端环境变数

1. 回到专案根目录，编辑 `.env` 文件
2. 将复制的 URL 贴到 `VITE_GOOGLE_APP_SCRIPT_URL`：

```env
VITE_GOOGLE_APP_SCRIPT_URL=https://script.google.com/macros/s/AKfycbx.../exec
```

3. 重新启动开发服务器（`Ctrl + C` 然后 `npm run dev`）

### 第五步：验证连线

1. 打开游戏网页，输入一个测试 ID（如 `test123`），开始游戏
2. 完成所有题目后，回到 Google Sheets 的 **「回答」** 工作表
3. 确认是否出现一笔新的成绩记录

> 🔄 **更新部署**：如果修改了 `Code.gs`，需要再次 **「部署」→「新增部署作业」** 建立新版本。旧的 URL 会继续指向旧版本。

### ⚠️ 常见问题

| 症状 | 原因 | 解决方式 |
|------|------|----------|
| `Sheet "题目" not found` | 工作表标签名称与代码不一致（注意简繁体） | 确认 Google Sheets 底部的标签名和 `Code.gs` 中 `QUESTION_SHEET_NAME` / `ANSWER_SHEET_NAME` **完全一致** |
| `Failed to load questions` / 403 | 部署权限未设为「所有人」，或代码更新后未重新部署 | 确认「谁可以存取」设为 **所有人**，并使用 **新建部署** 确保最新代码生效 |
| 修改代码后无效果 | 仅保存代码不会更新线上 Web App | 必须通过 **「部署 → 新增部署作业」** 创建新版本，或在「管理部署」中选择 **「新版本」** |

---

## 📝 测试题目：生成式 AI 基础知识（10 题）

以下 10 题可直接复制贴到 Google Sheets 的 **「题目」** 工作表中（从第 2 行开始）：

| 题号 | 题目 | A | B | C | D | 解答 |
|------|------|---|---|---|---|------|
| 1 | ChatGPT 是由哪家公司开发的？ | Google | OpenAI | Meta | Microsoft | B |
| 2 | GPT 中的「T」代表什么？ | Training | Transfer | Transformer | Translation | C |
| 3 | 在大型语言模型中，「Token」最接近以下哪个概念？ | 一个完整的句子 | 一段文字的片段（字或词） | 一张图片的像素 | 一个数据库的记录 | B |
| 4 | 以下哪项是「Prompt Engineering」的正确描述？ | 训练神经网络的一种方法 | 设计AI芯片的工程流程 | 通过优化输入提示来获得更好的AI输出 | 优化数据库查询的技术 | C |
| 5 | 什么是大型语言模型的「幻觉」(Hallucination)？ | 模型产生的视觉特效 | 模型生成看似合理但实际上错误的内容 | 模型无法理解用户输入 | 模型的运算速度过慢 | B |
| 6 | RAG（检索增强生成）的主要目的是什么？ | 加快模型的推理速度 | 让模型生成更多图片 | 结合外部知识来增强生成的准确性 | 减少模型的参数量 | C |
| 7 | 以下哪个是文字生成图片的 AI 模型？ | BERT | Stable Diffusion | LSTM | Random Forest | B |
| 8 | 在使用生成式 AI 时，「Temperature」参数的作用是？ | 控制模型运行的CPU温度 | 调整模型输出的随机性与创造性 | 设定模型的训练时间 | 限制模型可处理的文本长度 | B |
| 9 | Fine-tuning（微调）是指什么？ | 从零开始训练一个全新的模型 | 在预训练模型的基础上使用特定资料进一步训练 | 调整显示器的分辨率 | 删除模型中不需要的参数 | B |
| 10 | 以下哪项不是生成式 AI 的常见应用？ | 文章摘要与翻译 | 代码自动生成 | 数据库索引优化 | 图像与影片生成 | C |

> 💡 **使用方式**：选取上方表格内容（不含表头），直接贴到 Google Sheets 的 A2 格即可。

---

## 🎮 游戏操作流程

1. **首页**：输入你的 ID，点击 START GAME
2. **闯关**：每一关对应一个像素风「关主」，选择 A/B/C/D 作答
3. **结算**：答完所有题后显示成绩，达到门槛即为通关
4. **回顾**：点击 REVIEW ANSWERS 查看每题的答对/答错详情（✔ 绿色 = 正确答案，✖ 红色 = 你的错误选择）
5. **重玩**：点击 PLAY AGAIN 可再次挑战

---

## 🗂️ 专案结构

```
├── .env                          # 环境变数
├── .env.example                  # 环境变数示例
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Pages 自动部署
├── index.html                    # 入口 HTML
├── src/
│   ├── config.js                 # 环境变数读取
│   ├── App.jsx                   # 游戏状态机
│   ├── index.css                 # Pixel Art 设计系统
│   ├── main.jsx                  # React 入口
│   ├── components/
│   │   ├── StartScreen.jsx       # 首页：ID 输入
│   │   ├── QuizScreen.jsx        # 题目画面：关主 + 选项
│   │   ├── ResultScreen.jsx      # 结算画面：成绩 + 通关判定 + 答题回顾
│   │   ├── LoadingScreen.jsx     # 载入动画
│   │   └── Starfield.jsx         # 星空背景
│   ├── services/
│   │   └── api.js                # API 串接 + Mock 模式
│   └── utils/
│       ├── avatars.js            # DiceBear 关主图片
│       └── mockData.js           # 内建测试题目
└── google-apps-script/
    ├── Code.gs                   # GAS 后端完整代码
    └── SHEETS_SETUP.md           # Sheets 设置指南
```
