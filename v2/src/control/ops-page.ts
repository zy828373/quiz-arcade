export function renderOpsConsole(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>号池 V2 控制台</title>
  <style>
    :root { --bg:#f3f7f4; --sidebar:#fbfdfb; --panel:#ffffff; --panelSoft:#f7faf8; --border:#dbe7df; --borderStrong:#c8d8ce; --text:#142018; --muted:#5f6f65; --accent:#147a55; --accentSoft:#1f9a6d; --accentGhost:#e6f6ef; --navActive:#eef8f3; --ok:#16794f; --warn:#a86e16; --bad:#c2413b; --shadow:0 20px 48px rgba(20,32,24,0.08); --shadowSoft:0 10px 22px rgba(20,32,24,0.05); }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; font-family:"IBM Plex Sans","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; color:var(--text); background:linear-gradient(180deg,#f8fbf9 0%,#f3f7f4 48%,#eef5f0 100%); min-height:100vh; padding:20px; }
    .appShell { max-width:1600px; margin:0 auto; display:grid; gap:18px; grid-template-columns:220px minmax(0,1fr); align-items:start; }
    .sidebar,.hero,.panel { background:var(--panel); border:1px solid var(--border); border-radius:22px; box-shadow:var(--shadow); }
    .sidebar { position:sticky; top:20px; padding:18px; display:grid; gap:16px; min-height:calc(100vh - 40px); background:linear-gradient(180deg,var(--sidebar) 0%,#f4faf6 100%); }
    .workspace { display:grid; gap:18px; min-width:0; }
    .hero { padding:22px; display:grid; gap:16px; }
    .panel { padding:20px; overflow:hidden; box-shadow:var(--shadowSoft); }
    .brandStack,.navGroup,.sidebarSection,.heroHeader,.heroGrid,.guideGrid,.summaryStrip,.grid,.listGrid,.detailsShell,.trafficStats { display:grid; gap:14px; }
    .heroHeader { grid-template-columns:minmax(0,1.3fr) minmax(320px,0.7fr); align-items:start; }
    .heroGrid { grid-template-columns:minmax(0,1.15fr) minmax(320px,0.85fr); align-items:start; }
    .guideGrid { grid-template-columns:1fr; }
    .summaryStrip { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); }
    .trafficStats { grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); }
    .grid { grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); }
    .listGrid { grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); }
    .eyebrow { display:inline-flex; align-items:center; gap:8px; margin:0; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); font-weight:700; }
    .hero h1,.sidebar h1 { margin:0; line-height:1.04; letter-spacing:-0.04em; }
    .hero h1 { font-size:clamp(34px,5vw,54px); }
    .sidebar h1 { font-size:32px; }
    .hero p,.muted { margin:0; color:var(--muted); }
    .sidebarIntro { line-height:1.72; color:var(--muted); font-size:14px; }
    .navSectionTitle { margin:0 0 4px; color:var(--muted); font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
    .navList { display:grid; gap:8px; }
    .navItem { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); padding:10px 12px; border-radius:14px; border:1px solid transparent; background:transparent; transition:all .18s ease; }
    .navItem:hover { background:var(--navActive); border-color:var(--border); }
    .navItem.active { background:var(--navActive); border-color:var(--borderStrong); }
    .navMarker { width:10px; height:10px; border-radius:999px; background:linear-gradient(135deg,var(--accent),var(--accentSoft)); box-shadow:0 0 0 4px rgba(20,122,85,0.12); }
    .sidebarNote,.authCard,.guideCard,.notice,.stat,.trafficShell { border:1px solid var(--border); border-radius:18px; background:var(--panelSoft); }
    .sidebarNote,.guideCard,.notice,.authCard,.trafficShell { padding:16px; }
    .sidebarNote { display:grid; gap:10px; }
    .sidebarNote strong,.notice strong { font-size:16px; }
    .sidebarFooter { margin-top:auto; padding-top:6px; border-top:1px solid var(--border); color:var(--muted); font-size:12px; line-height:1.7; }
    .sectionHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:14px; }
    .sectionHeader h2,.panel h2,.guideCard h2 { margin:0; font-size:20px; letter-spacing:-0.02em; }
    .sectionMeta { color:var(--muted); font-size:12px; line-height:1.7; }
    .authCard { display:grid; gap:14px; background:linear-gradient(180deg,#ffffff 0%,#f8fbf9 100%); }
    .guideCard { display:grid; gap:10px; }
    .stat { padding:16px 18px; background:linear-gradient(180deg,#ffffff 0%,#f8fbf9 100%); min-height:118px; }
    .stat strong { display:block; margin-top:10px; font-size:28px; line-height:1.12; letter-spacing:-0.04em; }
    .stat.compact strong { font-size:24px; line-height:1.18; }
    .stat.url strong { font-size:20px; line-height:1.35; letter-spacing:-0.02em; overflow-wrap:anywhere; word-break:break-word; }
    .trafficShell { display:grid; gap:14px; background:linear-gradient(180deg,#ffffff 0%,#f8fbf9 100%); }
    .trafficHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
    .trafficHeader h2 { margin:0; font-size:20px; letter-spacing:-0.02em; }
    .trafficSubtle { color:var(--muted); font-size:13px; line-height:1.7; }
    .notice { display:grid; gap:8px; }
    .notice.ok { background:rgba(22,121,79,0.08); border-color:rgba(22,121,79,0.2); }
    .notice.warn { background:rgba(168,110,22,0.08); border-color:rgba(168,110,22,0.18); }
    .notice.bad { background:rgba(194,65,59,0.08); border-color:rgba(194,65,59,0.18); }
    .status-line { min-height:22px; padding:12px 14px; border-radius:16px; background:#f8fbf9; border:1px solid var(--border); color:var(--muted); font-size:13px; }
    .stepList,.issueList { margin:0; padding-left:18px; line-height:1.8; font-size:14px; }
    .sectionTip,.tableCaption { color:var(--muted); font-size:13px; }
    .sectionTip { margin:0; line-height:1.75; }
    .tableCaption { margin:14px 0 8px; font-weight:600; }
    .actions { display:flex; flex-wrap:wrap; gap:12px; align-items:flex-start; }
    .actions > label { flex:1 1 240px; }
    label { display:grid; gap:6px; font-size:13px; color:var(--muted); }
    input,textarea,select,button { font:inherit; border-radius:14px; border:1px solid var(--borderStrong); padding:12px 14px; background:#ffffff; color:var(--text); }
    textarea { min-height:84px; resize:vertical; }
    input:focus,textarea:focus,select:focus { outline:none; border-color:rgba(20,122,85,0.5); box-shadow:0 0 0 4px rgba(20,122,85,0.1); }
    button { cursor:pointer; border:none; color:white; background:linear-gradient(135deg,var(--accent),var(--accentSoft)); box-shadow:0 10px 20px rgba(20,122,85,0.18); font-weight:600; }
    button.secondary { background:#eef4f0; color:var(--text); box-shadow:none; }
    button.danger { background:linear-gradient(135deg,#9e2b27,#cb524c); box-shadow:0 10px 20px rgba(158,43,39,0.16); }
    button:disabled { opacity:0.45; cursor:not-allowed; box-shadow:none; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { text-align:left; padding:12px 8px; border-bottom:1px solid #edf3ee; vertical-align:top; word-break:break-word; }
    th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; }
    details.panel { padding:0; overflow:hidden; }
    details.panel > summary { cursor:pointer; list-style:none; padding:20px; font-weight:700; }
    details.panel > summary::-webkit-details-marker { display:none; }
    details.panel > summary::after { content:'展开'; float:right; color:var(--muted); font-weight:500; }
    details.panel[open] > summary::after { content:'收起'; }
    .detailsBody { padding:0 20px 20px; display:grid; gap:18px; }
    .badge { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; background:rgba(0,0,0,0.05); }
    .badge.ready,.badge.healthy,.badge.passed,.badge.primary { color:var(--ok); background:rgba(45,106,79,0.12); }
    .badge.degraded,.badge.cooldown,.badge.canary,.badge.parallel { color:var(--warn); background:rgba(183,121,31,0.14); }
    .badge.quarantined,.badge.unhealthy,.badge.unroutable,.badge.failed,.badge.blocked,.badge.legacy { color:var(--bad); background:rgba(184,50,39,0.12); }
    pre { margin:0; font-size:12px; line-height:1.6; white-space:pre-wrap; background:#f8fbf9; border-radius:16px; padding:14px; border:1px solid var(--border); max-height:320px; overflow:auto; }
    code { font-family:Consolas,"SFMono-Regular",monospace; font-size:0.95em; background:#eef4f0; padding:2px 6px; border-radius:8px; }
    .pill { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid var(--borderStrong); background:var(--accentGhost); color:var(--accent); font-size:12px; font-weight:700; }
    .headerMeta { display:flex; flex-wrap:wrap; gap:10px; }
    .subtleBlurb { color:var(--muted); font-size:13px; line-height:1.7; margin-top:4px; }
    .inlineLink { color:var(--accent); text-decoration:none; font-weight:600; }
    .inlineLink:hover { text-decoration:underline; }
    @media (max-width:1220px) { .appShell { grid-template-columns:1fr; } .sidebar { position:static; min-height:auto; } .heroHeader,.heroGrid,.guideGrid { grid-template-columns:1fr; } }
    @media (max-width:980px) { body { padding:16px; } .summaryStrip,.grid,.listGrid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="appShell">
    <aside class="sidebar">
      <div class="brandStack">
        <p class="eyebrow">Supabase + Vercel 风格控制层</p>
        <h1>号池 V2</h1>
        <p class="sidebarIntro">这里是你现在唯一需要常看的控制台。底层 Team Pool 继续负责出结果，但日常判断、启停、体检和状态确认都尽量从这里完成。</p>
        <div class="headerMeta">
          <span class="pill">本机自用优先</span>
          <span class="pill">统一入口 18320</span>
        </div>
      </div>

      <div class="navGroup">
        <p class="navSectionTitle">主工作区</p>
        <nav class="navList">
          <a class="navItem active" href="#platformHub"><span class="navMarker"></span><span>总览与登录</span></a>
          <a class="navItem" href="#localWorkbench"><span class="navMarker"></span><span>本机自用工作台</span></a>
          <a class="navItem" href="#trafficOverviewPanel"><span class="navMarker"></span><span>最近调用概览</span></a>
          <a class="navItem" href="#syntheticHealth"><span class="navMarker"></span><span>状态与体检</span></a>
          <a class="navItem" href="#accountHealth"><span class="navMarker"></span><span>账号状态</span></a>
          <a class="navItem" href="#advancedOps"><span class="navMarker"></span><span>高级操作</span></a>
        </nav>
      </div>

      <div class="sidebarFooter">
        管理密钥只保存在当前页面内存里。刷新、关闭页面或重开浏览器后，需要重新输入一次。
      </div>
    </aside>

    <main class="workspace">
      <section class="hero" id="platformHub">
        <div class="heroHeader">
          <div>
            <p class="eyebrow">单平台控制台 / 本机自用模式</p>
            <h1>号池 V2 控制台</h1>
            <p>这一页负责把“状态判断、体检、工作台、入口说明”收在一起。你不需要先理解所有后台细节，先看建议、再按工作台操作就够了。</p>
          </div>
          <div class="notice warn" id="guidancePanel">
            <strong>先输入管理密钥并点击“刷新控制台数据”。</strong>
            <div class="muted">如果你不知道下一步该点什么，这里会根据当前状态自动给建议。</div>
          </div>
        </div>

        <div class="heroGrid">
          <section class="authCard">
            <div class="sectionHeader">
              <div>
                <p class="eyebrow">Operator Access</p>
                <h2>登录当前控制台</h2>
              </div>
              <div class="sectionMeta">登录后才会读取本机 <code>/control/*</code> 数据。</div>
            </div>
            <label>管理密钥（Operator Key）
              <input id="operatorKey" type="password" autocomplete="off" placeholder="请输入管理密钥">
            </label>
            <label>操作人标识（可选）
              <input id="operatorId" type="text" autocomplete="off" placeholder="例如 local-admin">
            </label>
            <div class="actions">
              <button id="refreshButton" type="button">刷新控制台数据</button>
              <button id="clearButton" class="secondary" type="button">清空当前页面内存密钥</button>
            </div>
          </section>

          <div class="guideGrid">
            <section class="guideCard">
              <h2>现在怎么用这页</h2>
              <ol class="stepList">
                <li>先看顶部总览，重点只盯 <code>本机使用状态</code>、<code>最近 completion 体检</code>、<code>可路由账号</code>。</li>
                <li>如果不能直接使用，优先点一次 <code>一键准备本机环境</code>，不要先钻到底层 JSON。</li>
                <li>只有明确知道要处理账号、切流或回退时，才展开下面的高级操作区。</li>
              </ol>
              <p class="subtleBlurb">这页的目标不是展示所有细节，而是先告诉你“现在能不能用”和“下一步该点哪里”。</p>
            </section>
          </div>
        </div>

        <div class="status-line" id="statusLine">请先输入管理密钥，然后点击“刷新控制台数据”。</div>
        <div class="summaryStrip" id="summaryCards"></div>
      </section>

      <section class="panel" id="trafficOverviewPanel">
        <div class="trafficHeader">
          <div>
            <p class="eyebrow">Gateway Activity</p>
            <h2>最近调用概览</h2>
          </div>
          <div class="trafficSubtle">这里只看入口层最近的轻量记录，不重复做 CPAMC 那套详细统计。要看 Token、RPM、TPM 和完整曲线，继续去 <a class="inlineLink" href="http://localhost:8317" target="_blank" rel="noreferrer">CPAMC 使用统计</a>。</div>
        </div>
        <div id="trafficOverview"></div>
      </section>

      <section class="panel" id="localWorkbench">
        <div class="sectionHeader">
          <div>
            <p class="eyebrow">Local Only Workspace</p>
            <h2>本机自用工作台</h2>
          </div>
          <div class="sectionMeta">把它当成你每天最常点的地方。日常只看这里、本机入口、最近链路体检和账号状态；旧 Anthropic Proxy、New API、Cloudflare Tunnel 都退到后台，不再是本机自用前提。</div>
        </div>
        <div class="actions">
          <button id="ensureTeamPool" class="secondary" type="button">确保底层引擎已启动</button>
          <button id="restartTeamPool" type="button">重新拉起底层引擎</button>
          <button id="stopTeamPool" class="secondary" type="button">停止底层引擎</button>
          <button id="runLocalRefresh" type="button">一键准备本机环境</button>
        </div>
        <div id="platformTable"></div>
      </section>

      <div class="grid">
        <section class="panel" id="syntheticHealth">
          <div class="sectionHeader">
            <div>
              <p class="eyebrow">Synthetic Checks</p>
              <h2>最近链路体检</h2>
            </div>
            <div class="sectionMeta">这里看 OpenAI、Anthropic、流式最近一轮是否都通过。只要一项掉红，本机入口就不算稳。</div>
          </div>
          <div id="syntheticTable"></div>
        </section>

        <section class="panel" id="serviceHealth">
          <div class="sectionHeader">
            <div>
              <p class="eyebrow">Service Health</p>
              <h2>服务状态（本机重点）</h2>
            </div>
            <div class="sectionMeta">本机自用模式下，只优先盯你真正依赖的服务。旧公网组件如果被隐藏，不代表删除，只是先从主界面降噪。</div>
          </div>
          <div id="servicesTable"></div>
        </section>
      </div>

      <div class="grid">
        <section class="panel" id="accountHealth">
          <div class="sectionHeader">
            <div>
              <p class="eyebrow">Accounts</p>
              <h2>账号状态</h2>
            </div>
            <div class="sectionMeta">这里主要看可路由账号是否还在、哪些账号 ready、哪些账号掉进 cooldown 或 quarantined。</div>
          </div>
          <div id="accountsTable"></div>
        </section>

        <section class="panel" id="readinessHub">
          <div class="sectionHeader">
            <div>
              <p class="eyebrow">Readiness Gate</p>
              <h2>切流就绪度（高级判断）</h2>
            </div>
            <div class="sectionMeta">本机自用时不需要天天盯这个，但只要这里有 blocker，就别继续往前切或对外承诺稳定可用。</div>
          </div>
          <div id="readinessTable"></div>
        </section>
      </div>

      <div class="detailsShell" id="advancedOps">
      <details class="panel">
        <summary>高级：人工动作与单项巡检</summary>
        <div class="detailsBody">
          <div>
            <p class="sectionTip">只有当你明确知道要处理哪个账号时，才使用这里。普通本机自用场景，优先点上面的“一键准备本机环境”。</p>
            <div class="actions">
              <label>账号 UID
                <input id="accountUid" type="text" placeholder="例如 acct_xxx">
              </label>
              <label>动作类型
                <select id="runtimeAction">
                  <option value="manual_quarantine">人工隔离账号</option>
                  <option value="manual_release">解除人工隔离</option>
                  <option value="clear_cooldown">清除冷却状态</option>
                  <option value="annotate_reason">仅添加备注</option>
                </select>
              </label>
            </div>
            <div class="actions">
              <label>原因 / 备注
                <textarea id="runtimeReason" placeholder="请写清楚为什么要做这个动作"></textarea>
              </label>
            </div>
            <div class="actions">
              <button id="applyRuntimeAction" type="button">提交人工动作</button>
              <button id="runAccountsSync" class="secondary" type="button">重新同步账号</button>
              <button id="runHealthProbe" class="secondary" type="button">运行健康巡检</button>
              <button id="runSyntheticProbe" class="secondary" type="button">运行链路体检</button>
              <button id="runReadinessCheck" class="secondary" type="button">重新计算切流就绪度</button>
            </div>
          </div>
        </div>
      </details>

      <details class="panel">
        <summary>高级：切流控制与回退</summary>
        <div class="detailsBody">
          <div>
            <p class="sectionTip">这块更多是保留给完整切流/回滚场景。你现在是本机自用模式，平时不需要反复点这里，除非你真的在演练 parallel / canary / primary。</p>
            <div class="actions">
              <button id="setCutoverLegacy" class="danger" type="button">切回旧链路</button>
              <button id="setCutoverParallel" class="secondary" type="button">进入并行观察</button>
              <button id="setCutoverCanary" type="button">进入灰度阶段</button>
              <button id="setCutoverPrimary" type="button">进入主用阶段</button>
            </div>
            <div id="cutoverTable"></div>
          </div>
        </div>
      </details>

      <details class="panel">
        <summary>高级：调度、事件与原始数据</summary>
        <div class="detailsBody">
          <div class="grid">
            <section class="panel"><h2>最近调度决策</h2><div id="decisionsTable"></div></section>
            <section class="panel"><h2>最近事件</h2><div id="eventsTable"></div></section>
          </div>
          <div class="listGrid">
            <section class="panel"><h2>原始汇总数据（高级）</h2><pre id="summaryJson">{}</pre></section>
            <section class="panel"><h2>账号详情 JSON（高级）</h2><pre id="accountJson">{}</pre></section>
          </div>
        </div>
      </details>
      </div>
    </main>
  </div>

  <script>
    const AUTO_REFRESH_ACTIVE_MS = 5 * 60 * 1000;
    const AUTO_REFRESH_SLEEP_MS = 60 * 1000;
    const AUTO_REFRESH_IDLE_LIMIT = 3;
    const state = {
      monitor: { idleChecks: 0, lastExternalAttemptAt: null, mode: 'sleep', nextCheckAt: null, timerId: null },
      operatorId: '',
      operatorKey: '',
      selectedAccountUid: null,
    };
    const valueLabelMap = { active:'有效', applied:'已应用', blocked:'阻塞', canary:'灰度', cooldown:'冷却中', degraded:'降级', drifted:'已漂移', expired:'已过期', failed:'失败', healthy:'健康', in_sync:'已同步', legacy:'旧链路', parallel:'并行', passed:'通过', primary:'主用', quarantined:'已隔离', ready:'就绪', rejected:'已拒绝', unhealthy:'异常', unroutable:'不可路由' };
    const actionLabelMap = { annotate_reason:'仅添加备注', clear_cooldown:'清除冷却状态', manual_quarantine:'人工隔离账号', manual_release:'解除人工隔离' };
    const issueCodeLabelMap = { accounts_sync_failed:'账号同步失败', accounts_sync_missing:'还没有账号同步结果', accounts_sync_stale:'账号同步结果已过期', anthropic_proxy_not_healthy:'Anthropic 代理不健康', database_not_ready:'数据库未就绪', gateway_config_invalid:'网关配置校验失败', health_probe_failed:'健康巡检失败', health_probe_missing:'还没有健康巡检结果', health_probe_stale:'健康巡检结果已过期', inbound_client_keys_missing:'没有配置客户端访问密钥', new_api_not_healthy:'New API 不健康', runtime_unavailable:'当前没有可路由账号', schema_version_outdated:'数据库版本过旧', synthetic_anthropic_failed:'Anthropic 链路体检失败', synthetic_base_url_missing:'链路体检地址未配置', synthetic_key_missing:'链路体检密钥未配置', synthetic_openai_failed:'OpenAI 链路体检失败', synthetic_probe_missing:'还没有链路体检结果', synthetic_probe_stale:'链路体检结果已过期', synthetic_stream_failed:'OpenAI 流式链路体检失败', team_pool_unhealthy:'Team Pool 不健康', tunnel_public_not_healthy:'Tunnel 外部连通性不健康' };
    const issueMessageMap = { accounts_sync_failed:'最近一次账号同步失败，请先重新同步账号。', accounts_sync_missing:'还没有账号同步记录，请先点击“重新同步账号”。', accounts_sync_stale:'最近一次账号同步已经超过 24 小时，请重新同步账号。', anthropic_proxy_not_healthy:'Anthropic 代理最近一次健康检查未通过。', database_not_ready:'SQLite 控制面尚未完成初始化。', gateway_config_invalid:'网关密钥隔离或运行配置未通过校验。', health_probe_failed:'最近一次健康巡检没有成功完成。', health_probe_missing:'还没有健康巡检结果，请先点击“运行健康巡检”。', health_probe_stale:'最近一次健康巡检已经超过 30 分钟，请重新执行。', inbound_client_keys_missing:'当前没有配置客户端访问密钥。', new_api_not_healthy:'New API 最近一次健康检查未通过。', runtime_unavailable:'当前没有任何账号可用于路由。', schema_version_outdated:'数据库迁移没有完全应用，请先检查版本。', synthetic_anthropic_failed:'Anthropic 路径最近一次链路体检没有通过。', synthetic_base_url_missing:'当前没有可用的链路体检地址。', synthetic_key_missing:'没有配置链路体检专用密钥。', synthetic_openai_failed:'OpenAI 路径最近一次链路体检没有通过。', synthetic_probe_missing:'还没有链路体检结果，请先点击“运行链路体检”。', synthetic_probe_stale:'最近一次链路体检已经超过 30 分钟，请重新执行。', synthetic_stream_failed:'OpenAI 流式链路最近一次体检没有通过。', team_pool_unhealthy:'Team Pool 最近一次健康检查未通过。', tunnel_public_not_healthy:'外部 Tunnel 最近一次健康检查未通过。' };

    const statusLine = document.getElementById('statusLine');
    const operatorKeyInput = document.getElementById('operatorKey');
    const operatorIdInput = document.getElementById('operatorId');
    const accountUidInput = document.getElementById('accountUid');
    const runtimeReasonInput = document.getElementById('runtimeReason');
    const runtimeActionInput = document.getElementById('runtimeAction');
    const summaryCards = document.getElementById('summaryCards');
    const guidancePanel = document.getElementById('guidancePanel');
    const trafficOverview = document.getElementById('trafficOverview');
    const platformTable = document.getElementById('platformTable');
    const accountsTable = document.getElementById('accountsTable');
    const servicesTable = document.getElementById('servicesTable');
    const decisionsTable = document.getElementById('decisionsTable');
    const eventsTable = document.getElementById('eventsTable');
    const cutoverTable = document.getElementById('cutoverTable');
    const readinessTable = document.getElementById('readinessTable');
    const syntheticTable = document.getElementById('syntheticTable');
    const summaryJson = document.getElementById('summaryJson');
    const accountJson = document.getElementById('accountJson');
    const setCutoverParallelButton = document.getElementById('setCutoverParallel');
    const setCutoverCanaryButton = document.getElementById('setCutoverCanary');
    const setCutoverPrimaryButton = document.getElementById('setCutoverPrimary');

    function clearMonitorTimer() {
      if (state.monitor.timerId !== null) {
        clearTimeout(state.monitor.timerId);
        state.monitor.timerId = null;
      }
    }
    function formatMonitorTime(value) {
      if (!value) return '未安排';
      try {
        return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      } catch {
        return normalizeDisplayValue(value);
      }
    }
    function scheduleMonitorTick(delayMs) {
      clearMonitorTimer();
      state.monitor.nextCheckAt = new Date(Date.now() + delayMs).toISOString();
      state.monitor.timerId = setTimeout(function () { void runMonitorTick(); }, delayMs);
    }
    function resolveMonitorLabel() {
      if (state.monitor.mode === 'active') {
        return '活跃巡检中：每 5 分钟自动刷新一次，连续 3 次无请求后休眠';
      }
      return '休眠监测中：仅做轻量心跳，发现新请求后自动切到活跃巡检';
    }
    function describeTrafficError(code) {
      if (!code) return '无明显错误';
      if (code === 'upstream_http_error') return '上游 HTTP 错误';
      if (code === 'internal_error') return '网关内部错误';
      if (code === 'invalid_api_key') return '鉴权失败';
      if (code === 'upstream_timeout') return '上游超时';
      if (code.startsWith('http_')) return 'HTTP ' + code.slice('http_'.length);
      return code;
    }

    function setStatus(text) { statusLine.textContent = String(text || ''); }
    function normalizeDisplayValue(value) { return value === null || value === undefined || value === '' ? '-' : String(value); }
    function displayLabel(value) { const normalized = normalizeDisplayValue(value); const lower = normalized.toLowerCase(); return valueLabelMap[lower] || normalized; }
    function displayActionLabel(action) { return actionLabelMap[action] || normalizeDisplayValue(action); }
    function sanitizeBadgeVariant(value) { const variant = normalizeDisplayValue(value).toLowerCase().replace(/[^a-z0-9_-]/g, ''); return variant || 'unknown'; }
    function getIssueTitle(entry) { return issueCodeLabelMap[entry.code] || normalizeDisplayValue(entry.code); }
    function getIssueDescription(entry) { return issueMessageMap[entry.code] || normalizeDisplayValue(entry.message); }
    function clearChildren(element) { element.replaceChildren(); return element; }
    function createTextElement(tagName, value, className) { const element = document.createElement(tagName); if (className) element.className = className; element.textContent = normalizeDisplayValue(value); return element; }
    function createBadge(value) { const badge = document.createElement('span'); badge.className = 'badge ' + sanitizeBadgeVariant(value); badge.textContent = displayLabel(value); return badge; }
    function appendTextCell(row, value, className) { const cell = document.createElement('td'); if (className) cell.className = className; cell.textContent = normalizeDisplayValue(value); row.appendChild(cell); return cell; }
    function appendBadgeCell(row, value) { const cell = document.createElement('td'); cell.appendChild(createBadge(value)); row.appendChild(cell); return cell; }
    function createTable(headers) { const table = document.createElement('table'); const thead = document.createElement('thead'); const headRow = document.createElement('tr'); headers.forEach(function (header) { headRow.appendChild(createTextElement('th', header)); }); thead.appendChild(headRow); table.appendChild(thead); const tbody = document.createElement('tbody'); table.appendChild(tbody); return { table: table, tbody: tbody }; }
    function createOperatorHeaders() { const typedOperatorKey = operatorKeyInput.value.trim(); const typedOperatorId = operatorIdInput.value.trim(); if (typedOperatorKey) state.operatorKey = typedOperatorKey; state.operatorId = typedOperatorId; if (!state.operatorKey) throw new Error('请先输入管理密钥。'); const headers = { 'Content-Type': 'application/json', 'x-operator-key': state.operatorKey }; if (state.operatorId) headers['x-operator-id'] = state.operatorId; return headers; }
    async function fetchJson(path, options) { const requestOptions = options || {}; const response = await fetch(path, { ...requestOptions, headers: { ...(requestOptions.headers || {}) } }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error && payload.error.message ? payload.error.message : '请求失败：' + response.status); return payload; }
    function buildLocalizedCutoverRecommendation(payload) { const current = payload && payload.readinessGate && payload.readinessGate.current ? payload.readinessGate.current : { blockers: [], ready: false }; const mode = payload && payload.currentMode ? payload.currentMode : 'legacy'; const blockers = Array.isArray(current.blockers) ? current.blockers : []; if (!current.ready) { return blockers.length === 0 ? '当前门禁未通过，请先查看“切流就绪度”。' : '当前存在 ' + blockers.length + ' 个阻塞项，先清掉阻塞项，不要继续切流。'; } if (mode === 'legacy') return '当前仍在旧链路模式。如果要启用 V2，建议先进入并行观察。'; if (mode === 'parallel') return '当前已经通过门禁，可以考虑进入灰度阶段。'; if (mode === 'canary') return '当前处于灰度阶段。如果继续稳定，可以推进到主用阶段。'; if (mode === 'primary') return '当前已经处于主用阶段。对本机自用来说，这表示 V2 已经是当前主状态。'; return '暂无建议。'; }
    function buildLocalizedRollbackHint(payload) { const mode = payload && payload.currentMode ? payload.currentMode : 'legacy'; return mode === 'legacy' ? '当前已经在旧链路模式，不需要再回滚。' : '如果出现异常，优先点击“切回旧链路”，或运行 rollback_legacy.ps1。'; }
    function describeCompletionCheck(platform) {
      if (!platform || !platform.teamPool) return '未知';
      if (platform.teamPool.completionProbeHealthy === true) return '最近一轮 completion 体检已通过';
      if (platform.teamPool.completionProbeHealthy === false) return '最近一轮 completion 体检失败';
      return '还没有最近一轮 completion 体检结果';
    }
    function renderGuidance(summary, platform, readiness, cutover, synthetic) {
      clearChildren(guidancePanel);
      const localUse = platform && platform.localUse ? platform.localUse : { blockers: [], ready: false };
      const current = readiness && readiness.current ? readiness.current : { blockers: [], ready: false };
      const blockers = Array.isArray(current.blockers) ? current.blockers : [];
      const currentMode = cutover && cutover.currentMode ? cutover.currentMode : 'legacy';
      const latestSynthetic = synthetic && synthetic.latestRun ? synthetic.latestRun : null;
      let tone = 'warn';
      let title = '先输入管理密钥并刷新';
      let description = '拿到当前状态后，系统才知道下一步应该做什么。';
      let tips = ['刷新或关闭页面后，需要重新输入一次管理密钥。'];
      if (state.operatorKey && summary) {
        if (!localUse.ready) {
          tone = 'bad';
          title = '当前还不适合直接本机使用';
          description = '先处理本机阻塞项，再让客户端继续走 V2 统一入口。';
          tips = Array.isArray(localUse.blockers) && localUse.blockers.length > 0
            ? localUse.blockers
            : blockers.map(function (entry) { return getIssueTitle(entry) + '：' + getIssueDescription(entry); });
          if (tips.length === 0) tips = ['当前本机使用状态还没通过，请先点“一键准备本机环境”。'];
        } else if (currentMode === 'legacy') {
          tone = 'warn';
          title = 'V2 本机入口可用，但当前仍保留旧链路阶段';
          description = '如果你只是本机自用，直接看本机入口和链路体检即可；只有在完整切流演练时才需要继续推进阶段。';
          tips = ['本机统一入口：' + normalizeDisplayValue(platform && platform.primaryEntry ? platform.primaryEntry.baseUrl : null), describeCompletionCheck(platform)];
        } else if (currentMode === 'parallel') {
          tone = 'ok';
          title = '当前适合直接本机使用';
          description = '本机请求可以继续走 V2，平时重点看本机入口、链路体检和可路由账号数量。';
          tips = ['如果今天第一次开机，优先点“一键准备本机环境”。', describeCompletionCheck(platform)];
        } else if (currentMode === 'canary') {
          tone = 'ok';
          title = '当前处于灰度阶段，但本机已经可直接使用';
          description = '对本机自用来说，现在重点是稳定观察，不需要反复切来切去。';
          tips = ['如果你不做完整切流演练，就把它当成本机统一入口来用。', describeCompletionCheck(platform)];
        } else if (currentMode === 'primary') {
          tone = 'ok';
          title = '当前已经进入主用阶段，可直接本机使用';
          description = '现在主要看统一入口能不能稳定出结果，不需要再把注意力放在旧外部链路上。';
          tips = ['直接把你的客户端指向 ' + normalizeDisplayValue(platform && platform.primaryEntry ? platform.primaryEntry.baseUrl : null) + '。', latestSynthetic && latestSynthetic.success ? '最近一轮链路体检已经通过。' : '建议补跑一轮链路体检确认状态。', describeCompletionCheck(platform)];
        }
      }
      guidancePanel.className = 'notice ' + tone;
      guidancePanel.appendChild(createTextElement('strong', title));
      guidancePanel.appendChild(createTextElement('div', description, 'muted'));
      const list = document.createElement('ul');
      list.className = 'issueList';
      tips.forEach(function (tip) { const item = document.createElement('li'); item.textContent = tip; list.appendChild(item); });
      guidancePanel.appendChild(list);
    }
    function updateCutoverButtons(cutover, readiness) { const currentMode = cutover && cutover.currentMode ? cutover.currentMode : 'legacy'; const ready = readiness && readiness.current ? Boolean(readiness.current.ready) : false; setCutoverParallelButton.disabled = currentMode === 'parallel'; setCutoverCanaryButton.disabled = !ready || currentMode === 'canary' || currentMode === 'primary'; setCutoverPrimaryButton.disabled = !ready || currentMode === 'primary'; }
    function renderSummaryCards(summary, platform) {
      const cutover = summary.currentCutover || {};
      const localUse = platform && platform.localUse ? platform.localUse : { ready: false, status: 'attention' };
      const cards = [
        { label: '本机使用状态', value: localUse.ready ? '可直接使用' : '需要处理', kind: 'default' },
        { label: '统一入口', value: platform && platform.primaryEntry ? platform.primaryEntry.baseUrl : '-', kind: 'url' },
        { label: '底层引擎', value: displayLabel(platform && platform.teamPool ? platform.teamPool.status : 'attention'), kind: 'compact' },
        { label: '最近 completion 体检', value: describeCompletionCheck(platform), kind: 'compact' },
        { label: '可路由账号', value: summary.runtimeAvailability && summary.runtimeAvailability.availableForRouting !== undefined ? summary.runtimeAvailability.availableForRouting : 0, kind: 'default' },
        { label: '当前阶段', value: displayLabel(cutover.currentMode || 'legacy'), kind: 'default' },
      ];
      clearChildren(summaryCards);
      cards.forEach(function (entry) {
        const card = document.createElement('div');
        card.className = 'stat';
        if (entry.kind === 'compact') card.className += ' compact';
        if (entry.kind === 'url') card.className += ' compact url';
        card.appendChild(createTextElement('div', entry.label, 'muted'));
        card.appendChild(createTextElement('strong', entry.value));
        summaryCards.appendChild(card);
      });
    }
    function renderTrafficOverview(activity) {
      clearChildren(trafficOverview);
      const payload = activity || {
        hasRecentExternalActivity: false,
        latestExternalAttemptAt: null,
        protocolCounts: { anthropic: 0, openai: 0 },
        recentEntries: [],
        topErrors: [],
        totals: { external: 0, failed: 0, successful: 0 },
      };

      const topErrorSummary = Array.isArray(payload.topErrors) && payload.topErrors.length > 0
        ? payload.topErrors.map(function (entry) {
            return describeTrafficError(entry.code) + ' × ' + entry.count;
          }).join('，')
        : '最近没有明显错误';

      const monitorNotice = document.createElement('div');
      monitorNotice.className = 'notice ' + (state.monitor.mode === 'active' ? 'ok' : 'warn');
      monitorNotice.appendChild(createTextElement('strong', '自动刷新状态：' + resolveMonitorLabel()));
      monitorNotice.appendChild(
        createTextElement(
          'div',
          '下次检测：' + formatMonitorTime(state.monitor.nextCheckAt) + '；最近外部调用：' + normalizeDisplayValue(payload.latestExternalAttemptAt),
          'muted',
        ),
      );
      trafficOverview.appendChild(monitorNotice);

      const statsShell = document.createElement('div');
      statsShell.className = 'trafficStats';
      [
        ['最近 10 分钟外部请求', payload.totals && payload.totals.external !== undefined ? payload.totals.external : 0],
        ['最近一次外部调用', payload.latestExternalAttemptAt || '暂无'],
        ['协议分布', 'OpenAI ' + normalizeDisplayValue(payload.protocolCounts && payload.protocolCounts.openai) + ' / Anthropic ' + normalizeDisplayValue(payload.protocolCounts && payload.protocolCounts.anthropic)],
        ['最近错误摘要', topErrorSummary],
      ].forEach(function (entry, index) {
        const card = document.createElement('div');
        card.className = 'stat';
        if (index > 0) card.className += ' compact';
        card.appendChild(createTextElement('div', entry[0], 'muted'));
        card.appendChild(createTextElement('strong', entry[1]));
        statsShell.appendChild(card);
      });
      trafficOverview.appendChild(statsShell);

      trafficOverview.appendChild(createTextElement('div', '最近外部入口记录', 'tableCaption'));
      const view = createTable(['时间', '协议', '模型', '结果', '错误 / 鉴权']);
      const recentEntries = Array.isArray(payload.recentEntries) ? payload.recentEntries : [];
      if (recentEntries.length === 0) {
        const row = document.createElement('tr');
        appendTextCell(row, '暂无');
        appendTextCell(row, '-');
        appendTextCell(row, '-');
        appendTextCell(row, '-');
        appendTextCell(row, '-');
        view.tbody.appendChild(row);
      } else {
        recentEntries.forEach(function (entry) {
          const row = document.createElement('tr');
          appendTextCell(row, entry.occurredAt);
          appendTextCell(row, displayLabel(entry.protocol));
          appendTextCell(row, entry.requestModel);
          appendBadgeCell(row, entry.outcome === 'success' ? 'passed' : 'failed');
          appendTextCell(
            row,
            entry.errorCode
              ? describeTrafficError(entry.errorCode)
              : (entry.authScheme ? displayLabel(entry.authScheme) : '-'),
          );
          view.tbody.appendChild(row);
        });
      }
      trafficOverview.appendChild(view.table);
    }
    function renderPlatform(platform) {
      clearChildren(platformTable);
      const localUseView = createTable(['本机使用状态', '最近检查时间', '说明']);
      const localUseRow = document.createElement('tr');
      appendBadgeCell(localUseRow, platform && platform.localUse ? platform.localUse.status : 'attention');
      appendTextCell(localUseRow, platform && platform.localUse ? platform.localUse.checkedAt : null);
      appendTextCell(localUseRow, platform && platform.localUse ? platform.localUse.note : '-');
      localUseView.tbody.appendChild(localUseRow);
      platformTable.appendChild(localUseView.table);
      if (platform && platform.localUse && Array.isArray(platform.localUse.blockers) && platform.localUse.blockers.length > 0) {
        platformTable.appendChild(createTextElement('div', '当前本机阻塞项', 'tableCaption'));
        const blockerList = document.createElement('ul');
        blockerList.className = 'issueList';
        platform.localUse.blockers.forEach(function (entry) {
          const item = document.createElement('li');
          item.textContent = entry;
          blockerList.appendChild(item);
        });
        platformTable.appendChild(blockerList);
      }

      const summaryView = createTable(['组件', '状态', '入口/端口', '说明']);
      const gatewayRow = document.createElement('tr');
      appendTextCell(gatewayRow, 'V2 网关');
      appendBadgeCell(gatewayRow, platform && platform.gateway ? platform.gateway.status : 'attention');
      appendTextCell(gatewayRow, platform && platform.gateway ? (platform.gateway.baseUrl || '-') + ' / ' + normalizeDisplayValue(platform.gateway.port) : '-');
      appendTextCell(gatewayRow, platform && platform.gateway ? platform.gateway.note : '-');
      summaryView.tbody.appendChild(gatewayRow);
      const teamPoolRow = document.createElement('tr');
      appendTextCell(teamPoolRow, 'Team Pool 底层引擎');
      appendBadgeCell(teamPoolRow, platform && platform.teamPool ? platform.teamPool.status : 'down');
      appendTextCell(teamPoolRow, platform && platform.teamPool ? (platform.teamPool.baseUrl || '-') + ' / ' + normalizeDisplayValue(platform.teamPool.port) : '-');
      appendTextCell(teamPoolRow, platform && platform.teamPool ? platform.teamPool.note : '-');
      summaryView.tbody.appendChild(teamPoolRow);
      platformTable.appendChild(summaryView.table);

      const entryView = createTable(['本机主入口', 'OpenAI Chat', 'Anthropic Messages', '控制台']);
      const entryRow = document.createElement('tr');
      appendTextCell(entryRow, platform && platform.primaryEntry ? platform.primaryEntry.baseUrl : null);
      appendTextCell(entryRow, platform && platform.primaryEntry ? platform.primaryEntry.openAiChatUrl : null);
      appendTextCell(entryRow, platform && platform.primaryEntry ? platform.primaryEntry.anthropicMessagesUrl : null);
      appendTextCell(entryRow, platform && platform.primaryEntry ? platform.primaryEntry.opsUrl : null);
      entryView.tbody.appendChild(entryRow);
      platformTable.appendChild(entryView.table);

      const hiddenView = createTable(['已退到后台的旧组件', '为什么本机自用不再依赖它']);
      const hiddenComponents = platform && Array.isArray(platform.hiddenLegacyServices) ? platform.hiddenLegacyServices : [];
      hiddenComponents.forEach(function (component) {
        const row = document.createElement('tr');
        appendTextCell(row, component.label);
        appendTextCell(row, component.reason);
        hiddenView.tbody.appendChild(row);
      });
      platformTable.appendChild(hiddenView.table);

      platformTable.appendChild(createTextElement('div', '当前建议动作', 'tableCaption'));
      const nextActionList = document.createElement('ul');
      nextActionList.className = 'issueList';
      const nextActions = platform && Array.isArray(platform.nextActions) ? platform.nextActions : [];
      if (nextActions.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = '无';
        nextActionList.appendChild(emptyItem);
      } else {
        nextActions.forEach(function (item) {
          const listItem = document.createElement('li');
          listItem.textContent = item;
          nextActionList.appendChild(listItem);
        });
      }
      platformTable.appendChild(nextActionList);
    }
    function shouldHighlightAccount(account) {
      const registryStatus = normalizeDisplayValue(account.registryStatus).toLowerCase();
      const runtimeState = normalizeDisplayValue(account.runtimeState).toLowerCase();
      const effectiveState = normalizeDisplayValue(account.effectiveState).toLowerCase();
      if (effectiveState === 'ready' || effectiveState === 'degraded' || effectiveState === 'cooldown' || effectiveState === 'quarantined') return true;
      if (registryStatus === 'active' && runtimeState !== 'unroutable') return true;
      return false;
    }
    function rankAccountForPrimaryList(account) {
      const effectiveState = normalizeDisplayValue(account.effectiveState).toLowerCase();
      const runtimeState = normalizeDisplayValue(account.runtimeState).toLowerCase();
      if (effectiveState === 'ready') return 0;
      if (effectiveState === 'degraded') return 1;
      if (effectiveState === 'cooldown') return 2;
      if (effectiveState === 'quarantined') return 3;
      if (runtimeState === 'ready') return 4;
      return 5;
    }
    function renderAccounts(accounts) {
      clearChildren(accountsTable);
      const highlightedAccounts = Array.isArray(accounts)
        ? accounts
          .filter(function (account) { return shouldHighlightAccount(account); })
          .sort(function (left, right) { return rankAccountForPrimaryList(left) - rankAccountForPrimaryList(right); })
        : [];
      const hiddenCount = Array.isArray(accounts) ? Math.max(0, accounts.length - highlightedAccounts.length) : 0;
      const view = createTable(['账号 UID', '静态状态', '运行状态', '生效状态', '人工覆盖', '来源']);
      const listToRender = highlightedAccounts.length > 0 ? highlightedAccounts : (Array.isArray(accounts) ? accounts : []);
      listToRender.forEach(function (account) {
        const row = document.createElement('tr');
        const actionCell = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'secondary';
        button.type = 'button';
        button.textContent = normalizeDisplayValue(account.accountUid);
        button.addEventListener('click', async function () { state.selectedAccountUid = account.accountUid || null; accountUidInput.value = state.selectedAccountUid || ''; await loadAccountDetail(); });
        actionCell.appendChild(button);
        row.appendChild(actionCell);
        appendBadgeCell(row, account.registryStatus);
        appendBadgeCell(row, account.runtimeState);
        appendBadgeCell(row, account.effectiveState);
        const overrideCell = document.createElement('td');
        if (account.runtimeOverride && account.runtimeOverride.quarantineActive) overrideCell.appendChild(createBadge('quarantined'));
        else if (account.runtimeOverride && account.runtimeOverride.operatorNote) overrideCell.textContent = '已备注';
        else overrideCell.textContent = '-';
        row.appendChild(overrideCell);
        const sourceCell = document.createElement('td');
        sourceCell.appendChild(createTextElement('div', displayLabel(account.sourceType)));
        sourceCell.appendChild(createTextElement('span', account.sourceFile, 'muted'));
        row.appendChild(sourceCell);
        view.tbody.appendChild(row);
      });
      accountsTable.appendChild(view.table);
      if (hiddenCount > 0 && highlightedAccounts.length > 0) {
        accountsTable.appendChild(createTextElement('div', '主列表已隐藏 ' + hiddenCount + ' 个过期或当前不可路由的账号；需要追查全部明细时，可展开“高级：调度、事件与原始数据”。', 'tableCaption'));
      }
    }
    function renderServices(services, platform) {
      const view = createTable(['服务', '状态', '结果', '延迟(ms)', '观察时间']);
      const hiddenNames = new Set((platform && Array.isArray(platform.hiddenLegacyServices) ? platform.hiddenLegacyServices : []).map(function (entry) { return entry.serviceName; }));
      const snapshots = services && services.latestSnapshots ? services.latestSnapshots.filter(function (service) { return !hiddenNames.has(service.service_name); }) : [];
      snapshots.forEach(function (service) { const row = document.createElement('tr'); appendTextCell(row, service.service_name); appendBadgeCell(row, service.status); appendTextCell(row, service.outcome_code); appendTextCell(row, service.latency_ms); appendTextCell(row, service.observed_at); view.tbody.appendChild(row); });
      clearChildren(servicesTable).appendChild(view.table);
      if (hiddenNames.size > 0) servicesTable.appendChild(createTextElement('div', '本机自用模式下已隐藏：' + Array.from(hiddenNames).join('、'), 'tableCaption'));
    }
    function renderDecisions(payload) { const view = createTable(['决策 ID', '协议', '模型', '命中账号', '是否就绪', '时间']); const decisions = payload && payload.decisions ? payload.decisions : []; decisions.forEach(function (decision) { const row = document.createElement('tr'); appendTextCell(row, decision.decisionId); appendTextCell(row, decision.requestedProtocol); appendTextCell(row, decision.requestedModel); appendTextCell(row, decision.selectedAccountUid); appendTextCell(row, decision.overallReady ? '是' : '否'); appendTextCell(row, decision.requestedAt); view.tbody.appendChild(row); }); clearChildren(decisionsTable).appendChild(view.table); }
    function renderEvents(payload) { const view = createTable(['类别', '动作', '目标', '时间']); const events = payload && payload.events ? payload.events : []; events.forEach(function (event) { const row = document.createElement('tr'); appendTextCell(row, event.category); appendTextCell(row, event.action); appendTextCell(row, event.target); appendTextCell(row, event.timestamp); view.tbody.appendChild(row); }); clearChildren(eventsTable).appendChild(view.table); }
    function renderReadiness(payload) {
      const current = payload && payload.current ? payload.current : { blockers: [], warnings: [], ready: false };
      clearChildren(readinessTable);
      const view = createTable(['状态', '阻塞项', '告警项', '评估时间']);
      const row = document.createElement('tr');
      const readyCell = document.createElement('td');
      readyCell.appendChild(createBadge(current.ready ? 'ready' : 'blocked'));
      row.appendChild(readyCell);
      appendTextCell(row, Array.isArray(current.blockers) ? current.blockers.length : 0);
      appendTextCell(row, Array.isArray(current.warnings) ? current.warnings.length : 0);
      appendTextCell(row, current.evaluatedAt);
      view.tbody.appendChild(row);
      readinessTable.appendChild(view.table);
      readinessTable.appendChild(createTextElement('div', '当前阻塞项', 'tableCaption'));
      const blockerList = document.createElement('ul');
      blockerList.className = 'issueList';
      const blockers = Array.isArray(current.blockers) ? current.blockers : [];
      if (blockers.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = '无';
        blockerList.appendChild(emptyItem);
      } else {
        blockers.forEach(function (entry) { const item = document.createElement('li'); item.textContent = getIssueTitle(entry) + '：' + getIssueDescription(entry); blockerList.appendChild(item); });
      }
      readinessTable.appendChild(blockerList);
      readinessTable.appendChild(createTextElement('div', '当前告警项', 'tableCaption'));
      const warningList = document.createElement('ul');
      warningList.className = 'issueList';
      const warnings = Array.isArray(current.warnings) ? current.warnings : [];
      if (warnings.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.textContent = '无';
        warningList.appendChild(emptyItem);
      } else {
        warnings.forEach(function (entry) { const item = document.createElement('li'); item.textContent = getIssueTitle(entry) + '：' + getIssueDescription(entry); warningList.appendChild(item); });
      }
      readinessTable.appendChild(warningList);
    }
    function renderCutover(payload) {
      clearChildren(cutoverTable);
      const summaryView = createTable(['当前阶段', '镜像状态', '门禁是否通过', '最近更新时间', '最近操作人']);
      const summaryRow = document.createElement('tr');
      const modeCell = document.createElement('td');
      modeCell.appendChild(createBadge(payload && payload.currentMode ? payload.currentMode : 'legacy'));
      summaryRow.appendChild(modeCell);
      appendTextCell(summaryRow, payload && payload.modeMirror ? displayLabel(payload.modeMirror.inSync ? 'in_sync' : 'drifted') : '-');
      appendTextCell(summaryRow, payload && payload.readinessGate && payload.readinessGate.current && payload.readinessGate.current.ready ? '是' : '否');
      appendTextCell(summaryRow, payload ? payload.stateUpdatedAt : null);
      appendTextCell(summaryRow, payload ? payload.stateUpdatedBy : null);
      summaryView.tbody.appendChild(summaryRow);
      cutoverTable.appendChild(summaryView.table);
      cutoverTable.appendChild(createTextElement('div', '建议下一步', 'tableCaption'));
      cutoverTable.appendChild(createTextElement('div', buildLocalizedCutoverRecommendation(payload)));
      cutoverTable.appendChild(createTextElement('div', '回退提示', 'tableCaption'));
      cutoverTable.appendChild(createTextElement('div', buildLocalizedRollbackHint(payload)));
      const baseUrlView = createTable(['公网基地址', '链路体检地址', '模式镜像文件']);
      const baseUrlRow = document.createElement('tr');
      appendTextCell(baseUrlRow, payload && payload.baseUrls ? payload.baseUrls.publicBaseUrl : null);
      appendTextCell(baseUrlRow, payload && payload.baseUrls ? payload.baseUrls.syntheticBaseUrl : null);
      appendTextCell(baseUrlRow, payload && payload.modeMirror ? payload.modeMirror.path : null);
      baseUrlView.tbody.appendChild(baseUrlRow);
      cutoverTable.appendChild(baseUrlView.table);
      cutoverTable.appendChild(createTextElement('div', '最近切流记录', 'tableCaption'));
      const transitionsView = createTable(['结果', '之前阶段', '请求阶段', '最终阶段', '门禁结果', '时间']);
      const transitions = payload && payload.recentTransitions ? payload.recentTransitions : [];
      transitions.forEach(function (transition) { const row = document.createElement('tr'); appendBadgeCell(row, transition.outcome); appendTextCell(row, displayLabel(transition.previousMode)); appendTextCell(row, displayLabel(transition.requestedMode)); appendTextCell(row, displayLabel(transition.resultingMode)); appendTextCell(row, transition.ready === null || transition.ready === undefined ? '-' : transition.ready ? '是' : '否'); appendTextCell(row, transition.createdAt); transitionsView.tbody.appendChild(row); });
      cutoverTable.appendChild(transitionsView.table);
    }
    function renderSynthetic(payload) {
      const view = createTable(['运行 ID', '是否通过', 'OpenAI', 'Anthropic', '流式', '完成时间']);
      const recentRuns = payload && payload.recentRuns ? payload.recentRuns : [];
      recentRuns.forEach(function (run) { const row = document.createElement('tr'); appendTextCell(row, run.syntheticRunId); appendBadgeCell(row, run.success ? 'passed' : 'failed'); appendTextCell(row, run.openaiJsonPassed ? '是' : '否'); appendTextCell(row, run.anthropicJsonPassed ? '是' : '否'); appendTextCell(row, run.streamingPassed === null ? '不适用' : run.streamingPassed ? '是' : '否'); appendTextCell(row, run.finishedAt); view.tbody.appendChild(row); });
      clearChildren(syntheticTable).appendChild(view.table);
      const latestRun = payload && payload.latestRun ? payload.latestRun : null;
      if (!latestRun || !Array.isArray(latestRun.results)) return;
      syntheticTable.appendChild(createTextElement('div', '最近一轮详细结果', 'tableCaption'));
      const latestView = createTable(['检查项', '协议', '结果', '细节', '延迟(ms)']);
      latestRun.results.forEach(function (result) { const row = document.createElement('tr'); appendTextCell(row, result.checkName); appendTextCell(row, result.protocol); appendBadgeCell(row, result.success ? 'passed' : 'failed'); appendTextCell(row, result.detail); appendTextCell(row, result.latencyMs); latestView.tbody.appendChild(row); });
      syntheticTable.appendChild(latestView.table);
    }
    async function loadAccountDetail() {
      if (!state.selectedAccountUid) { accountJson.textContent = '{}'; return; }
      const payload = await fetchJson('/control/accounts/' + encodeURIComponent(state.selectedAccountUid), { headers: createOperatorHeaders() });
      accountJson.textContent = JSON.stringify(payload, null, 2);
    }

    async function fetchActivity(headers) {
      return await fetchJson('/control/activity?windowMinutes=10&limit=6', { headers: headers });
    }

    async function runMonitorTick() {
      if (!state.operatorKey) {
        clearMonitorTimer();
        return;
      }

      try {
        const headers = createOperatorHeaders();
        const previousLatest = state.monitor.lastExternalAttemptAt;
        const activity = await fetchActivity(headers);
        const hasRecentActivity = Boolean(activity && activity.hasRecentExternalActivity);

        if (activity && activity.latestExternalAttemptAt) {
          state.monitor.lastExternalAttemptAt = activity.latestExternalAttemptAt;
        }

        if (state.monitor.mode === 'sleep') {
          renderTrafficOverview(activity);
          if (activity && activity.latestExternalAttemptAt && activity.latestExternalAttemptAt !== previousLatest) {
            state.monitor.mode = 'active';
            state.monitor.idleChecks = 0;
            setStatus('检测到新的外部请求，已自动切换到活跃巡检。');
            await refreshAll({ activityPayload: activity, headers: headers, monitorMode: 'active', monitorSource: 'wakeup' });
            return;
          }

          scheduleMonitorTick(AUTO_REFRESH_SLEEP_MS);
          renderTrafficOverview(activity);
          return;
        }

        let idleChecks = state.monitor.idleChecks;
        let nextMode = 'active';
        if (hasRecentActivity) {
          idleChecks = 0;
        } else {
          idleChecks += 1;
          if (idleChecks >= AUTO_REFRESH_IDLE_LIMIT) {
            nextMode = 'sleep';
            idleChecks = 0;
          }
        }

        await refreshAll({
          activityPayload: activity,
          headers,
          monitorIdleChecks: idleChecks,
          monitorMode: nextMode,
          monitorSource: 'active',
        });

        if (!hasRecentActivity && nextMode === 'sleep') {
          setStatus('最近连续 3 次未检测到外部请求，已自动进入休眠监测。');
        }
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error));
        scheduleMonitorTick(state.monitor.mode === 'active' ? AUTO_REFRESH_ACTIVE_MS : AUTO_REFRESH_SLEEP_MS);
      }
    }

    async function refreshAll(options) {
      setStatus('正在刷新控制台数据...');
      try {
        const headers = options && options.headers ? options.headers : createOperatorHeaders();
        const activity = options && options.activityPayload ? options.activityPayload : await fetchActivity(headers);
        const responses = await Promise.all([fetchJson('/control/summary', { headers: headers }), fetchJson('/control/platform', { headers: headers }), fetchJson('/control/accounts', { headers: headers }), fetchJson('/control/services', { headers: headers }), fetchJson('/control/readiness', { headers: headers }), fetchJson('/control/synthetic', { headers: headers }), fetchJson('/control/cutover', { headers: headers }), fetchJson('/control/routing/decisions', { headers: headers }), fetchJson('/control/events', { headers: headers })]);
        const summary = responses[0];
        const platform = responses[1];
        const accounts = responses[2];
        const services = responses[3];
        const readiness = responses[4];
        const synthetic = responses[5];
        const cutover = responses[6];
        const decisions = responses[7];
        const events = responses[8];
        renderSummaryCards(summary, platform);
        renderTrafficOverview(activity);
        renderGuidance(summary, platform, readiness, cutover, synthetic);
        renderPlatform(platform);
        renderAccounts(accounts.accounts || []);
        renderServices(services, platform);
        renderReadiness(readiness);
        renderSynthetic(synthetic);
        renderCutover(cutover);
        renderDecisions(decisions);
        renderEvents(events);
        updateCutoverButtons(cutover, readiness);
        summaryJson.textContent = JSON.stringify(summary, null, 2);
        await loadAccountDetail();
        if (activity && activity.latestExternalAttemptAt) {
          state.monitor.lastExternalAttemptAt = activity.latestExternalAttemptAt;
        }
        state.monitor.mode = options && options.monitorMode ? options.monitorMode : (activity && activity.hasRecentExternalActivity ? 'active' : 'sleep');
        state.monitor.idleChecks = options && options.monitorIdleChecks !== undefined ? options.monitorIdleChecks : 0;
        scheduleMonitorTick(state.monitor.mode === 'active' ? AUTO_REFRESH_ACTIVE_MS : AUTO_REFRESH_SLEEP_MS);
        setStatus('控制台数据已刷新。');
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error));
        scheduleMonitorTick(state.monitor.mode === 'active' ? AUTO_REFRESH_ACTIVE_MS : AUTO_REFRESH_SLEEP_MS);
      }
    }
    function postControl(path, body) { return fetchJson(path, { method: 'POST', headers: createOperatorHeaders(), body: JSON.stringify(body) }); }
    async function setCutoverMode(mode) { const reason = runtimeReasonInput.value.trim() || ('ops_console_cutover_' + mode); await postControl('/control/cutover/mode', { mode: mode, reason: reason }); }
    async function requestLegacyRollback() { const reason = runtimeReasonInput.value.trim() || 'ops_console_legacy_rollback'; return await postControl('/control/cutover/rollback', { reason: reason }); }
    document.getElementById('refreshButton').addEventListener('click', function () { void refreshAll(); });
    document.getElementById('clearButton').addEventListener('click', function () {
      clearMonitorTimer();
      state.monitor.idleChecks = 0;
      state.monitor.lastExternalAttemptAt = null;
      state.monitor.mode = 'sleep';
      state.monitor.nextCheckAt = null;
      state.operatorKey = '';
      state.operatorId = '';
      operatorKeyInput.value = '';
      operatorIdInput.value = '';
      setStatus('已清空当前页面里的管理密钥。');
      renderGuidance(null, null, null, null);
      renderTrafficOverview(null);
    });
    document.getElementById('ensureTeamPool').addEventListener('click', async function () {
      try {
        await postControl('/control/platform/team-pool/ensure', { reason: runtimeReasonInput.value.trim() || 'ops_console_ensure_team_pool' });
        setStatus('已检查底层引擎，必要时已经尝试拉起 Team Pool。');
        await refreshAll();
      } catch (error) { setStatus(error && error.message ? error.message : String(error)); }
    });
    document.getElementById('restartTeamPool').addEventListener('click', async function () {
      try {
        if (!confirm('确认要重新拉起底层引擎 Team Pool 吗？这会短暂中断底层 completion。')) return;
        await postControl('/control/platform/team-pool/restart', { reason: runtimeReasonInput.value.trim() || 'ops_console_restart_team_pool' });
        setStatus('底层引擎已执行重启流程，正在重新读取平台状态。');
        await refreshAll();
      } catch (error) { setStatus(error && error.message ? error.message : String(error)); }
    });
    document.getElementById('stopTeamPool').addEventListener('click', async function () {
      try {
        if (!confirm('确认要停止底层引擎 Team Pool 吗？停止后，本机 V2 统一入口将无法继续产出 completion。')) return;
        await postControl('/control/platform/team-pool/stop', { reason: runtimeReasonInput.value.trim() || 'ops_console_stop_team_pool' });
        setStatus('底层引擎已执行停止流程，正在重新读取平台状态。');
        await refreshAll();
      } catch (error) { setStatus(error && error.message ? error.message : String(error)); }
    });
    document.getElementById('runLocalRefresh').addEventListener('click', async function () {
      try {
        await postControl('/control/platform/local/prepare', { reason: runtimeReasonInput.value.trim() || 'ops_console_local_refresh' });
        setStatus('本机环境已完成一键准备：底层引擎检查、账号同步、健康巡检、链路体检和切流门禁已重新执行。');
        await refreshAll();
      } catch (error) { setStatus(error && error.message ? error.message : String(error)); }
    });
    document.getElementById('applyRuntimeAction').addEventListener('click', async function () {
      try {
        const accountUid = accountUidInput.value.trim();
        const reason = runtimeReasonInput.value.trim();
        if (!accountUid) throw new Error('请先输入账号 UID。');
        if (!reason) throw new Error('请先填写操作原因。');
        const pathMap = { annotate_reason: '/control/runtime/annotate', clear_cooldown: '/control/runtime/clear-cooldown', manual_quarantine: '/control/runtime/quarantine', manual_release: '/control/runtime/release' };
        if (!confirm('确认要对账号 ' + accountUid + ' 执行“' + displayActionLabel(runtimeActionInput.value) + '”吗？')) return;
        await postControl(pathMap[runtimeActionInput.value], { accountUid: accountUid, reason: reason });
        state.selectedAccountUid = accountUid;
        setStatus('人工动作已提交。');
        await refreshAll();
      } catch (error) { setStatus(error && error.message ? error.message : String(error)); }
    });
    document.getElementById('runAccountsSync').addEventListener('click', async function () { try { await postControl('/control/jobs/accounts-sync', { reason: runtimeReasonInput.value.trim() || 'ops_console_manual_trigger' }); setStatus('账号同步已触发。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('runHealthProbe').addEventListener('click', async function () { try { await postControl('/control/jobs/health-probe', { reason: runtimeReasonInput.value.trim() || 'ops_console_manual_trigger' }); setStatus('健康巡检已触发。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('runSyntheticProbe').addEventListener('click', async function () { try { await postControl('/control/jobs/synthetic-probe', { reason: runtimeReasonInput.value.trim() || 'ops_console_manual_trigger' }); setStatus('链路体检已触发。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('runReadinessCheck').addEventListener('click', async function () { try { await postControl('/control/jobs/readiness-check', { reason: runtimeReasonInput.value.trim() || 'ops_console_manual_trigger' }); setStatus('切流就绪度已重新计算。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('setCutoverLegacy').addEventListener('click', async function () { try { if (!confirm('确认要切回旧链路吗？这通常用于回滚。')) return; const payload = await requestLegacyRollback(); setStatus((payload && payload.note) || '已接受回滚请求，V2 网关可能会在回滚过程中短暂断开。'); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('setCutoverParallel').addEventListener('click', async function () { try { if (!confirm('确认切到“并行观察”吗？旧链路仍会保留。')) return; await setCutoverMode('parallel'); setStatus('已切换到并行观察。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('setCutoverCanary').addEventListener('click', async function () { try { if (!confirm('确认进入“灰度阶段”吗？系统会先校验切流门禁。')) return; await setCutoverMode('canary'); setStatus('已切换到灰度阶段。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
    document.getElementById('setCutoverPrimary').addEventListener('click', async function () { try { if (!confirm('确认进入“主用阶段”吗？系统会再次校验切流门禁。')) return; await setCutoverMode('primary'); setStatus('已切换到主用阶段。'); await refreshAll(); } catch (error) { setStatus(error && error.message ? error.message : String(error)); } });
  </script>
</body>
</html>`;
}
