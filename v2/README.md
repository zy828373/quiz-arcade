# Codex Pool V2

Current stage: `phase7`.

V2 is still a sidecar control plane. It does not replace `start_all.bat`, `health_check.ps1`, `anthropic_proxy.js`, or `cli-proxy-api.exe`, and it does not take over production traffic.

## Scope

- Stage0: standalone TypeScript service, config loader, JSON logger, SQLite bootstrap, `/health`
- Stage1: account registry, status events, idempotent `accounts:sync`
- Stage2: read-only health probes, service/account snapshots, metrics ledger, `/health/*`
- Stage3: shadow scheduler, runtime routing state, cooldown/quarantine, explainable routing ledger
- Stage4: parallel gateway, unified auth, protocol adapters, OpenAI/Anthropic request normalization
- Stage5: local control API, operator auth, runtime overrides, `/ops` console
- Stage6: synthetic probes, cutover readiness evaluation, persisted verification snapshots
- Stage7: controlled cutover modes, readiness-gated canary/primary promotion, rollback guardrails

Out of scope for this stage:

- real traffic takeover
- Cloudflare or client entrypoint switching
- replacing PowerShell keepalive logic

## Commands

```powershell
cd .\v2
npm run db:init
npm run accounts:sync
npm run health:probe
npm run cutover:mode -- --mode parallel --reason local_validation
npm run scheduler:shadow -- --protocol openai --model gpt-4.1
npm run scheduler:feedback -- --decision <decision-id> --outcome success
npm run start
```

Feedback outcomes supported in phase6:

- `success`
- `failure`
- `rate_limit`
- `auth_error`

## HTTP Endpoints

- `GET /health`
- `GET /healthz`
- `GET /health/summary`
- `GET /health/services`
- `GET /health/accounts`
- `GET /scheduler/preview?protocol=openai&model=gpt-4.1`
- `GET /runtime/accounts`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/messages`

`/scheduler/preview` is now a dry-run read path. It does not write `routing_decisions` and does not update `account_runtime_state`.

`npm run scheduler:shadow` is the explicit persisted shadow-decision path. It writes `routing_decisions` and candidate breakdown rows, but it still does not forward live traffic.

Stage4 gateway write/read split:

- Read-only: `GET /health/*`, `GET /runtime/accounts`, `GET /scheduler/preview`
- Parallel execution with observational shadow-decision writes: `POST /v1/chat/completions`, `POST /v1/messages`
- Read-only upstream capability proxy: `GET /v1/models`

## Gateway Notes

All gateway requests pass through one auth path. Clients can use either `Authorization: Bearer <accepted-key>` or `x-api-key: <accepted-key>`.

The adapter layer is split explicitly:

- `OpenAIChatCompletionsAdapter`
- `AnthropicMessagesAdapter`
- `SharedModelsAdapter`

Current gateway compatibility is still intentionally narrow:

- OpenAI: `chat.completions` JSON and SSE passthrough
- Anthropic: `messages` JSON and text-only SSE adaptation
- Models: OpenAI-style `/v1/models`, merged with Anthropic-compatible aliases from the existing proxy behavior

Not covered yet:

- tools / function calling adaptation
- image or other non-text content blocks
- embeddings, responses API, or admin APIs
- production traffic takeover

## Pre-Cutover Verification

Stage6 adds two persisted verification ledgers:

- `synthetic_probe_runs` / `synthetic_probe_results`
- `cutover_readiness_snapshots`

Readiness is intentionally explainable. The current evaluator checks:

- schema version 5 applied
- key isolation validation passes
- synthetic probe base URL is available
- latest `accounts:sync` exists, succeeded, and is not stale
- latest `health:probe` exists, succeeded, and is not stale
- `availableForRouting > 0`
- `team_pool` is healthy
- latest OpenAI JSON synthetic probe passed
- latest Anthropic JSON synthetic probe passed

Warnings are tracked separately for non-blocking signals such as legacy dependency health or streaming synthetic failures.

Stage6 control endpoints:

- `GET /control/readiness`
- `GET /control/synthetic`
- `POST /control/jobs/readiness-check`
- `POST /control/jobs/synthetic-probe`

Stage7 cutover endpoints:

- `GET /control/cutover`
- `POST /control/cutover/mode`

`GET` endpoints stay read-only. Only explicit `POST` jobs write `synthetic_probe_runs` or `cutover_readiness_snapshots`.

Synthetic probes must use `V2_SYNTHETIC_CLIENT_API_KEYS`. These keys are isolated from:

- inbound client keys
- operator keys
- upstream keys

If any overlap exists, runtime config loading fails fast.

Gateway requests keep using the phase3 scheduler only in `shadow` mode. The stored routing decision is marked as observational metadata inside `routing_decisions.request_context_json`; the actual upstream execution still goes to the current team pool endpoint.

## Controlled Cutover

Stage7 keeps the legacy chain intact and adds explicit cutover modes:

- `legacy`: legacy scripts remain the front door, V2 is not auto-started
- `parallel`: V2 can run alongside legacy for local validation
- `canary`: readiness-gated approval for controlled front-door validation
- `primary`: readiness-gated approval for primary front-door use, while legacy remains available for rollback

Mode changes are explicit and tracked in SQLite plus `v2/data/cutover-mode.env`.

Root-level helper scripts:

- `enter_parallel.ps1`
- `enter_canary.ps1`
- `enter_primary.ps1`
- `rollback_legacy.ps1`
- `start_v2.bat`

Canary and primary are refused unless `/control/readiness` is green. The same gate is enforced by the local `cutover:mode` CLI used by the helper scripts.

Suggested local sequence:

1. Start legacy as usual with `start_all.bat`.
2. Enter parallel mode and let `start_v2.bat` run V2.
3. Run `POST /control/jobs/health-probe`, `POST /control/jobs/synthetic-probe`, and `POST /control/jobs/readiness-check` until readiness is green.
4. Enter canary mode for controlled front-door validation.
5. Enter primary mode only after external entrypoint planning is approved.
6. Use `rollback_legacy.ps1` at any time to return to legacy mode.

Base URL notes:

- Set `V2_PUBLIC_BASE_URL` when you want readiness and operators to see the externally intended V2 address.
- Set `V2_SYNTHETIC_BASE_URL` when synthetic probes must hit a different address than the public/operator-facing one.
- If neither is set and V2 listens on `0.0.0.0`, the service falls back to `http://127.0.0.1:<port>` for local synthetic stability.

## Scheduler Model

Static account state stays in `account_registry.current_status`.

Dynamic scheduler state is stored separately in `account_runtime_state`:

- `ready`
- `degraded`
- `cooldown`
- `quarantined`
- `unroutable`

Stage3 routing flow:

1. Filter accounts that are statically unroutable.
2. Allow ready/degraded accounts into scoring.
3. Allow cooldown/quarantined accounts back only as recovery-probe candidates after their timer expires.
4. Rank candidates by explainable score and store the full shadow decision.

Current score inputs:

- static registry status
- latest account health snapshot
- live `source_file_present`
- `expires_at`
- `refresh_stale`
- recent sync failure signal
- consecutive failure count
- cooldown / quarantine / recovery-probe status
- configurable source-type bias

## Health Summary Semantics

Stage3 separates:

- `probeCompleted`: the probe run finished and was recorded
- `serviceHealth`: health of probed services
- `accountAvailability`: accounts available to the scheduler
- `overallReady`: current runtime readiness based on whether schedulable accounts exist now
- `latestProbeRun.probeReadiness.overallReadyAtProbe`: readiness captured at probe time

Recent failed account sync is now treated as a signal. It can degrade confidence, but it does not mark every account unroutable by itself.

## Notes

- Requires Node.js 24+ because the project currently uses `node:sqlite` and native TypeScript strip-types.
- Maintenance commands should be run serially against one SQLite file. Parallel writes can still hit SQLite locks.
- Gateway debug headers include `x-codex-gateway-mode` and, for persisted observational routes, `x-codex-shadow-decision-id`.
