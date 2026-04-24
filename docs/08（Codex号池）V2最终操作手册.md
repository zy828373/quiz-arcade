# 08（Codex号池）V2最终操作手册

## 1. 文档目的

这份文档是 `Codex 号池 V2` 的最终操作手册，面向真实使用者和运维人员。

适用范围：

- 本地 Windows 机器运维
- 使用 `start_all.bat`、`health_check.ps1`、`V2` 控制面、`/ops` 页面
- 进行 `legacy -> parallel -> canary -> primary -> rollback` 的受控切换

这份文档重点解决 3 个问题：

1. 现在这套系统到底怎么启动
2. 平时怎么用 `/ops` 和脚本操作
3. 真要切流或回滚时，正确动作顺序是什么

---

## 2. 当前系统结构

当前仓库同时存在两套链路：

### 2.1 Legacy 现网链路

这是你原来一直在跑的主链路：

- `start_all.bat`
- `start_team.bat`
- `start_anthropic_proxy.bat`
- `start_tunnel.bat`
- `health_check.ps1`
- `cli-proxy-api.exe`
- `anthropic_proxy.js`
- `cloudflared.exe`

这套链路仍然保留，仍然是安全兜底链路。

### 2.2 V2 并行控制面链路

这是这次升级做出来的新系统：

- `v2/`
- SQLite 控制面数据库
- 账号注册表 / 状态账本
- 健康探测
- shadow scheduler
- 并行网关
- `/ops` 控制台
- readiness / synthetic probe
- cutover / rollback 护栏

注意：

- `V2` 现在仍然是“可控并行系统”
- 它**不是**直接替代 `team_pool` 的账号级主动分发器
- 当前真实转发仍然是：`V2 Gateway -> team_pool upstream`

---

## 3. 关键模式说明

V2 当前有 4 种 cutover mode：

### 3.1 `legacy`

含义：

- 现网入口继续走 legacy 链路
- `V2` 不应自动作为前门运行
- 这是默认安全模式

适用场景：

- 日常稳定运行
- 不准备做 V2 验证
- 任何需要快速回退的场景

### 3.2 `parallel`

含义：

- V2 可以并行启动
- 但不替代 legacy 前门
- 适合做本地验证、健康检查、synthetic probe、控制台观察

适用场景：

- 刚启动 V2
- 切流前验证阶段

### 3.3 `canary`

含义：

- 控制面批准你进入“受控切流准备态”
- 进入前必须通过 readiness gate
- 当前阶段仍然需要你人工处理真实外部入口切换

适用场景：

- 你已经完成本地验证，准备做小范围前门验证

### 3.4 `primary`

含义：

- 控制面批准进入“主前门准备态”
- 也必须通过 readiness gate
- 仍保留 legacy 回滚路径

适用场景：

- canary 验证稳定后
- 准备让 V2 作为主前门时

---

## 4. 重要原则

### 4.1 不要搞混两类“回滚”

普通 mode 切换：

- `POST /control/cutover/mode`
- 适合 `parallel / canary / primary`

真正 legacy 回滚：

- `POST /control/cutover/rollback`
- 或 [rollback_legacy.ps1](C:/Users/AWSA/Desktop/codex无线号池/rollback_legacy.ps1)

注意：

- 回到 `legacy` 不要再自己手动调普通 `/control/cutover/mode`
- 真正要回滚时，优先用专用 rollback 路径

### 4.2 所有 GET 默认只读

以下接口默认只读：

- `GET /health`
- `GET /healthz`
- `GET /health/summary`
- `GET /health/services`
- `GET /health/accounts`
- `GET /runtime/accounts`
- `GET /scheduler/preview`
- `GET /control/*`

这些 GET 用来查看状态，不负责写库。

### 4.3 所有真正动作都走 POST 或脚本

写操作包括：

- 手动隔离账号
- 手动释放账号
- 手动清 cooldown
- 触发 `accounts-sync`
- 触发 `health-probe`
- 触发 `synthetic-probe`
- 触发 `readiness-check`
- 进行 cutover
- 进行 rollback

---

## 5. 启动前准备

## 5.1 环境要求

- Windows
- Node.js 24+
- npm
- PowerShell

### 5.2 目录确认

仓库根目录：

`C:\Users\AWSA\Desktop\codex无线号池`

V2 目录：

`C:\Users\AWSA\Desktop\codex无线号池\v2`

### 5.3 关键配置文件

重点看这些：

- [v2/.env](C:/Users/AWSA/Desktop/codex无线号池/v2/.env)
- [config_team.yaml](C:/Users/AWSA/Desktop/codex无线号池/config_team.yaml)
- [proxy_config.json](C:/Users/AWSA/Desktop/codex无线号池/proxy_config.json)

### 5.4 建议必须配置的环境变量

至少确认这些变量的值：

- `V2_PORT`
- `V2_OPERATOR_API_KEYS`
- `V2_GATEWAY_CLIENT_API_KEYS`
- `V2_SYNTHETIC_CLIENT_API_KEYS`
- `V2_GATEWAY_UPSTREAM_API_KEY`
- `V2_PUBLIC_BASE_URL`
- `V2_SYNTHETIC_BASE_URL`
- `TEAM_POOL_HEALTHCHECK_API_KEY`

### 5.5 Key 的角色划分

不要混用：

- `operator key`
  - 只给 `/control/*` 和 `/ops`

- `client key`
  - 只给 `V2` 并行网关客户端

- `synthetic key`
  - 只给 synthetic probe

- `upstream key`
  - 只给 `V2 -> team_pool` 上游转发

原则：

- 这 4 类 key 必须逻辑隔离
- 任何重叠都属于高风险错误配置

---

## 6. 第一次初始化

第一次部署 V2，按下面顺序做。

### 6.1 初始化数据库

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run db:init
```

作用：

- 初始化 SQLite
- 应用 schema migration
- 准备控制面账本

### 6.2 同步账号注册表

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run accounts:sync
```

作用：

- 扫描 `auths_team/` 和 `auths_free/`
- 建立账号注册表
- 建立状态事件账本

### 6.3 执行健康探测

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run health:probe
```

作用：

- 探测 Team Pool
- 探测 Anthropic Proxy
- 探测 New API
- 探测 Tunnel/Public Probe
- 生成账号健康快照

### 6.4 启动 V2

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run start
```

默认地址通常是：

`http://127.0.0.1:18320`

如果你配置了 `V2_PORT`，就按配置端口为准。

---

## 7. 常用启动方式

## 7.1 启动 legacy 全链路

```powershell
C:\Users\AWSA\Desktop\codex无线号池\start_all.bat
```

它会按 cutover mode 判断是否顺带启动 V2。

如果当前 mode 是：

- `legacy`
  - 不会自动启动 V2

- `parallel / canary / primary`
  - 会尝试启动 V2

### 7.2 单独启动 V2

```powershell
C:\Users\AWSA\Desktop\codex无线号池\start_v2.bat
```

适合：

- 并行验证
- 单独排查 V2
- 不想重启整条 legacy 链路时

### 7.3 打开控制台

浏览器打开：

`http://127.0.0.1:<V2_PORT>/ops`

默认一般是：

`http://127.0.0.1:18320/ops`

---

## 8. /ops 控制台怎么用

## 8.1 登录方式

`/ops` 页面不会自动保存 key。

你需要输入：

- `Operator Key`
- 可选的 `Operator ID`

然后点击：

- `Refresh Control Plane Data`

### 8.2 页面里主要看什么

重点看这些区域：

- Summary Cards
  - 账号总数
  - 当前可路由账号数
  - 当前 overallReady
  - 当前 cutover mode

- Accounts
  - 静态状态
  - runtime 状态
  - effective 状态
  - 是否有人工 quarantine

- Services
  - 各服务健康探测状态

- Recent Routing Decisions
  - shadow scheduler 的决策记录

- Recent Events
  - 健康事件、状态事件、operator 动作

- Cutover Readiness
  - blockers
  - warnings
  - 当前 readiness 是否为 green

- Recent Synthetic Probes
  - OpenAI JSON
  - Anthropic JSON
  - streaming smoke

- Cutover Control
  - 当前 mode
  - rollback hint
  - 推荐下一步

---

## 9. 日常运维动作

## 9.1 刷新状态

在 `/ops` 页面点击：

- `Refresh Control Plane Data`

### 9.2 手动同步账号

页面按钮：

- `Run Accounts Sync`

或者命令行：

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run accounts:sync
```

适用场景：

- 新增了账号文件
- 替换了 token 文件
- 修改了 `auths_team/` 或 `auths_free/`

### 9.3 手动跑健康检查

页面按钮：

- `Run Health Probe`

或者命令行：

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run health:probe
```

### 9.4 手动跑 synthetic probe

页面按钮：

- `Run Synthetic Probe`

作用：

- 用 synthetic key 对 V2 自身并行网关做冒烟检查

### 9.5 手动跑 readiness

页面按钮：

- `Run Readiness Check`

作用：

- 给切流前判断做快照
- 看 blockers / warnings / evidence

---

## 10. 账号人工干预

在 `/ops` 页面里可以做 runtime 层干预。

### 10.1 可用动作

- `manual_quarantine`
- `manual_release`
- `clear_cooldown`
- `annotate_reason`

### 10.2 操作方式

1. 填 `Account UID`
2. 选动作
3. 填原因
4. 点 `Submit Runtime Action`

### 10.3 什么时候用

`manual_quarantine`

- 某个账号虽然没彻底坏，但你不想让它参与决策

`manual_release`

- 人工隔离过后，确认可以恢复

`clear_cooldown`

- 某号进入 cooldown，但你想跳过等待窗口

`annotate_reason`

- 给某个账号加说明备注

注意：

- 这些动作只作用于 runtime 层
- 不会直接改 `account_registry.current_status`

---

## 11. Cutover 的正确使用方法

## 11.1 最重要的原则

切换到 `parallel / canary / primary` 可以用普通 mode 切换。  
回到 `legacy`，优先用专用 rollback。

### 11.2 进入 parallel

脚本：

```powershell
C:\Users\AWSA\Desktop\codex无线号池\enter_parallel.ps1
```

或者：

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run cutover:mode -- --mode parallel --reason local_validation
```

适用场景：

- 开始启用 V2 做并行验证

### 11.3 进入 canary

脚本：

```powershell
C:\Users\AWSA\Desktop\codex无线号池\enter_canary.ps1
```

或者：

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run cutover:mode -- --mode canary --reason canary_validation
```

前提：

- readiness 必须为 green

如果 readiness 不通过：

- 控制面会拒绝
- 不会切 mode

### 11.4 进入 primary

脚本：

```powershell
C:\Users\AWSA\Desktop\codex无线号池\enter_primary.ps1
```

或者：

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run cutover:mode -- --mode primary --reason primary_promotion
```

前提：

- readiness 必须为 green
- 你已经完成 canary 验证

### 11.5 回滚到 legacy

最推荐：

```powershell
C:\Users\AWSA\Desktop\codex无线号池\rollback_legacy.ps1
```

或者在 `/ops`：

- 点击 `Rollback To Legacy`

注意：

- `/ops` 里的 rollback 现在是异步委派
- 它会返回 accepted
- 页面可能会断开连接
- 这是正常现象，因为 helper 会去停掉 V2 监听进程

---

## 12. 推荐的标准使用流程

## 12.1 日常正常运行

如果你不准备切 V2：

1. 保持 `legacy`
2. 用 [start_all.bat](C:/Users/AWSA/Desktop/codex无线号池/start_all.bat) 启动
3. `health_check.ps1` 正常巡检 legacy 链路

### 12.2 新一轮 V2 验证

建议顺序：

1. `npm run db:init`
2. `npm run accounts:sync`
3. `npm run health:probe`
4. `enter_parallel.ps1`
5. 打开 `/ops`
6. 跑 `Run Synthetic Probe`
7. 跑 `Run Readiness Check`
8. 看 blockers/warnings

### 12.3 canary 前演练

建议顺序：

1. 确认 `/control/readiness` 是 green
2. 确认 synthetic probe 成功
3. 确认 `availableForRouting > 0`
4. 确认 team pool 健康
5. 进入 `canary`
6. 做小范围验证

### 12.4 primary 前演练

建议顺序：

1. `canary` 已稳定
2. `/ops` 无新的 blocker
3. 没有持续健康告警
4. 你已经准备好随时 rollback
5. 再进入 `primary`

---

## 13. 上线前检查清单

切换前，请逐项确认。

### 13.1 配置检查

- `V2_PORT` 正确
- `V2_OPERATOR_API_KEYS` 正确
- `V2_GATEWAY_CLIENT_API_KEYS` 正确
- `V2_SYNTHETIC_CLIENT_API_KEYS` 正确
- `V2_GATEWAY_UPSTREAM_API_KEY` 正确
- `TEAM_POOL_HEALTHCHECK_API_KEY` 正确
- `V2_PUBLIC_BASE_URL` 正确
- `V2_SYNTHETIC_BASE_URL` 正确

### 13.2 状态检查

- `accounts:sync` 最近成功
- `health:probe` 最近成功
- synthetic probe 最近成功
- readiness 为 green
- `availableForRouting > 0`

### 13.3 回滚检查

- [rollback_legacy.ps1](C:/Users/AWSA/Desktop/codex无线号池/rollback_legacy.ps1) 可用
- 你知道当前 `V2_PORT`
- `legacy` 链路仍保留
- `start_all.bat`、`start_v2.bat`、`health_check.ps1` 读取的是同一个端口

---

## 14. 常用命令总表

### 14.1 V2 命令

```powershell
cd C:\Users\AWSA\Desktop\codex无线号池\v2
npm run db:init
npm run accounts:sync
npm run health:probe
npm run start
npm run cutover:mode -- --mode parallel --reason local_validation
npm run cutover:mode -- --mode canary --reason canary_validation
npm run cutover:mode -- --mode primary --reason primary_validation
npm run scheduler:shadow -- --protocol openai --model gpt-4.1
npm run scheduler:feedback -- --decision <decision-id> --outcome success
npm test
```

### 14.2 根目录脚本

```powershell
C:\Users\AWSA\Desktop\codex无线号池\start_all.bat
C:\Users\AWSA\Desktop\codex无线号池\start_v2.bat
C:\Users\AWSA\Desktop\codex无线号池\enter_parallel.ps1
C:\Users\AWSA\Desktop\codex无线号池\enter_canary.ps1
C:\Users\AWSA\Desktop\codex无线号池\enter_primary.ps1
C:\Users\AWSA\Desktop\codex无线号池\rollback_legacy.ps1
```

---

## 15. 常用接口总表

## 15.1 健康接口

- `GET /health`
- `GET /healthz`
- `GET /health/summary`
- `GET /health/services`
- `GET /health/accounts`

### 15.2 调度观察接口

- `GET /scheduler/preview?protocol=openai&model=gpt-4.1`
- `GET /runtime/accounts`

### 15.3 并行网关接口

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/messages`

### 15.4 控制面接口

- `GET /control/summary`
- `GET /control/accounts`
- `GET /control/accounts/:accountUid`
- `GET /control/services`
- `GET /control/readiness`
- `GET /control/synthetic`
- `GET /control/cutover`
- `GET /control/routing/decisions`
- `GET /control/events`

### 15.5 控制面写接口

- `POST /control/runtime/quarantine`
- `POST /control/runtime/release`
- `POST /control/runtime/clear-cooldown`
- `POST /control/runtime/annotate`
- `POST /control/jobs/accounts-sync`
- `POST /control/jobs/health-probe`
- `POST /control/jobs/synthetic-probe`
- `POST /control/jobs/readiness-check`
- `POST /control/cutover/mode`
- `POST /control/cutover/rollback`

---

## 16. 故障排查

## 16.1 `/ops` 打不开

先确认：

1. `V2` 是否启动
2. 端口是否正确
3. 当前是否在 `legacy rollback` 中

检查：

```powershell
Get-NetTCPConnection -LocalPort 18320 -State Listen
```

如果你改过 `V2_PORT`，把 `18320` 换成真实端口。

### 16.2 readiness 一直不过

先看：

- `/control/readiness`
- `/ops` 的 blockers

常见原因：

- 最近没有成功 `accounts:sync`
- 最近没有成功 `health:probe`
- synthetic probe 失败
- `availableForRouting = 0`
- team pool 不健康

### 16.3 账号都不可用

排查顺序：

1. `npm run accounts:sync`
2. `npm run health:probe`
3. 看 `/health/accounts`
4. 看 `/runtime/accounts`
5. 看是否有大量 `expired / unroutable / quarantined`

### 16.4 legacy rollback 后页面断开

这是正常现象。

因为：

- rollback helper 会停掉 V2 listener
- `/ops` 页面本来就依赖 V2

回滚后应该做的是：

1. 确认 legacy 链路仍活着
2. 必要时重新打开 legacy 相关入口

### 16.5 `health_check.ps1` 报 team auth 问题

先看：

- `TEAM_POOL_HEALTHCHECK_API_KEY`
- `config_team.yaml`

如果是 `AUTH_MISSING` 或 `401/403`：

- 先修 key
- 不要立刻把它当服务宕机

### 16.6 `V2` 反复重启

看这些：

- `v2/data/cutover-rollback.lock`
- `v2/data/health_v2_restart_state.json`
- `restart.log`
- `health.log`

如果正在 rollback：

- `health_check.ps1` 会抑制重启

---

## 17. 推荐实战顺序

如果你现在准备正式用这套东西，我建议你按下面节奏来：

### 第一步：日常先稳

- 先保持 `legacy`
- 先确认 legacy 全链路稳

### 第二步：并行观察

- 进入 `parallel`
- 打开 `/ops`
- 跑 sync、health、synthetic、readiness

### 第三步：小范围试探

- 进入 `canary`
- 做你自己的前门验证

### 第四步：主前门准备

- `canary` 稳定后再考虑 `primary`

### 第五步：任何异常立刻 rollback

- 优先用 [rollback_legacy.ps1](C:/Users/AWSA/Desktop/codex无线号池/rollback_legacy.ps1)
- 或 `/ops` 里的 `Rollback To Legacy`

---

## 18. 最后结论

现在这套 `V2` 的正确定位，不是“替换一切”，而是：

- 有控制面
- 有健康账本
- 有账号注册表
- 有并行网关
- 有 readiness/synthetic 验证
- 有受控 cutover
- 有可追踪 rollback

最稳的使用方式永远是：

1. 先 `parallel`
2. 再 `canary`
3. 再 `primary`
4. 异常立即 `rollback`

如果你后面继续扩展到真正的账号级 active routing、Cloudflare 自动切换、生产级统一前门，这份手册可以再继续升级成 `V2.1/V3` 运维手册。
