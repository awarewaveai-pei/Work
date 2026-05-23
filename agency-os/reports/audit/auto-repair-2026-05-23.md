# Auto-Repair Logic Audit — 2026-05-23

> **Tier 3 monthly audit per [BUG_HUNT_PROTOCOL.md](../../docs/operations/BUG_HUNT_PROTOCOL.md).**
> Status SSOT: [AUDIT_REGISTRY.md §Auto-Repair logic audit](../../docs/operations/AUDIT_REGISTRY.md#auto-repair-logic-audit-2026-05-23)
> Owner docs: [plan-v3.2-final](../../../docs/awarewave-auto-repair-plan-v3.2-final.md) · [BRIEF](../../../docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md) · [app-architecture](../../../docs/awarewave-repair-center-app-architecture.md) · [phase2-handoff](../../../docs/awarewave-auto-repair-phase2-handoff.md)

## Metadata

| Field | Value |
|------|------|
| Audit date | 2026-05-23 |
| Auditor | Claude (R0 architect mode) + `critic` subagent × 3 parallel rounds |
| Operator | peijingartstudio |
| Trigger | Tier 3 monthly + Phase 4 observation window closing 2026-06-19 |
| Priority formula | `blast_radius × likelihood × scope` = 5 × 3 × 中 (Phase 4 closeout pressure) |
| Owner doc baseline | Plan v3.2 + Architecture 2026-05-13 baseline |
| Wall-clock effort | ~3.5 hr (parallel critic 6 min, sequential analysis + writing remainder) |

## R0 [驗證計畫] 4-Action Evidence

| Action | Evidence |
|------|------|
| **1. 實測** | `curl https://app.aware-wave.com/api/ops/repairs/health` returned `ok=true`, all 10 config invariants pass. Output captured in §Evidence below. Plus `scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly` exit code 2 (10/10 pass + 1 cosmetic warn) — harness built as audit deliverable. |
| **2. Review** | Full file reads (no excerpts): `policy.ts`, `run-state.ts`, `service.ts`, `backup.ts`, `github.ts`, `audit.ts`, `slack/route.ts`, `sentry/route.ts`, `redactSecrets.ts`, `verifyIngestToken.ts`, `repairs/route.ts`, `[id]/links/route.ts`, `ops-role.ts`, `sg-deploy.sh`, `rollback-phase1.sh`, `auto-deploy-next-admin.sh`, `auto-repair-claude.yml`, `0027_repair_runs.sql`. Plus targeted reads of `RepairActions.tsx`, normalize/*.ts. |
| **3. 抓蟲** | Cross-file: `grep "rollback-phase1"` confirms no auto-trigger path. `grep "synthetic|drill"` confirms no existing dogfood harness (built as deliverable). `grep` for `severityRequiresHumanReview` non-test callers = 0 (dead code). Critic × 3 rounds independently validated candidates A/B/C/D/E/F + surfaced 5 new findings I missed. |
| **4. WORKLOG** | This report + [AUDIT_REGISTRY.md](../../docs/operations/AUDIT_REGISTRY.md) new section + [WORKLOG.md](../../WORKLOG.md) 2026-05-23 entry + [TASKS.md](../../TASKS.md) Critical-A/B/C/D ready-to-apply. |

## Scope

**14 in-scope files** (Repair Center logic), **5 cross-reference files** (deploy, rollback, role, auto-deploy notification):

```
lib/repair-center/{policy,run-state,service,backup,github,audit,ssh,types}.ts
lib/repair-center/__tests__/{policy,run-state}.test.ts
lib/ops-inbox/{redactSecrets,verifyIngestToken,fingerprint,transition}.ts
lib/ops-inbox/normalize/{sentry,grafana,netdata,uptime-kuma,posthog}.ts
app/api/webhooks/{sentry,uptime-kuma,netdata,grafana,posthog}/route.ts
app/api/internal/commands/slack/route.ts
app/api/ops/repairs/{route.ts, [id]/{links,human-only,archive,escalate}/route.ts, health/route.ts}
.github/workflows/{auto-repair-claude,auto-repair-pr-notify}.yml
lobster-factory/infra/hetzner-phase1-core/scripts/{sg-deploy.sh, rollback-phase1.sh, auto-deploy-next-admin.sh}
lobster-factory/packages/db/migrations/0027_repair_runs.sql
```

## Headline

**Overall risk: HIGH.** 5 confirmed 🔴 Critical findings (3 directly violate Plan v3.2 SSOT contracts), 10 🟠 Major, 11 🟡 Minor. The system's *config layer* is healthy (`/api/ops/repairs/health` returns `ok=true` and probes all 10 invariants green), but the *logic layer* hides multiple plan-promised behaviors that don't exist in code. Phase 4 observation period should not close at 2026-06-19 until at least C1 + C2 + C4 are fixed.

---

## 🔴 Critical Findings

### C1 — sg-deploy.sh Step 7 smoke-fail does NOT invoke rollback-phase1.sh

**File**: [`sg-deploy.sh:163-189`](../../../lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh#L163-L189) · cross-ref [`rollback-phase1.sh`](../../../lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh) · [`auto-deploy-next-admin.sh:78-90`](../../../lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh#L78-L90)

**Issue**: Plan v3.2 §五 第 3 層 promises *"任何一個不 OK → rollback-phase1.sh 自動還原"*. BRIEF.md Non-Negotiable #6 promises *"backup + health gate + auto-rollback required before any production change"*. Reality: `_smoke_check()` increments `$_smoke_errors` but the post-loop block (L183-189) only writes `.smoke-warn` flag + logs `SMOKE_WARN`, then proceeds to `=== sg-deploy complete ===` with `exit 0`. The only `.smoke-warn` consumer is `auto-deploy-next-admin.sh` which appends the warning to Slack/Telegram message text. **No script anywhere invokes `rollback-phase1.sh restore` automatically.** Worse: `.deployed-commit` is written *before* the smoke gate (line 138), so drift detector now considers a broken build the deployed state.

**Evidence**:
```
$ grep -rl "rollback-phase1" d:/Work/lobster-factory/infra/hetzner-phase1-core/scripts/
  rollback-phase1.sh         (the script itself, usage text only)
$ grep -rl "rollback-phase1" d:/Work/.github/
  (no matches)
```

**Reproducer**: ship code that 500s on `/api/ops/summary`. sg-deploy exits 0; `.deployed-commit` updated; Slack receives `SMOKE_WARN: 1 endpoint(s) non-2xx`; service stays degraded; operator manually decides to rollback or not.

**Why-matters**: This is the highest blast-radius finding. Plan-promised auto-rollback is fiction. Any auto-repair PR that introduces a regression passing CI but failing live smoke check sits broken in production until human intervention. This single gap nullifies BRIEF.md NN #6 and Plan §十一 acceptance gate "deploy 後 health check 失敗 → rollback-phase1.sh 自動執行".

**Fix design**: see [§Patch 1](#patch-1-sg-deploysh-smoke-fail--rollback-c1-).

---

### C2 — `redactSecrets` is key-only, leaks every secret embedded in payload values

**File**: [`lib/ops-inbox/redactSecrets.ts:1-35`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts)

**Issue**: The redactor at L20-35 walks payload objects and only tests **keys** against the SECRET_KEY_PATTERNS regex (L26 `SECRET_KEY_PATTERNS.some((p) => p.test(k))`). Values containing secret strings (`API_TOKEN=sk_live_…`, embedded JWT, `-----BEGIN OPENSSH PRIVATE KEY-----` blocks, base64 SSH key blobs) flow unredacted into `ops_incidents.raw_payload` JSONB. Sentry breadcrumbs, event.message, stacktrace strings, Grafana annotations, and PostHog event properties **routinely** embed env-dump strings.

**Reproducer**: `POST /api/webhooks/sentry` with body `{"data":{"event":{"message":"crashed with TOKEN=ghp_xxxxxxxxxxxxxxxx"}}}` → `SELECT raw FROM ops_incidents WHERE fingerprint='...'` → secret visible in DB. Combined with C4 (GET role guard missing), that secret is now readable by any logged-in viewer.

**Why-matters**: The 2026-05-22 OPS_INBOX_INGEST_TOKEN incident proved leak realism at the *config* layer. This finding shows the *payload* layer has the same shape. With Sentry being the only `auto_repair` source AND being the most prolific source of embedded-secret patterns, this is THE entry-point of the secret-leak class.

**Fix design**: see [§Patch 2](#patch-2-redactsecrets-value-aware-scrubber-c2-).

---

### C3 — Webhook routes have no body-size cap (DoS surface)

**Files**: All five `app/api/webhooks/{sentry,uptime-kuma,netdata,grafana,posthog}/route.ts`

**Issue**: Each route calls `await req.json()` (e.g., [sentry/route.ts:23](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/sentry/route.ts#L23)) with zero size cap. Next.js App Router has **no default body limit** on Route Handlers (legacy `api.bodyParser` does not apply). An attacker holding the shared bearer token (or fuzzing until 401) can POST a 500MB JSON. Memory + the recursive `walk()` in `redactSecrets` blow up. `runtime = "nodejs"` + single-process container = trivial OOM kill of `lobster-next-admin`.

**Reproducer** (don't run): `curl -X POST -H "Authorization: Bearer $TOKEN" -d "$(python3 -c 'print(\"{\"+\",\".join(f\"\\\"k{i}\\\":\\\"x\\\"\" for i in range(10_000_000))+\"}\")')" https://app.aware-wave.com/api/webhooks/sentry`.

**Why-matters**: Single container outage = `app.aware-wave.com` 502 = entire Ops Inbox + Repair Center + ops/* dashboards down. Recovery: `docker restart lobster-next-admin`, but auto-rollback (C1) is also broken so no automatic recovery path.

**Fix design**: Read `req.headers.get("content-length")` early, reject `> 256KB` with 413. Switch to `req.text()` first (also enables future per-source HMAC), parse with try/catch + depth cap on `walk()` ≤ 32. nginx-layer `client_max_body_size 256k` for `/api/webhooks/*` location as defense-in-depth.

---

### C4 — `GET /api/ops/repairs` has no role guard + returns `audit_log` containing SSH stdout/stderr

**File**: [`app/api/ops/repairs/route.ts:9-25`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/route.ts#L9-L25)

**Issue**: Compare GET handler (L9-25, no auth check, returns `select("*")` including jsonb `audit_log`) vs POST handler (L27-31, calls `canApproveCommand(resolved.role)` and 403s viewer). The GET handler exposes the full row to anyone who reaches the endpoint — and via [`resolveOpsRole`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts#L42-L50), default fallback is `viewer`, which is anyone past Cloudflare. The `audit_log` jsonb is populated at [`service.ts:159, 174`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts) with `data: backup.detail`, and `backup.detail` at [`backup.ts:170-181`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts#L170-L181) carries `sgResult.stdout.slice(-6000)` and `stderr.slice(-6000)` plus raw `sg_command` / `eu_command` strings. SSH stderr commonly leaks hostnames, internal paths, `permission denied (publickey)` host listings, backup filenames carrying client slugs.

**Reproducer** (logged-in viewer): `curl https://app.aware-wave.com/api/ops/repairs?limit=200` → JSON includes `runs[*].audit_log` → SSH output visible.

**Why-matters**: Cross-tenant disclosure surface if `client_slug` ever appears in a backup_ref string. Even today (single-tenant), the SSH host + path leakage is a recon-level info disclosure. Combined with C2 (secret leak into payload), any of those payload secrets persisted to `audit_log` is now viewer-readable.

**Fix design**: see [§Patch 3](#patch-3-get-repairs-role-guard--audit_log-column-allow-list-c4-).

---

### C5 — `service.ts:104` Critical-severity gate is a flag, not a pipeline stop

**File**: [`service.ts:104`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L104) + [`policy.ts:82-84`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts#L82-L84)

**Issue**: Plan v3.2 §四 Critical severity 閘門 says *"任何來源 severity=critical 的 incident 在 RepairRun 建立時強制 needs_human_review = true（實作：severityRequiresHumanReview()）"*. Code at `service.ts:104` sets `needs_human_review: policy !== "auto_repair" || i.severity === "critical"` — but the **pipeline at L133-217 unconditionally proceeds** to `backing_up → approved → repairing` regardless of `needs_human_review`. The flag is purely cosmetic on the UI. Worse: `severityRequiresHumanReview()` is declared but **0 non-test callers** (grep verified), the docstring at L79-81 incorrectly claims "呼叫端在建立 RepairRun 前使用此函式決定該欄位" — **documentation lies**.

**Reproducer**: any `severity=critical` Sentry payload through `/api/webhooks/sentry` → operator presses Approve in Slack → auto-backup → GitHub Issue → Claude action → PR. No human-review interrupt anywhere.

**Why-matters**: Plan-promised gate is implemented as a label. A critical Sentry error in payment / auth code (despite plan §七 forbidding Claude from touching those) goes through full auto-pipeline based on operator's single Approve tap, no second-factor check.

**Fix design**: Either (a) **wire `needs_human_review` as a gate** at `service.ts:121` — if true, set `state: "human_only"` and return ok without proceeding to backup/issue (operator must explicitly re-approve via `escalate`-equivalent flow), OR (b) **fix the plan wording** to say "flag for UI surfacing only, not a pipeline stop" and remove the misleading docstring. Recommended (a): the gate is the safer 30-year design; the cost is one extra operator click for critical incidents (acceptable).

---

## 🟠 Major Findings (10)

| # | File:line | Issue (1-line) | Why-matters |
|---|-----------|----------------|------------|
| M1 | [service.ts:222-227, 279-315](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts) + [[id]/links/route.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/[id]/links/route.ts) | `updateRun` / `updateRunLinks` accept arbitrary `state` / `deploy_status` strings; no transition graph. Role guard present (`canApproveCommand`), so requires operator privilege, but ops-role can flip terminal `resolved` back to `repairing` or skip `pr_ready` straight to `deploying` | Bypass of `escalateGuard` and `canApprovePolicy` invariants. State integrity depends on operator discipline |
| M2 | [verifyIngestToken.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/verifyIngestToken.ts) | All 5 webhook sources share one bearer token; no per-source HMAC. Plan §十-A promised Sentry-specific signing | Single token leak (already happened 2026-05-22 with stale registry value) = forge incidents at all 5 endpoints, suppress real alerts via fingerprint collision, flood inbox |
| M3 | All 5 `webhooks/*/route.ts` | `req.json()` consumed before HMAC verification possible. Future per-source HMAC retrofit blocked architecturally | Must refactor to `req.text()` + manual `JSON.parse` *now* to enable later HMAC fix without renewed refactor cycle |
| M4 | [fingerprint.ts:25-37](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/fingerprint.ts#L25-L37) | Fingerprint derives from attacker-controlled fields (`issue.id`, `alert_id`, `monitor.id`). With leaked token, attacker pre-seeds fingerprint X resolved/ignored → real X alert dedups into resolved state → silent suppression | Quieter exploit than M2 — no flood, just selective alert blinding. Hardest to detect |
| M5 | [backup.ts:33-67](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts#L33-L67) | Webhook mode treats `200 + non-JSON text` as success; no `size_bytes >= 1024` verification. Plan §六 explicit: "驗證備份：檔案大小 > 1KB" | BRIEF NN #5 "No backup means no repair run" becomes vacuous |
| M6 | [auto-repair-claude.yml:38](../../../.github/workflows/auto-repair-claude.yml#L38) | `--allowedTools Edit,Read,Grep,Glob,LS` — no path allow-list. Claude can Edit `.github/workflows/`, `nginx/`, `Dockerfile`, `docker-compose*`, `**/migrations/`, `.env*` despite AGENTS.md Auto-Repair 紅線 | PR review *should* catch but Slack notifies before review. CI path-deny step missing |
| M7 | [service.ts:147-176](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L147-L176) | No mid-sequence recovery: backup completes but `updateRun` after fails silently (Supabase network drop) → run stuck at `backing_up` with passed backup, no audit trail | Operator may re-trigger, causing duplicate backup + duplicate issue race |
| M8 | [backup.ts:84](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts#L84) `safeScriptPath` | Regex `[/A-Za-z0-9_.-]` allows `..` (path traversal). Env-write compromise → RCE via attacker-supplied `AUTO_REPAIR_SG_BACKUP_SCRIPT=../../etc/cron.daily/evil.sh` | Defense-in-depth violation, low likelihood (requires .env write) but high impact |
| M9 | [service.ts:255-256](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L255-L256) | `escalateAnalysisOnlyRun` TOCTOU race: fetch → guard → update is non-atomic. Concurrent "confirm deployed → resolved" can sneak in, leaving terminal run with `policy='auto_repair'` — audit forensics corrupted | Fix: do guard inside `UPDATE ... WHERE policy='analysis_only' AND state NOT IN (...)` + rowCount===1 |
| M10 | sentry webhook race [route.ts:43-71](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/sentry/route.ts#L43-L71) | Read-then-upsert sequence is racy under Sentry retry storms: two concurrent reads see `occurrence_count=5`, both write `6` → one increment lost. Same for `reopen_count` and `maxSeverity` | During real incidents (Sentry retries) the counters lose accuracy precisely when accuracy matters most. Atomic upsert via PL/pgSQL RPC fixes it |

## 🟡 Minor Findings (11)

| # | File:line | Issue | Fix sketch |
|---|-----------|-------|----------|
| m1 | [policy.ts:74](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts#L74) | Dead code: `if (severity === "critical") return "triage_needed"` unreachable (only catalog `triage_needed` source is `manual`, fallthrough handled on next line) | Delete line OR add comment explaining future-source intent |
| m2 | [verifyIngestToken.ts:11](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/verifyIngestToken.ts#L11) | Length-leak: `if (a.length !== b.length) return false` reveals expected token length via timing | Compare against fixed-length HMAC of both sides, or always run `timingSafeEqual` against same-length zero-padded buffers |
| m3 | [posthog/route.ts:18-20](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/posthog/route.ts#L18-L20) | Auth-then-feature-flag ordering inverted: 503 "posthog ingestion disabled" leaks that the token was valid | Move feature-flag check before token check |
| m4 | [normalize/uptime-kuma.ts:14-16](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/normalize/uptime-kuma.ts) | `environment` inferred from attacker-controlled `monitor.hostname` regex `/staging\./i`. Hostname `staging.evil.com` lands in env=staging | Source env from server-side registry, not payload |
| m5 | [netdata/route.ts:29-31](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/netdata/route.ts#L29-L31) | Silent early-return on `severity=low + status=CLEAR`. Attacker POSTs fake CLEAR → real CLEAR-resolver doesn't run on existing open incident | Always go through fingerprint+upsert; do not short-circuit before lookup |
| m6 | [run-state.ts:5-7](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/run-state.ts#L5-L7) | `isTerminalState(undefined)===true` footgun. NOT NULL on DB shields today, but contract is fragile | Split into `isTerminalState()` (forgiving, UI) and `isStrictTerminalState()` (strict, write gates) |
| m7 | [service.ts:295-298](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L295-L298) | `github_pr_url` parsing accepts any URL containing `/pull/(\d+)`. `javascript:alert(1)//github.com/foo/bar/pull/123` stored verbatim | Validate `new URL(input).hostname === 'github.com'` before storing |
| m8 | [auto-repair-claude.yml:96-103](../../../.github/workflows/auto-repair-claude.yml#L96-L103) | Slack says "completed" when Claude exited success but produced no `branch_name`. Misleading | Detect empty `branch_name`, report "analysis_only" |
| m9 | [policy.ts:79-81](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts#L79-L81) | Docstring of `severityRequiresHumanReview()` claims "呼叫端使用此函式" but **0 non-test callers** (grep verified) — documentation lies | Replace inline check at `service.ts:104` with this helper, OR delete the helper |
| m10 | [service.ts:323](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L323) + [archive-stale/route.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/archive-stale/route.ts) | `triage_needed` runs accumulate forever — not in `TERMINAL_STATES` so archive sweep ignores them; no time-based cleanup | Include `triage_needed` after N days in archive sweep, OR add a dashboard "stuck triage" counter |
| m11 | [0027_repair_runs.sql:84-86](../../../lobster-factory/packages/db/migrations/0027_repair_runs.sql#L84-L86) | RLS enabled with no policies — silent empty result for anon-key reads (not 403). Future client-side direct query confusion | Add explicit `create policy "deny all anon" on repair_runs for all to anon using (false)` |

## 🟢 Notes / Suggestions

- 🔵 `auto-repair-pr-notify.yml`: missing `Closes #N` link verification — bot can open PR without linking to issue
- 🔵 [escalate/route.ts:15](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/[id]/escalate/route.ts) — `actor` passed as `resolved.role` (string "admin"/"owner") not operator's identity (email/sub); audit trail cannot distinguish *which* admin escalated
- 🔵 [`0030_repair_runs_archive.sql:78`](../../../lobster-factory/packages/db/migrations/0030_repair_runs_archive.sql) `notify pgrst, 'reload schema'` requires PostgREST connection; silently no-ops if migration runs via supabase-cli or psql

## ✓ Verified Clean

- **Slack signature verification** at [`slack/route.ts:8-25`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/commands/slack/route.ts#L8-L25): timing-safe via `crypto.timingSafeEqual` with explicit length check at L24, valid timestamp `Number.isFinite` check, 5-min freshness window. No length leak in this path (HMAC-SHA256 hex is always 64 chars)
- **GitHub token handling** at [`github.ts`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/github.ts): token only in `Authorization` header, never echoed into issue body, never logged. `buildIssueBody` (L67-107) embeds only run.id / incident_id / backup_ref / titles
- **escalate / human-only / links / archive routes**: all gated by `canApproveCommand` (owner/admin only). No actor-spoofing surface at route layer
- **Branch name injection** at [`auto-repair-claude.yml:50`](../../../.github/workflows/auto-repair-claude.yml#L50): `gh pr view "$BRANCH_NAME"` — `BRANCH_NAME` comes from claude-code-action's git-validated `branch_name` output, double-quoted, gh CLI does not shell-interpret. Safe
- **0027 migration constraints**: all enum CHECK constraints align with TypeScript union types in `types.ts`. Foreign key `on delete cascade` on `incident_id` is intentional. jsonb defaults `'[]'::jsonb` / `'{}'::jsonb` non-null
- **archiveRun race**: idempotency check at [`service.ts:324`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts#L324) `if (run.archived_at) return ok:true` — concurrent calls produce same outcome
- **ssh.ts**: no user-data interpolation into commands; covered by M8 for env path traversal but no command injection at this layer
- **`computeFingerprint` SHA-256 use**: not used as auth — collision-resistance is sufficient for dedup semantic
- **RepairPolicy / RepairRunState type drift check**: TypeScript unions in `types.ts` exactly match SQL CHECK constraints in 0027 (line 17, 19-31). No drift

## Statistics

| Category | Count |
|----------|-------|
| 🔴 Critical | 5 |
| 🟠 Major | 10 |
| 🟡 Minor | 11 |
| 🟢 Note/Suggestion | 3 |
| ✓ Verified Clean | 8 |
| **Total findings logged** | **37** |
| Files reviewed (in-scope) | 14 |
| Files reviewed (cross-ref) | 5 |
| Critic subagent rounds | 3 (parallel, ~6 min wall) |
| Pre-audit real production breaks attributable to these findings | 1 (2026-05-22 OPS_INBOX_INGEST_TOKEN incident, partial — affected C2/M2 root cause) |
| Plan v3.2 SSOT contract violations | 3 (C1 plan §五, C5 plan §四, M5 plan §六) |

---

## Top-3 Ready-to-Apply Fix Patches (R0 design)

### Patch 1 — sg-deploy.sh smoke-fail → rollback (C1) <a id="patch-1-sg-deploysh-smoke-fail--rollback-c1-"></a>

**Risk**: Medium-High (touches prod deploy script). **Apply**: requires staging dry-run drill before production. **Reversible**: yes, single-block change in sg-deploy.sh.

**Pre-flight**:
1. SSH SG, take a clean snapshot first: `./scripts/rollback-phase1.sh save next-admin && ./scripts/rollback-phase1.sh save node-api && ./scripts/rollback-phase1.sh save wordpress`
2. Confirm `rollback-phase1.sh restore <service>` works: `./scripts/rollback-phase1.sh list next-admin` shows snapshot tag
3. Test in staging compose first (`docker-compose.staging.yml`)

**Diff** (apply to `lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh`):

```bash
# After current Step 7 block (around line 189), REPLACE the final summary block with:

if [[ "$_smoke_errors" -gt 0 ]]; then
  log "SMOKE_WARN: $_smoke_errors endpoint(s) returned non-2xx"
  printf '%s|%s\n' "$_smoke_errors" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.smoke-warn"

  # === C1 fix: auto-rollback gate ===
  # Default: rollback on ≥1 smoke failure. Operator override:
  #   AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false ./sg-deploy.sh <app>   (drill-only mode)
  if [[ "${AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL:-true}" == "true" ]]; then
    log "--- Auto-rollback triggered by smoke failure ---"
    for APP in "${APPS[@]}"; do
      log "Rolling back $APP to previous snapshot..."
      if ! bash "$(dirname "$0")/rollback-phase1.sh" restore "$APP"; then
        log "ROLLBACK_FAILED for $APP — manual intervention required"
        # Continue to next app rather than aborting; partial rollback is better than none
      fi
    done
    # Notify both Slack and Telegram with explicit ROLLBACK marker (consumed by auto-deploy-next-admin.sh notification step)
    printf 'ROLLBACK|%s|%s\n' "$_smoke_errors" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAGING_DIR/.rollback-triggered"
    log "Auto-rollback complete. Exiting non-zero."
    exit 1
  else
    log "AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false — leaving degraded state for drill"
  fi
else
  log "smoke: all endpoints OK"
  rm -f "$STAGING_DIR/.smoke-warn"
fi

# Move .deployed-commit / .deployed-at writes from Step 5 to HERE
# (only mark as deployed AFTER smoke gate + rollback decision)
echo "$DEPLOYED_COMMIT" > "$STAGING_DIR/.deployed-commit"
date -u +%Y-%m-%dT%H:%M:%SZ > "$STAGING_DIR/.deployed-at"

log "=== sg-deploy complete ==="
```

**Also update**: `auto-deploy-next-admin.sh` Slack/Telegram message section to read `.rollback-triggered` flag and surface "🔴 AUTO-ROLLBACK FIRED" prefix.

**Update**: `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` line 72 — change "**非致命**" wording to "**致命，自動 rollback**" and document `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false` drill mode.

**Verification after apply**:
1. Staging dry-run: deliberately break a route in staging, run sg-deploy, observe rollback fires + service recovers to previous image
2. Production: deploy a known-good commit with `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=true` (default) → confirm normal deploy still works
3. Production drill (off-hours, controlled): `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false` + deliberately bad commit → verify operator sees old "smoke warn, no rollback" behavior; then re-test with default true

---

### Patch 2 — `redactSecrets` value-aware scrubber (C2) <a id="patch-2-redactsecrets-value-aware-scrubber-c2-"></a>

**Risk**: Low-Medium (pure function, unit-testable, no schema change). **Apply**: any commit window. **Reversible**: trivial.

**Pre-flight**: write unit tests against `redactSecrets` first; current `__tests__` directory has none for this file.

**Diff** (apply to `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts`):

```typescript
const SECRET_KEY_PATTERNS = [
  /password/i, /passwd/i, /secret/i, /token/i, /api[_-]?key/i,
  /auth(orization)?/i, /cookie/i, /session/i, /credential/i, /bearer/i,
  /^x-.*-key$/i, /private[_-]?key/i,
];

// === C2 fix: value-side scrubbing ===
const SECRET_VALUE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  { re: /sk_(test|live)_[A-Za-z0-9]{20,}/g,                              tag: 'STRIPE_KEY' },
  { re: /ghp_[A-Za-z0-9]{36,}/g,                                         tag: 'GITHUB_PAT' },
  { re: /github_pat_[A-Za-z0-9_]{60,}/g,                                 tag: 'GITHUB_PAT' },
  { re: /xox[bpors]-[A-Za-z0-9-]{20,}/g,                                 tag: 'SLACK_TOKEN' },
  { re: /tr_(pat|prod)_[A-Za-z0-9]{20,}/g,                               tag: 'TRIGGER_TOKEN' },
  { re: /AKIA[0-9A-Z]{16}/g,                                             tag: 'AWS_ACCESS_KEY' },
  { re: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----/g, tag: 'PRIVATE_KEY' },
  { re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, tag: 'JWT' },
  { re: /[A-Za-z0-9+/]{60,}={0,2}/g,                                     tag: 'B64_BLOB' }, // catch-all for long base64 (incl. SSH key blobs); tune length if FP
];

const MAX_STRING_LENGTH = 4096; // truncate any string longer than this

function scrubValue(s: string): string {
  let out = s;
  for (const { re, tag } of SECRET_VALUE_PATTERNS) {
    out = out.replace(re, `[REDACTED:${tag}]`);
  }
  if (out.length > MAX_STRING_LENGTH) {
    out = out.slice(0, MAX_STRING_LENGTH) + `…[TRUNCATED:${out.length}b]`;
  }
  return out;
}

export function redactSecrets<T>(input: T): T {
  return walk(input, 0) as T;
}

const MAX_DEPTH = 32; // also fixes C3 walk-depth concern

function walk(v: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[REDACTED:DEPTH_LIMIT]';
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return scrubValue(v);
  if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERNS.some((p) => p.test(k))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = walk(val, depth + 1);
      }
    }
    return out;
  }
  return v;
}
```

**Required tests** (new file `lib/ops-inbox/__tests__/redactSecrets.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../redactSecrets';

describe('redactSecrets — value-aware scrubbing (C2)', () => {
  it('redacts Stripe key in nested string value', () => {
    const input = { data: { event: { message: 'crashed with sk_live_abc123def456ghi789jkl012mno345' } } };
    const out = redactSecrets(input) as any;
    expect(out.data.event.message).toContain('[REDACTED:STRIPE_KEY]');
    expect(out.data.event.message).not.toContain('sk_live_abc');
  });

  it('redacts GitHub PAT in array element', () => {
    const out = redactSecrets({ logs: ['env GH_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'] }) as any;
    expect(out.logs[0]).toContain('[REDACTED:GITHUB_PAT]');
  });

  it('redacts SSH private key block', () => {
    const block = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----';
    const out = redactSecrets({ stderr: block }) as any;
    expect(out.stderr).toContain('[REDACTED:PRIVATE_KEY]');
  });

  it('truncates oversize strings', () => {
    const huge = 'a'.repeat(10_000);
    const out = redactSecrets({ msg: huge }) as any;
    expect(out.msg.length).toBeLessThan(5000);
    expect(out.msg).toContain('[TRUNCATED:');
  });

  it('respects depth limit', () => {
    let nested: any = 'leaf';
    for (let i = 0; i < 50; i++) nested = { next: nested };
    const out = redactSecrets(nested) as any;
    // somewhere in the chain there's [REDACTED:DEPTH_LIMIT]
    const str = JSON.stringify(out);
    expect(str).toContain('DEPTH_LIMIT');
  });

  it('still redacts key-pattern hits (regression for original behavior)', () => {
    const out = redactSecrets({ api_token: 'abc', x_auth_key: 'def' }) as any;
    expect(out.api_token).toBe('[REDACTED]');
    expect(out.x_auth_key).toBe('[REDACTED]');
  });

  it('does not redact normal text', () => {
    const out = redactSecrets({ message: 'user logged in' }) as any;
    expect(out.message).toBe('user logged in');
  });
});
```

**Verification after apply**:
1. `npm test` in `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` — new test file passes
2. Add to sg-deploy.sh test gate (already runs `npm test`)
3. Post-deploy: trigger synthetic Sentry payload via dogfood harness with embedded `sk_test_...` → SELECT raw FROM ops_incidents → confirm `[REDACTED:STRIPE_KEY]`

---

### Patch 3 — `GET /api/ops/repairs` role guard + audit_log column allow-list (C4) <a id="patch-3-get-repairs-role-guard--audit_log-column-allow-list-c4-"></a>

**Risk**: Low (additive auth, no schema change). **Apply**: any commit window. **Reversible**: trivial.

**Pre-flight**: confirm existing `RepairActions.tsx` and any other consumer doesn't depend on `audit_log` in list view (only detail view).

**Diff 1** — apply to `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, canModifyIncidentStatus, resolveOpsRole } from "@/lib/ops-role";
import { startRepairFromIncident } from "@/lib/repair-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === C4 fix: list view returns ALLOWED columns only, no audit_log ===
const LIST_COLUMNS = [
  'id', 'incident_id', 'source', 'client_slug', 'policy', 'state',
  'approved_by', 'approved_at', 'backup_status', 'backup_ref', 'backup_checked_at',
  'github_owner', 'github_repo', 'github_issue_number', 'github_issue_url',
  'github_pr_number', 'github_pr_url',
  'deploy_status', 'deploy_ref', 'deploy_checked_at',
  'risk_level', 'needs_human_review',
  'created_at', 'updated_at', 'archived_at',
].join(',');

export async function GET(request: Request) {
  // === C4 fix: require at minimum viewer-via-claims, not default_viewer fallback ===
  const resolved = resolveOpsRole(request);
  if (!canModifyIncidentStatus(resolved.role) || resolved.source === 'default_viewer') {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 100;

  const { data, error } = await supabase
    .from("repair_runs")
    .select(LIST_COLUMNS) // === C4 fix: no select("*"); explicit allow-list ===
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: "repair_runs_fetch_failed", details: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, runs: data ?? [], role: resolved.role });
}

// POST handler unchanged (already has canApproveCommand guard)
```

**Diff 2** — also apply truncation at write time in `lib/repair-center/backup.ts`:

```typescript
async function runRemoteScript(args: {
  label: "sg" | "eu";
  target: SshTarget;
  command: string;
}): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const conn = await connectSsh(args.target);
  try {
    const result = await sshExec(conn, args.command);
    return {
      ok: result.code === 0,
      // === C4 fix: 6KB → 500B, and run through scrubber on persist path ===
      stdout: result.stdout.slice(-500),
      stderr: result.stderr.slice(-500),
      code: result.code,
    };
  } finally {
    conn.end();
  }
}
```

**Verification after apply**:
1. `curl https://app.aware-wave.com/api/ops/repairs?limit=10` with no auth → 403 (was 200)
2. `curl https://app.aware-wave.com/api/ops/repairs?limit=10` with valid claims header → 200 but `runs[*]` does not contain `audit_log` field
3. Detail view `GET /api/ops/repairs/<id>` (if exists) still returns full row — confirm or document
4. Add new test case in audit harness (`scripts/audit-tools/dogfood-auto-repair.ps1`): assert 403 from unauth GET

---

## Phase 4 Closeout Recommendation

**Do NOT close Phase 4 observation on 2026-06-19 until C1, C2, C4, C5 are applied + verified.** _(Updated 2026-05-23 self-critic: C5 added to blocker list — it violates Plan §四 SSOT just as C1 violates §五; defer-as-product-decision was understated.)_

- C1 is the most exposing: any auto-repair PR landing in a regression scenario produces persistent prod degradation
- C2 is the leak amplifier: every other security finding rides on top of unredacted secrets
- C4 is the disclosure surface: combines with C2 to make payload-embedded secrets viewer-readable

**Suggested closeout sequence**:
1. Week 1 (2026-05-26 to 2026-05-30): Apply Patch 2 + Patch 3 (low-risk, additive). Verify via dogfood harness
2. Week 2 (2026-06-02 to 2026-06-06): Staging dry-run Patch 1 (sg-deploy rollback) + prod drill at low-traffic window
3. Week 3 (2026-06-09 to 2026-06-13): Address Major findings M1/M5/M6 + at least 3 Minors
4. Week 4 (2026-06-16 to 2026-06-19): Final dogfood harness pass; re-run this audit's static greps; close Phase 4 only if all 3 Criticals are 🔴 FIXED in AUDIT_REGISTRY

C3 (DoS body cap) and C5 (severity gate) need product owner decision before code:
- C3: confirm 256KB cap is acceptable for largest legitimate payload (largest Sentry event we've seen?)
- C5: decide whether the gate is a UI flag or pipeline stop (this audit recommends pipeline stop, but it changes operator workflow)

---

## Cross-References

- AUDIT_REGISTRY entry: [Auto-Repair logic audit (2026-05-23)](../../docs/operations/AUDIT_REGISTRY.md#auto-repair-logic-audit-2026-05-23)
- BUG_HUNT_PROTOCOL methodology: [BUG_HUNT_PROTOCOL.md](../../docs/operations/BUG_HUNT_PROTOCOL.md)
- Dogfood harness: [scripts/audit-tools/dogfood-auto-repair.ps1](../../../scripts/audit-tools/dogfood-auto-repair.ps1)
- WORKLOG entry: [WORKLOG.md 2026-05-23](../../WORKLOG.md)
- TASKS items (Critical A/B/C/D ready-to-apply): [TASKS.md](../../TASKS.md)
- Plan SSOT contracts violated:
  - C1 vs [plan v3.2 §五 第 3 層](../../../docs/awarewave-auto-repair-plan-v3.2-final.md)
  - C5 vs [plan v3.2 §四 Critical severity 閘門](../../../docs/awarewave-auto-repair-plan-v3.2-final.md)
  - M5 vs [plan v3.2 §六 備份驗證](../../../docs/awarewave-auto-repair-plan-v3.2-final.md)

## Evidence

### Live health endpoint snapshot (R0 [實測] action 1)

```
$ curl -fsSL https://app.aware-wave.com/api/ops/repairs/health
{
  "ok": true,
  "system_mode": "normal",
  "active_runs": 1,
  "table_ok": true,
  "backup_configured": true,
  "backup_mode": "ssh",
  "sg_backup_configured": true,
  "eu_backup_required": true,
  "eu_backup_configured": true,
  "backup_script_probe": { "sg": "ok", "eu": "ok" },
  "github_configured": true,
  "github_repo_target": { "owner": "awarewaveai-pei", "repo": "Work" },
  "github_repo_accessible": true,
  "github_push_access": true,
  "github_app_status": "unverified",
  "slack_signing_configured": true,
  "slack_interactive_ready": true,
  "policy_catalog_count": 6,
  "policy_catalog_text_ok": true
}
```

**Interpretation**: config-layer health is green. Every Critical finding (C1-C5) is **invisible to this endpoint** by design. This is the gap an audit fills.

### Dogfood harness output (R0 [實測] action 2)

```
$ powershell -ExecutionPolicy Bypass -File scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly
=== Auto-Repair dogfood drill — [AUDIT-2026-05-23] ===
[OK]   ok=true
[OK]   system_mode=normal
[OK]   table_ok=true
[OK]   backup_configured
[OK]   eu_backup_required+configured
[OK]   backup_script_probe.sg=ok
[OK]   backup_script_probe.eu=ok
[OK]   github_configured
[OK]   slack_signing_configured
[OK]   policy_catalog_text_ok
[WARN] github_app_status=unverified (cosmetic; functional path is github.token via workflow)
=== Summary: 10/10 invariants passed, 1 warn(s), 0 fail(s) ===
Exit code: 2 (warn — config OK; logic-layer findings flagged separately)
```

### Critic round summaries (R0 [抓蟲] action 3)

| Round | Scope | New findings beyond candidates | Files reviewed | Wall time |
|------|------|--------------------------------|----------------|-----------|
| 1 | Decision logic (policy / run-state / types / tests) | 4 (state-machine bypass, dead code helper, isTerminalState footgun, human_only inconsistency) | 6 | ~1.7 min |
| 2 | Webhook intake (5 routes + verify/redact/fingerprint/normalize/transition) | 8 (value-blind redact upgraded to Critical, DoS, fingerprint suppression, race, severity injection, env injection via hostname, posthog ordering, netdata silent CLEAR) | 13 | ~1.9 min |
| 3 | Orchestration + deploy (slack/service/backup/github/ssh + repairs/* routes + GHA + sg-deploy + migration) | 6 (Critical A grep evidence, GET role guard, persistence retry, path traversal, GHA Edit allow-list, javascript: URL) | 14 | ~2.7 min |

---

---

## Patch Errata (Self-Critic 2026-05-23)

After writing this report, operator demanded R0+R4 [驗證計畫] 4-action discipline applied to the **audit deliverables themselves** (not just the audited Auto-Repair system). A separate `critic` subagent reviewed this report + AUDIT_REGISTRY section + dogfood harness + AGENTS.md trigger row. Verdict: **conditional yes — findings are factually accurate, but patches need 5 Major + 7 Minor fixes before apply**. This Errata records them.

### 🟠 Major patch defects (MUST fix before applying any patch)

| ID | Affects | Issue | Required fix |
|----|---------|-------|--------------|
| **EMaj-1** | [§Patch 2 redactSecrets](#patch-2-redactsecrets-value-aware-scrubber-c2-) | `B64_BLOB` regex `/[A-Za-z0-9+/]{60,}={0,2}/g` will match legitimate base64 in Sentry payloads (minified JS in stack frames, source-map content, PostHog `$screenshot` data URIs, GitHub workflow log excerpts). Post-fix `raw_payload` becomes unreadable; operators will revert | Gate `B64_BLOB` behind `OPS_AGGRESSIVE_REDACT=true` env flag (default off), OR raise threshold to 200+ chars AND require a prefix anchor (e.g., must follow `key=`/`token=`/PEM header). Add positive-case unit test using a real Sentry sample |
| **EMaj-2** | [§Patch 1 sg-deploy rollback](#patch-1-sg-deploysh-smoke-fail--rollback-c1-) | `rollback-phase1.sh restore <APP>` requires a prior `save` snapshot; my patch never calls `save` during deploy. **First auto-rollback will fail** because no snapshot exists. Plus `APPS` may include services (`redis`, `nginx`) outside `IMAGE_MAP={wordpress,node-api,next-admin}` — restore would error on those | (a) sg-deploy.sh must call `./scripts/rollback-phase1.sh save <APP>` between current Step 2 (rsync) and Step 3 (build) for every APP in IMAGE_MAP; (b) auto-rollback loop must filter `APPS` against `IMAGE_MAP` keys OR `rollback-phase1.sh restore` must be no-op tolerant for unknown services |
| **EMaj-3** | [§Patch 3 GET role guard](#patch-3-get-repairs-role-guard--audit_log-column-allow-list-c4-) | `canModifyIncidentStatus` returns true for **viewer** too ([ops-role.ts:78-79](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-role.ts#L78-L79) explicit "includes viewer"). My patch claims role guard tightens access, but actually any `claims-role: viewer` request still passes. The **real** fix is the `LIST_COLUMNS` allow-list dropping `audit_log` | Reframe Patch 3: **primary fix = column allow-list** (sufficient for leak prevention); **secondary fix = guard `source !== 'default_viewer'`** (defense-in-depth for legacy paths). Update C4 prose at report line 107 to reflect this |
| **EMaj-4** | [§Patch 2 MAX_DEPTH=32](#patch-2-redactsecrets-value-aware-scrubber-c2-) | Sentry `exception.values[].stacktrace.frames[].vars` legitimately nests 20-40 deep on React + Redux + middleware crashes. 32 will silently corrupt real payloads. The depth cap was conflated with C3 byte-size concern — different problems | Raise to `MAX_DEPTH = 64` and run against a real production Sentry sample before merge. Also: don't claim this "also fixes C3" — C3 is body bytes, not nesting depth |
| **EMaj-5** | [AGENTS.md trigger row 141](../../AGENTS.md) | Path patterns were written without monorepo prefix (`lib/repair-center/*` instead of `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/*`). Claude sees absolute paths via `Edit`'s `file_path` — short patterns will never match → **trigger rule never fires = dead rule** | Already fixed in same commit: AGENTS.md row 141 now uses full paths + glob anchors. Verify by greping the rule for `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` prefix on all listed paths |

### 🟡 Minor patch defects (recommended)

| ID | Affects | Issue | Status |
|----|---------|-------|--------|
| **EMin-1** | [dogfood-auto-repair.ps1:77-82](../../../scripts/audit-tools/dogfood-auto-repair.ps1) | Used 🔴 🟠 emoji in `$logicReminders` — renders as `??` in CP950 console; **violates the audit harness's own audit class** (`AUDIT_REGISTRY §CP950 / encoding-trap audit`). Iron-rule violation by the audit deliverable | ✅ FIXED in same commit: emoji → `[CRIT]` / `[MAJ]` ASCII tags |
| **EMin-2** | [dogfood-auto-repair.ps1:34-38](../../../scripts/audit-tools/dogfood-auto-repair.ps1) | `try/catch` on `Invoke-RestMethod` only catches first call; if endpoint returns non-JSON 200 (Cloudflare interstitial, gateway HTML), `$health` is a string and `$health.ok` is `$null` — all invariants silently fail | ✅ FIXED in same commit: added malformed-response guard after the try/catch block |
| **EMin-3** | [dogfood-auto-repair.ps1 invariant loop](../../../scripts/audit-tools/dogfood-auto-repair.ps1) | `& $inv.Test` throwing exception doesn't increment `FailCount` — silent skip | ✅ FIXED in same commit: wrapped invariant test in `try/catch`, exception → Write-Fail |
| **EMin-4** | AUDIT_REGISTRY §🛠 TOOL list | Lists "AGENTS.md trigger" as a tool but the trigger was added in the same change — circular self-reference. Cosmetic | Cosmetic, left as-is |
| **EMin-5** | Report ✓ Verified Clean vs 🔵 escalate `actor` granularity note | "Verified Clean" sweeps `actor` identity concern under "gated by canApproveCommand"; but the 🔵 note flags actor-identity as separate concern. Internal contradiction | Acknowledged: route-layer auth is clean; audit-trail identity granularity is a separate Minor concern (left for next audit cycle) |
| **EMin-6** | Report 4-Action Evidence table line "Critic × 3 rounds independently validated candidates A/B/C/D/E/F" | Candidates A-F never enumerated in report — external reference future readers cannot reconstruct | Note: candidates A-G were the main agent's preliminary findings before critic spawn (see [§現況分析] in operator-facing conversation transcript); they map to C1 (A), B (M2), C5 (C), M5 (D), C4 (E), m1/M6 (F), G (m1 dead code) |
| **EMin-7** | [§Patch 1 line 244](#patch-1-sg-deploysh-smoke-fail--rollback-c1-) `echo "$DEPLOYED_COMMIT" > ...` | Variable `$DEPLOYED_COMMIT` was never assigned in the patch — would echo empty string | **Must fix in patch before apply**: `DEPLOYED_COMMIT=$(git -C "$REPO_DIR" rev-parse HEAD)` before the smoke gate, or reuse existing inline `$(git rev-parse HEAD)` expression from sg-deploy.sh line 138 |

### Phase 4 closeout blocker list (revised)

Original report said C1+C2+C4 must apply before 2026-06-19 closeout. **Self-critic recommends adding C5** — C5 violates Plan §四 SSOT contract just like C1 and M5 violate §五 and §六; should not be deferred as "product decision needed". C3 stays as "needs product owner decision on 256KB cap".

**Revised closeout blocker list**: **C1 + C2 + C4 + C5 must be 🔴 FIXED before Phase 4 closes.** C3 can defer pending product-owner decision on payload size cap.

### Verdict on overall audit quality

Critic confidence rating: **conditional yes**. Findings are factually accurate (spot-checked C1/C2/C4/C5/M5/M8 all reproduce against source). But patches as-shipped contain 5 Major design defects. **Do not apply any patch from this report until the Errata above is folded in.**

---

_Audit completed 2026-05-23 by Claude in single session._
_Self-critic (R0+R4 iron rule) completed same day; Errata appended above._
_Cross-machine: this report lives in repo, syncs via `git pull` to both work machines._
_Next audit: any subset of findings re-runs via `scripts/audit-tools/dogfood-auto-repair.ps1` + targeted critic re-review. **Patches require Errata fixes before apply**._
