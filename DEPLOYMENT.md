# Codex 号池部署交接说明

本文档用于把本项目部署到另一台 Windows 电脑。仓库内只保存公开源码、脚本、文档和示例配置；真实账号、token、密码、运行数据库与日志不上传 GitHub，请从本机私有交接目录恢复。

## 1. 环境要求

- Windows 10/11 或 Windows Server。
- Node.js `>=24.0.0`，当前项目已验证 `v24.11.0` 可用。
- PowerShell 5+。
- Git。
- 可选：Cloudflare Tunnel。如果要启动公网隧道，需要准备本机 `cloudflared.exe` 和 Cloudflare 配置。

## 2. 获取代码

```powershell
git clone https://github.com/zy828373/quiz-arcade.git
cd quiz-arcade
```

如果从压缩包交接，解压后直接进入项目根目录。

## 3. 恢复私有配置

从本机私有交接目录 `_PRIVATE_HANDOFF_DO_NOT_GIT/` 按清单复制真实文件。目标位置如下：

```text
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/.claude.json        -> ./.claude.json
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/config_team.yaml    -> ./config_team.yaml
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/proxy_config.json   -> ./proxy_config.json
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/v2/.env             -> ./v2/.env
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/auths_team/         -> ./auths_team/
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/auths_free/         -> ./auths_free/
_PRIVATE_HANDOFF_DO_NOT_GIT/sensitive_files/secrets_vault/      -> ./secrets_vault/
```

如果不恢复运行数据库，首次部署可让 V2 重新初始化数据库。如果要完全延续当前机器状态，再复制：

```text
_PRIVATE_HANDOFF_DO_NOT_GIT/runtime_data/v2/data/control-plane.sqlite* -> ./v2/data/
_PRIVATE_HANDOFF_DO_NOT_GIT/runtime_data/v2/data/cutover-mode.env      -> ./v2/data/
_PRIVATE_HANDOFF_DO_NOT_GIT/runtime_data/v2/data/health_v2_restart_state.json -> ./v2/data/
```

仓库中提供了 `config_team.example.yaml`、`proxy_config.example.json`、`v2/.env.example`，没有私有交接文件时可先复制这些模板再手动填写真实值。

## 4. 安装与初始化

```powershell
cd .\v2
npm install
npm run db:init
npm run accounts:sync
npm run health:probe
cd ..
```

如果已经从私有交接目录恢复了 `v2/data/control-plane.sqlite*`，通常仍可以运行 `npm run accounts:sync` 和 `npm run health:probe` 来刷新状态。

## 5. 启动服务

一键启动：

```powershell
.\start_all.bat
```

单独启动：

```powershell
.\start_team.bat
.\start_anthropic_proxy.bat
.\start_v2.bat
.\start_tunnel.bat
```

默认端口：

```text
Team Pool:       http://localhost:8317
Anthropic Proxy: http://localhost:8320
V2 Gateway:      http://localhost:18320
管理页面:         http://localhost:8317/management.html
```

## 6. 验证

```powershell
Invoke-WebRequest http://localhost:8317/management.html
Invoke-WebRequest http://localhost:8320/v1/models
Invoke-WebRequest http://localhost:18320/health
```

V2 测试：

```powershell
cd .\v2
npm test
```

## 7. 常见问题

- `cli-proxy-api.exe` 找不到：确认根目录存在该文件，或从发布包重新放回根目录。
- `config_team.yaml` 或 `proxy_config.json` 找不到：从私有交接目录恢复，或复制 `.example` 模板后填写真实值。
- `v2/.env` 找不到：复制 `v2/.env.example` 为 `v2/.env`，再填入 `V2_GATEWAY_CLIENT_API_KEYS`、`V2_OPERATOR_API_KEYS` 等值。
- 账号为空或鉴权失败：确认 `auths_team/`、`auths_free/` 已恢复到项目根目录。
- Cloudflare Tunnel 启动失败：`start_tunnel.bat` 当前默认读取 `C:\Users\AWSA\.cloudflared\config.yml`，新电脑上需要创建对应配置或修改脚本路径。
- 端口被占用：检查 `8317`、`8320`、`18320`，关闭占用进程或修改配置端口。
