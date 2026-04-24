# OpenClaw 在 Windows 虚拟机（WSL2 + Ubuntu 24.04）上的完整部署记录

## 1. 文档目的

本文档用于完整记录一次在 **Windows 虚拟机** 上部署 **OpenClaw** 的实际过程，包含：

- 环境背景
- 虚拟机资源配置
- 远程连接方式
- WSL2 安装与排障
- Ubuntu 24.04 初始化
- systemd 配置
- OpenClaw 安装与 Onboarding 过程
- 部署过程中遇到的问题与解决方案
- 当前部署结果与后续建议

本文档基于一次真实部署过程整理，适合作为后续重复部署、交接、复盘和内部留档使用。

openclaw密码：My828373@
---

## 2. 最终确认的部署环境

### 2.1 本地电脑

- 操作系统：Wimidows 10
- 用途：通过远程桌面连接虚拟机

### 2.2 远程虚拟机

- 操作系统：Windows 10
- 资源类型：虚拟主机 + 可视化
- CPU：4C
- 内存：8G
- 磁盘：100G
- 部署方式：Windows 虚拟机内安装 WSL2，再在 Ubuntu 中安装 OpenClaw
- 远程访问方式：Windows 远程桌面（RDP）

### 2.3 部署结论

该配置可以满足 OpenClaw 的基本安装和运行要求，适合作为开发测试环境。

---

## 3. 资源申请填写建议

### 3.1 资源申请表推荐填写内容

| 字段 | 建议值 |
|---|---|
| 资源类型 | 虚拟主机+可视化 |
| CPU | 4C |
| Memory | 8G |
| Disk（GB） | 100G |
| 集群or单机 | 单机 |
| 数量 | 1 |
| 版本 | Windows |
| 备注 | OpenClaw 运行环境（WSL2） |

### 3.2 资源类型说明推荐写法

资源类型：虚拟主机+可视化：虚拟主机+可视化界面

或更完整地写为：

资源类型：虚拟主机+可视化：虚拟主机+可视化界面，用于搭建 OpenClaw 开发测试环境

### 3.3 是否需要 MySQL / Redis

在本次标准部署中，**不需要额外申请 MySQL、Redis 等数据库资源**。

原因：

- 当前目标是先完成 OpenClaw 的基础安装与验证
- OpenClaw 的基础运行并不依赖这类外部数据库资源作为前置条件
- 若后续接入公司业务系统、做消息归档、审计、报表或多服务扩展，再按需补申请相关数据库资源

---

## 4. 安装路线选择结论

### 4.1 推荐方案

最终采用的方案为：

**Windows 虚拟机 → WSL2 → Ubuntu 24.04 → OpenClaw**

### 4.2 为什么不用原生 Windows 直接装

不采用原生 Windows 直接安装 OpenClaw 的原因：

- 官方更推荐 Windows 走 WSL2 路线
- Linux 环境对 CLI、脚本、依赖兼容性更好
- 安装与后续服务化更稳
- 遇到问题时更容易参考官方 Linux / WSL 文档处理

### 4.3 PDF 手册与最终方案的关系

在比对 PDF 实战手册后，得到的最终判断是：

- PDF 的部署方向是对的
- 但更适合作为实战经验和排障参考
- 作为首次部署主线，仍以当前官方推荐路径更稳

最终决定：

**采用官方推荐主线：WSL2 + Ubuntu + OpenClaw Installer + Onboarding**

---

## 5. 远程连接虚拟机

### 5.1 连接方式

使用 Windows 远程桌面连接虚拟机。

### 5.2 操作步骤

1. 在本地 Win10 电脑按 `Win + R`
2. 输入 `mstsc`
3. 打开“远程桌面连接”
4. 输入虚拟机 IP 地址
5. 输入运维提供的用户名和密码
6. 成功进入远程桌面

### 5.3 注意事项

- 本地电脑是 Win10，不影响远程虚拟机中部署 OpenClaw
- 实际安装操作均在“远程进入后的虚拟机”中完成

---

## 6. WSL2 安装过程

### 6.1 初始状态

在虚拟机中执行：

```powershell
wsl -l -v
```

出现提示：

> 适用于 Linux 的 Windows 子系统没有已安装的分发。

说明：

- WSL 功能已经有了
- 但 Ubuntu 发行版还没有安装

### 6.2 查看可安装发行版

执行：

```powershell
wsl --list --online
```

结果中可以看到：

- Ubuntu
- Ubuntu-24.04
- Ubuntu-22.04
- Debian
- Kali 等其他发行版

最终选择：

```powershell
wsl --install -d Ubuntu-24.04
```

---

## 7. WSL2 安装过程中遇到的问题与解决

### 7.1 问题一：HCS_E_HYPERV_NOT_INSTALLED

#### 现象

执行 Ubuntu 安装时出现错误：

```text
HCS_E_HYPERV_NOT_INSTALLED
```

并提示：

- 当前计算机不支持 WSL2
- 请启用“虚拟机平台”
- 并确保在 BIOS 中启用虚拟化

#### 原因判断

这不是命令问题，而是这台虚拟机缺少运行 WSL2 所需的底层虚拟化能力。

在虚拟机内使用 WSL2，通常需要：

- 启用 Virtual Machine Platform
- 宿主机侧开启嵌套虚拟化（Nested Virtualization）

#### 已执行处理

先在虚拟机中执行：

```powershell
wsl --install --no-distribution
```

该命令执行成功，说明 Virtual Machine Platform 已启用。

随后联系运维，要求为该虚拟机开启虚拟化能力。

运维反馈已启用虚拟化后，继续后续安装。

---

### 7.2 问题二：0x80072efe 网络中断

#### 现象

再次执行：

```powershell
wsl --install -d Ubuntu-24.04
```

报错：

```text
无法从 https://raw.githubusercontent.com/microsoft/WSL/master/distributions/DistributionInfo.json 提取列表分发
错误代码: 0x80072efe
```

#### 初步判断

说明安装过程中访问微软在线源时连接被中断。

#### 排查方式

在浏览器中直接访问：

```text
https://raw.githubusercontent.com/microsoft/WSL/master/distributions/DistributionInfo.json
```

结果：浏览器可以正常打开 JSON 内容。

#### 解决方式

改用 web-download 方式安装：

```powershell
wsl --install --web-download -d Ubuntu-24.04
```

该命令成功进入发行版下载与初始化流程。

---

## 8. Ubuntu 24.04 初始化

### 8.1 首次初始化

安装成功后，WSL 开始初始化 Ubuntu：

```text
Provisioning the new WSL instance Ubuntu-24.04
This might take a while...
Create a default Unix user account: openclaw
```

### 8.2 创建 Linux 用户

在初始化过程中，创建 Linux 用户：

- 用户名：`openclaw`
- 设置 Linux 密码

成功后出现提示：

```text
passwd: password updated successfully
To run a command as administrator (user "root"), use "sudo <command>".
```

以及终端提示符：

```bash
openclaw@DESKTOP-RUDOH8A:~$
```

这表示 Ubuntu 初始化完成。

### 8.3 初始化曾出现卡住的情况

#### 现象

曾出现：

```text
wsl: 正在等待 OOBE 命令完成分发 “Ubuntu-24.04”...
```

长时间不结束。

#### 处理方式

执行：

```powershell
wsl --shutdown
```

关闭当前 WSL 实例后，重新打开 Ubuntu，重新进入初始化流程，最终顺利完成。

---

## 9. Ubuntu 基础更新

进入 Ubuntu 后，先执行：

```bash
sudo apt update
```

结果正常，说明 Ubuntu 网络和软件源可用。

---

## 10. 配置 systemd

### 10.1 为什么必须做

在 Windows + WSL2 场景下，OpenClaw 的 Gateway/服务安装依赖 systemd，因此需要在 WSL 中显式开启。

### 10.2 配置方法

在 Ubuntu 中执行：

```bash
printf "[boot]
systemd=true
" | sudo tee /etc/wsl.conf > /dev/null
```

### 10.3 验证配置写入成功

执行：

```bash
cat /etc/wsl.conf
```

输出为：

```text
[boot]
systemd=true
```

说明配置文件写入成功。

### 10.4 让配置生效

在 Windows PowerShell 中执行：

```powershell
wsl --shutdown
```

然后重新打开 Ubuntu。

### 10.5 验证 systemd 是否可用

在 Ubuntu 中执行：

```bash
systemctl --version
```

输出显示：

```text
systemd 255 ...
```

说明 systemd 已正常启用。

---

## 11. 安装 OpenClaw

### 11.1 安装命令

在 Ubuntu 中执行官方安装脚本：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### 11.2 安装过程中的提示

安装脚本自动检测到当前环境：

- OS: linux
- 安装方式：npm
- 版本：latest

并自动处理 Node.js 安装与 OpenClaw 安装。

### 11.3 sudo 授权

安装过程中提示输入当前 Linux 用户密码，以便执行管理员权限操作。

输入密码后，安装继续执行。

### 11.4 安装成功结果

最终看到：

```text
OpenClaw installed successfully (OpenClaw 2026.3.8 ...)
```

说明安装成功。

---

## 12. OpenClaw Onboarding 过程记录

安装完成后，自动进入 OpenClaw 的 Onboarding 向导。

### 12.1 Security 提示

出现安全说明页面，提示 OpenClaw 默认按个人使用场景设计。

处理方式：

- 选择 `Yes`
- 继续初始化

### 12.2 Onboarding mode

可选：

- QuickStart
- Manual

处理方式：

- 选择 `QuickStart`

原因：先快速跑通安装流程，细节后补。

### 12.3 Model/auth provider

提供了大量模型与认证提供商选项，如：

- OpenAI
- Anthropic
- Google
- OpenRouter
- Copilot
- Vercel AI Gateway 等

当前阶段处理方式：

- 选择跳过，后面再配置

### 12.4 Filter models by provider

出现模型列表筛选器。

处理方式：

- 保持 `All providers`
- 继续下一步

### 12.5 Default model

处理方式：

- 选择 `Keep current`

### 12.6 Select channel (QuickStart)

可选消息渠道包括：

- Telegram
- Discord
- Google Chat
- Slack
- LINE
- 飞书/其他平台等

当前阶段处理方式：

- 选择 `Skip for now`

原因：当前先完成环境安装，不立即接入外部聊天渠道。

### 12.7 Search provider

可选联网搜索提供商包括：

- Brave Search
- Gemini
- Grok
- Kimi
- Perplexity Search 等

当前阶段处理方式：

- 选择 `Skip for now`

### 12.8 Configure skills now

这里选择：

- `Yes`

继续配置 skills 流程。

### 12.9 Install missing skill dependencies

列出多个可选 skill 依赖，例如：

- 1password
- github
- obsidian
- openai-whisper
- summarize
- xurl 等

当前阶段处理方式：

- 选择 `Skip for now (Continue without installing dependencies)`

原因：当前先完成主流程，不额外安装大量可选依赖。

### 12.10 各类 API Key 配置

依次出现：

- GOOGLE_PLACES_API_KEY
- GEMINI_API_KEY
- NOTION_API_KEY
- OPENAI_API_KEY
- ELEVENLABS_API_KEY

当前阶段处理方式：

- 全部选择 `No`

原因：后续按实际需求再逐项配置。

### 12.11 Hooks

出现 Hooks 配置页面，说明可用于自动化动作。

当前阶段处理方式：

- 选择 `Skip for now`

### 12.12 Start TUI / Open Web UI / Do this later

在最后阶段会询问：

- Hatch in TUI
- Open the Web UI
- Do this later

当前阶段处理方式：

- 选择 `Do this later`

原因：此时还未配置模型与 API Key，先完成安装收尾更稳。

### 12.13 Onboarding 完成

最终出现：

```text
Onboarding complete. Use the dashboard link above to control OpenClaw.
```

说明 OpenClaw 初始化流程全部完成。

---

## 13. PATH 问题与修复

### 13.1 现象

在 onboarding 结束后，执行：

```bash
openclaw doctor
```

提示：

```text
openclaw: command not found
```

### 13.2 原因

并不是 OpenClaw 没装好，而是当前 shell 还未重新加载安装脚本写入的环境配置。

### 13.3 修复方法

执行：

```bash
source ~/.bashrc
```

然后再执行：

```bash
openclaw --version
```

得到结果：

```text
OpenClaw 2026.3.8 (3caab92)
```

说明：

- OpenClaw 已成功安装
- PATH 已生效
- 当前终端可正常调用 `openclaw` 命令

---

## 14. 当前部署结果

截至当前，已经完成的内容如下：

### 14.1 已完成

- Windows 虚拟机资源申请
- Windows 远程桌面接入
- WSL2 启用
- Ubuntu 24.04 安装
- Linux 用户初始化
- `apt update`
- systemd 配置并生效
- OpenClaw 官方安装脚本执行成功
- OpenClaw onboarding 完成
- `openclaw --version` 验证成功

### 14.2 当前版本

```text
OpenClaw 2026.3.8 (3caab92)
```

### 14.3 当前未完成项

当前还没有完成的是：

- 模型提供商配置
- API Key 配置
- 聊天渠道接入
- Web Search Provider 配置
- 可选 Skills 依赖安装
- Hooks 配置

这意味着：

**OpenClaw 已经安装完成，但还未接入模型与外部能力，因此暂时不能真正开始对话或执行完整能力。**

---

## 15. 本次部署中的关键经验总结

### 15.1 Windows 虚拟机中跑 OpenClaw，核心不是 Windows 版本，而是 WSL2 是否能跑起来

最关键的不是本机或虚拟机是 Win10 还是 Win11，而是：

- WSL2 是否正常
- Ubuntu 是否能正常安装
- systemd 是否已启用

### 15.2 在虚拟机里跑 WSL2，经常会卡在虚拟化能力

本次最关键的障碍不是 OpenClaw 本身，而是：

- 虚拟机底层虚拟化能力不足
- 宿主机/虚拟化平台未正确暴露虚拟化能力给来宾系统

一旦遇到 `HCS_E_HYPERV_NOT_INSTALLED`，优先考虑：

- Virtual Machine Platform
- Nested Virtualization

### 15.3 网络问题未必是完全断网，可能只是某条安装路径不稳定

虽然 `wsl --install -d Ubuntu-24.04` 一度报 `0x80072efe`，但浏览器访问原始链接是通的。

因此最终通过：

```powershell
wsl --install --web-download -d Ubuntu-24.04
```

绕过了安装链路问题。

### 15.4 heredoc 容易输错，能用单行命令就尽量用单行命令

在写 `/etc/wsl.conf` 时，多行 heredoc 容易因为输入法、回车、复制粘贴导致混乱。

更稳的方式是使用：

```bash
printf "[boot]
systemd=true
" | sudo tee /etc/wsl.conf > /dev/null
```

### 15.5 Onboarding 时，第一次部署建议先跳过不必要项

对于首次部署，推荐先跳过：

- Provider API Key
- Search Provider
- Channel
- Skill dependencies
- Hooks

先把软件装起来、命令跑通，再按需求逐项补配。

---

## 16. 后续建议

### 16.1 下一步建议执行的命令

后续可以先执行：

```bash
source ~/.bashrc
openclaw --version
openclaw doctor
```

用于检查当前缺失的配置项。

### 16.2 后续需要补配的重点

后续如果要真正使用 OpenClaw，优先补以下内容：

1. 模型提供商
2. 对应 API Key
3. 默认模型
4. 是否启用 Web Search
5. 是否接入 Telegram / Slack / 飞书等渠道

### 16.3 建议分阶段推进

建议按以下顺序推进：

#### 阶段一：验证安装

- `openclaw --version`
- `openclaw doctor`

#### 阶段二：配置模型

- 补充 OpenAI / Anthropic / Google 等提供商配置
- 设置默认模型

#### 阶段三：配置渠道

- 按需要接入 Telegram、Slack、飞书等

#### 阶段四：按需增加能力

- Web Search
- Skills 依赖
- Hooks
- 额外插件/自动化

---

## 17. 本次部署用到的关键命令汇总

### 17.1 WSL / Ubuntu 相关

```powershell
wsl -l -v
wsl --list --online
wsl --install --no-distribution
wsl --install -d Ubuntu-24.04
wsl --install --web-download -d Ubuntu-24.04
wsl --shutdown
```

### 17.2 Ubuntu 初始化后

```bash
sudo apt update
printf "[boot]
systemd=true
" | sudo tee /etc/wsl.conf > /dev/null
cat /etc/wsl.conf
systemctl --version
```

### 17.3 OpenClaw 安装与验证

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
source ~/.bashrc
openclaw --version
openclaw doctor
```

---

## 18. 最终结论

本次在 **Windows 虚拟机（4C / 8G / 100G）** 中，采用 **WSL2 + Ubuntu 24.04 + OpenClaw 官方安装脚本** 的方式，已经成功完成 OpenClaw 的基础部署。

最终结果如下：

- OpenClaw 安装成功
- Ubuntu 环境正常
- systemd 正常
- `openclaw --version` 可用
- Onboarding 已完成

当前尚未配置模型/API Key/渠道，因此安装已经完成，但尚未进入真正可用的业务使用状态。

后续只需继续补充模型提供商和相关 API Key，即可逐步进入实际使用阶段。


