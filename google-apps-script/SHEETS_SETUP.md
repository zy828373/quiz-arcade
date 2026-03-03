# Google Sheets 设置指南

## 1. 建立工作表

在你的 Google Sheets 中建立以下两个工作表：

### 工作表：「题目」

| 题号 | 题目 | A | B | C | D | 解答 |
|------|------|---|---|---|---|------|
| 1 | HTML 代表什么？ | Hyper Text Markup Language | High Tech Modern Language | Hyper Transfer Markup Language | Home Tool Markup Language | A |
| 2 | CSS 的全名是？ | Creative Style Sheets | Cascading Style Sheets | Computer Style Sheets | Colorful Style Sheets | B |

> **注意**: 解答欄位只填寫 A/B/C/D 其中一個字母。

### 工作表：「回答」

| ID | 闯关次数 | 总分 | 最高分 | 第一次通关分数 | 花了几次通关 | 最近游玩时间 |
|----|----------|------|--------|----------------|--------------|--------------|

> **注意**: 只需建立表头，数据会由系统自动写入。

---

## 2. 部署 Google Apps Script

1. 在 Google Sheets 中点击 **Extensions > Apps Script**
2. 将 `Code.gs` 的完整代码复制到编辑器中
3. 点击 **Deploy > New deployment**
4. 类型选择 **Web app**
5. 设置：
   - **Execute as**: Me (你的帐号)
   - **Who has access**: Anyone
6. 点击 **Deploy**，复制产生的 URL

---

## 3. 设置前端环境变量

将复制的 URL 填入项目根目录的 `.env` 文件：

```
VITE_GOOGLE_APP_SCRIPT_URL=https://script.google.com/macros/s/你的脚本ID/exec
VITE_PASS_THRESHOLD=8
VITE_QUESTION_COUNT=10
```

---

## 4. 可选：在 Apps Script 设置通过门槛

在 Apps Script 编辑器中：
1. 点击 **Project Settings** (齿轮图标)
2. 展开 **Script Properties**
3. 添加属性：`PASS_THRESHOLD` = `8` (或你想要的门槛)

> 如果不设置，默认为 8 题通过。
