# Monthly Review — 2026-07 (Full Month)

**Generated**: 2026-08-01  
**Agent**: remote-monthly-agent  
**Coverage**: 2026-07-01 → 2026-07-31  
**Health score at last closeout**: 100% (362/362, 2026-07-05)  
**Governance drift overall**: SKIPPED (no PowerShell in Linux container — estimated WARN, see §4)  
**Note**: Supersedes the partial report generated 2026-07-03, which only covered July 1–3.

---

## §1 Executive Summary

July 2026 was a **tale of two halves**: a high-output first week (July 1–5, operator present) followed by 26 days of automated monitoring and one targeted remote fix session.

**July 1–5** delivered the month's headline work: hook architecture v2, WORKLOG rotation productionization, Phase 4 governance rules mechanization, S2+S5 IDOR closure, cold outreach T11 integration, Stage 2/3/4 one-click provisioning, AI Video Director Phase 0, ClickHouse OOM root fix, and n8n Stage 2 bridge completion. The operator left for travel on July 6 with all systems at 100% health.

**July 6–19, 21–31**: No operator activity. Zero human sessions. All systems idle. Three consecutive auto-generated weekly summaries confirmed continuous no-activity status.

**July 20** (automated remote session): A remote agent independently fixed 7 critic findings in the video API (role gates, SSRF, upsert conflict guard, duration slider regression), ran npm audit (high=3→0), and authored DB migration 0060 (`media_assets.object_key` unique index). This session was not in the original task list — it was autonomous quality work by the remote agent.

The system enters August with no blocking issues but two pending high-priority items requiring operator action immediately on return: migration 0060 (EU SSH apply) and the Defender trojan postmortem (45+ days overdue).

---

## §2 Accomplishments

### July 1–5, 2026 (Operator Present)

#### Infrastructure & Governance
- **Hook architecture v2**: `runner.js` single-runner + `rules.manifest.json` + 26 pure rule modules. 54/54 tests. Remote container wiring via `scripts/wire-remote-hooks.sh`. Replaced fragile per-hook shell wiring inherited from v1.
- **WORKLOG rotation**: `scripts/rotate-worklog.mjs` — fence-aware, idempotent, atomic. Rotated 15,708 → 8,356 lines; 108 blocks preserved; archives under `WORKLOG-archive/`.
- **Phase 4 rules mechanization**: `deploy-guard`, `VBC-reminder`, `vault-hint` rules added to hook v2. 60/60 tests passing.
- **Junk file cleanup**: 11 zero-byte tracked files removed; `scripts/checkpoint-junk-guard.mjs` added to prevent recurrence.
- **Non-fast-forward AO-RESUME recovery**: `Invoke-NonFastForwardRecovery` helper + `ao-resume.md` Case B Step 0b mandatory first step. Closes the class of git state confusion on remote containers.
- **SG deploy drift**: verified closed (behind=0, no stale files).
- **n8n Stage 2 bridge completion** (2026-07-03): workflow `RbrHNu3BUEmpNWeT` active, e2e verified. Remaining: WP-side Fluent Forms install + form build + webhook feed + FluentCRM.
- **ClickHouse OOM root fix** (2026-07-05): mem_limit scaling applied in config; crash log confirmed clean post-fix. EU VPS ClickHouse stability observation period complete.
- **nginx revert + Turnstile hotfix** (2026-07-05): nginx config reverted after regression; Turnstile `build.args` hotfix pushed.
- **trigger-build CF hairpin fix** (2026-07-05): server-side Next.js route corrected from `new URL("/api/...", request.url)` to `http://container-name:3000` pattern. This anti-pattern is now documented as a known trust boundary in AGENTS.md.
- **human_only acknowledge feature**: new operator-acknowledgment flow for incidents requiring explicit human sign-off before auto-remediation.

#### Security
- **S2 batch-6**: content/drafts IDOR closed — `effectiveOrgId` + `assertOrgAccess` + `OrgAccessError` guard pattern applied to all draft routes.
- **S5**: social/integrations IDOR closed — 5 routes hardened.
- **Test org garbage**: 3 empty test orgs deleted from EU Supabase prod.

#### Platform Features
- **Cold outreach per-org routing** (T11 complete): Supabase per-org routing + outreach tab in `ClientHubTabs`.
- **Stage 2+3+4 provisioning**: quote CRUD (`app/api/onboarding/quote/route.ts`), Stage 4 server provision route (`app/api/provision/route.ts`), BuildConsole UI panel. Migration 0055 (`intake_quote`) applied to EU prod.
- **AI Video Director Phase 0**: `SceneSeries.tsx` backbone + `DynamicSlideshow.tsx` Remotion composition wrapper. 3 real renders verified (R2 storage).
- **Tourism onboarding**: 6-bug fix across manifests/shell/TS. `lobster-factory/packages/manifests/wp-tourism.json` added.
- **ops-inbox repair_runs fix**: root cause identified (missing `client_slug` column); migration 0056 authored — awaiting manual apply to EU Supabase. Applied: 0056 subsequently confirmed applied (migrations current through 0059 per weekly-automation-LATEST.md).
- **Paid plugins**: 16 zips uploaded to both SG + EU VPS `/root/plugins/`.

---

### July 20, 2026 (Remote Automated Session)

#### Video API Security — 7 Critic Findings Fixed

This session was **not operator-initiated** — the remote agent identified and fixed critical issues autonomously:

| # | Finding | Fix |
|---|---------|-----|
| 1 | Missing role gate on `/api/video/assets` | Added `assertOrgAccess` guard |
| 2 | Missing role gate on `/api/video/render` | Added `assertOrgAccess` guard |
| 3 | Missing role gate on `/api/video/scenes` | Added `assertOrgAccess` guard |
| 4 | SSRF vulnerability in video fetch | Allowlisted fetch + blocked private IP ranges |
| 5 | Duration slider — mutable state bug | Converted to derived computation (no direct mutation) |
| 6 | Reconcile regex incorrect | Fixed pattern matching |
| 7 | `recordVideoAsset()` upsert — no conflict guard | Added unique conflict guard (ON CONFLICT DO UPDATE) |

#### Other July 20 Work
- **npm audit fix** (`packages/workflows`): reduced high severity vulnerabilities from 3 → 0.
- **DB migration 0060 authored**: `media_assets.object_key` unique index — prevents duplicate video asset writes in `recordVideoAsset()` upsert. **Status: authored but NOT applied to EU prod.**
- **Weekly summary** `reports/weekly/weekly-summary-2026-07-20.md` generated.

---

### July 6–19 and July 21–31 (No Activity)

No operator sessions. No code changes. No deployments. Three consecutive weekly automation summaries (07-13, 07-20, 07-27) confirmed idle status. Operator confirmed traveling; expected return: August 2026.

---

## §3 Open Tasks — Top 10 Priorities

| # | Task | Status | Urgency | Blocker |
|---|------|--------|---------|---------|
| 1 | `/health` + `/smoke-test` on SG + EU VPS | Immediate | 🔴 | 26 days no monitoring — first action on return |
| 2 | Migration 0060 apply to EU Supabase prod | Ready | 🔴 | SSH into EU VPS; `recordVideoAsset()` upsert at risk until applied |
| 3 | Defender trojan postmortem | **45 days overdue** | 🔴 | Target was 2026-06-17; temp file cleanup + scheduled task audit + hook hardening all pending |
| 4 | EU→Dedicated server migration | Gated | 🟠 | August target; FSN i7-7700/64GB/2×512SSD ~€48.70; operator card required; §7 runbook gate 5 items |
| 5 | Customer Service U6 Chatwoot | Gated | 🟠 | Depends on dedicated server purchase; U0–U5 software layer live on prod |
| 6 | Stage 4 one-click provisioning unlock | Gated | 🟠 | Needs `HETZNER_STAGING_TOKEN` (vault empty) + `SG_PROVISION_ENABLED` + `LOBSTER_EXECUTE_MANIFEST_STEPS` + `HETZNER_STAGING_ENABLED` + sg-deploy |
| 7 | Cold Outreach T10 Gmail OAuth | Gated | 🟡 | High-risk; T1–T9/T11/T12 complete; needs explicit operator go-ahead |
| 8 | POD Phase 4 real e2e + A2 confirm | Gated | 🟡 | Financial red-line gate; requires operator explicit approval |
| 9 | Canvas browser e2e test | Verification debt | 🟡 | Needs operator browser session; open since June |
| 10 | RoutingSpec/RoutingMatrix governance review | Drift risk | 🟡 | ~113 days stale (2026-04-10); FAIL threshold 180 days; estimated FAIL ~2026-10-07 |

---

## §4 Governance Drift

**Status**: SKIPPED — no PowerShell (`pwsh`/`powershell`) available in Linux remote container.

**Estimated state** (derived from `reports/governance/drift-2026-06.md`, generated 2026-06-03, + elapsed time calculation):

| Check | Estimated Status | Detail |
|-------|-----------------|--------|
| `mcp_set_consistency` | WARN | 9 MCPs in inventory not in RoutingSpec (unchanged since June) |
| `routing_spec_mtime` | WARN | `MCP_TOOL_ROUTING_SPEC.md` last touched 2026-04-10 — now **~113 days** stale |
| `routing_matrix_mtime` | WARN | `ROUTING_MATRIX.md` last touched 2026-04-10 — now **~113 days** stale |
| Overall | **WARN** | No FAIL-level issues yet; approaching FAIL threshold |

**Trajectory**: RoutingSpec/RoutingMatrix at ~113 days (up from 84 days in July report). FAIL fires at 180 days → estimated FAIL date: **~2026-10-07**. At current pace the docs will fail governance check before the next operator quarterly review. **Action required in August**: run a RoutingSpec/RoutingMatrix review — this was also recommended in the July 3 report and was not completed.

---

## §5 System Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Health score at last closeout | 100% (362/362) | 2026-07-05; **26 days ago** |
| SG VPS (`5.223.93.113`) | ⚠️ Unverified | Last confirmed healthy 2026-07-05 |
| EU VPS (`204.168.175.41`) | ⚠️ Unverified | ClickHouse OOM fixed 2026-07-05; 26 days no check |
| Supabase (EU) | ✅ Last known healthy | Migrations 0001–0059 applied; 0060 pending |
| DB migrations applied (EU prod) | 0001–0059 | 0060 authored; manual apply needed |
| Hook v2 test coverage | 54/54 + 60/60 | Phase 4 rules included |
| Open IDOR surfaces | 0 | S1–S5 complete |
| Video API critic fixes | 7 | July 20 remote session |
| npm audit high vulns (workflows) | 0 | Down from 3 (July 20) |
| Operator sessions in July | 1 human + 1 auto | Human: July 1–5; Auto: July 20 |
| Days without human session | 26 | As of 2026-08-01 |
| Blocking issues | 0 | (2 urgent pending-operator items) |
| Stage 4 provisioning | 🟡 Gated | Code complete; env flags + token needed |

---

## §6 Knowledge & Memory (Key Decisions This Month)

1. **CF hairpin anti-pattern** (2026-07-05): Server-side Next.js must never call `new URL("/api/...", request.url)` for Docker-internal communication. Use `http://<container-name>:3000` instead. Documented in AGENTS.md trusted boundaries.

2. **Stage 4 five-condition gate**: `HETZNER_STAGING_TOKEN` (vault currently empty) + `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy. All five must be set simultaneously.

3. **n8n Stage 2 bridge completion**: Workflow `RbrHNu3BUEmpNWeT` is active and e2e verified. Remaining WP-side work: Fluent Forms plugin install → build form → configure webhook feed → link FluentCRM.

4. **ClickHouse OOM pattern** (2026-07-05): Root fix was mem_limit scaling in config. Previous workarounds (container restarts, crash log cleanup) were symptomatic. Version remains locked at 25.7.x — do NOT upgrade to latest/24.x.

5. **Remote hook wiring** (2026-07-02 audit): Remote containers have zero mechanical gates until `bash scripts/wire-remote-hooks.sh` is run at session start. Hooks wire once per container; subsequent sessions in same container inherit. Should be added to setup script for Claude web environments.

6. **Video API security pattern** (2026-07-20): Role gate = `assertOrgAccess(orgId, userId)` before any video operation. SSRF protection = allowlisted `fetch()` with private IP range block. Upsert conflict guard = `ON CONFLICT (object_key) DO UPDATE`.

7. **migration 0060 necessity** (2026-07-20): Without the unique index on `media_assets.object_key`, `recordVideoAsset()` upsert silently falls back to INSERT — creating duplicate video history rows. Apply immediately on return.

---

## §7 Risks & Recommendations

| Risk | Severity | Status | Action |
|------|----------|--------|--------|
| Defender trojan `Trojan:Win32/PowhidSubExec.B` postmortem | 🔴 High | **45 days overdue** (target 2026-06-17) | Priority 1 on operator return; temp file cleanup + scheduled task audit + hook hardening |
| migration 0060 not applied | 🔴 Functional | Duplicate video asset risk | SSH EU VPS and apply immediately — one `psql` command |
| 26 days no VPS monitoring | 🟠 Major | SG + EU VPS status unknown | Run `/health` + `/smoke-test` as first action on return |
| POD A2 financial gate | 🟠 Major | A2 webhook dormant | Operator explicit approval required before any payment flow testing |
| S2 multi-tenant isolation (IDOR hardening) | 🟠 Major | ~20 IDOR issues documented; S1 done, S2–S5 not applied | Schedule S2–S5 after server migration |
| Stage 4 one-click provisioning | 🟠 Major | Code complete; vault token empty | Obtain HETZNER_STAGING_TOKEN; set 3 env flags; get operator go-ahead |
| EU→Dedicated migration | 🟡 Gated | August target | Operator card purchase required; 5 §7 runbook checklist items |
| RoutingSpec/RoutingMatrix drift | 🟡 Drift | 113 days; FAIL at 180 | Review must happen before mid-October or governance check will FAIL |
| npm moderate vulns | ℹ️ Accepted | 18 moderate via @trigger.dev/sdk opentelemetry chain | Awaiting upstream fix; not actionable |

---

## §8 Comparison vs. Previous Monthly (2026-07-03)

**Previous priorities for August — status as of 2026-08-01:**

| Prior Priority | Outcome |
|----------------|---------|
| EU→Dedicated server migration | ❌ Not started — gated, August target still |
| Customer Service U6 Chatwoot | ❌ Not started — gated on dedicated server |
| Stage 2 n8n Fluent Form bridge completion | ✅ Completed 2026-07-03 (workflow active, e2e verified) |
| wp-bridge `/product` dry_run + monetization | ❌ Not started |
| soulfulexpression.org DNS → Cloudflare | ❌ Not started |
| RoutingSpec/RoutingMatrix governance sync | ❌ Worsened — 84 days → 113 days stale |
| Cold Outreach T10 Gmail OAuth | ❌ Still gated — no operator go-ahead received |
| AI Video Director Phase 1 | 🔄 Phase 0 delivered (3 renders verified); Phase 1 not yet started |

**Net**: 1 of 8 August targets completed (n8n bridge). The remaining 7 carry forward. The operator's travel absence (July 6–31) was the primary constraint.

---

## §9 Next Month Focus (2026-08) — Ranked by Urgency

1. **[IMMEDIATE] System health check**: `/health` + `/smoke-test` on SG + EU — first action on return (26 days unmonitored)
2. **[IMMEDIATE] migration 0060**: SSH EU VPS, apply unique index on `media_assets.object_key`
3. **[URGENT] Defender trojan postmortem**: 45+ days overdue — temp cleanup, scheduled task audit, hook hardening
4. **[HIGH] EU→Dedicated server migration**: Purchase FSN i7-7700 (~€48.70/mo), run migration runbook §7 checklist
5. **[HIGH] CS U6 Chatwoot**: Post-dedicated server — connect Chatwoot to prod once hardware is in place
6. **[MEDIUM] Stage 4 provisioning unlock**: Obtain HETZNER_STAGING_TOKEN + set 3 SG env flags → get operator go-ahead
7. **[MEDIUM] RoutingSpec/RoutingMatrix governance review**: 113 days stale — review needed before October or governance FAIL
8. **[MEDIUM] soulfulexpression.org → Cloudflare**: DNS migration (Hostinger → CF DNS first, registrar later)
9. **[MEDIUM] wp-bridge `/product` dry_run**: `RestController:167` + bump `AWBRIDGE_VERSION` + release flow
10. **[CONDITIONAL] Cold Outreach T10 Gmail OAuth**: If operator issues go-ahead — T1–T9/T11/T12 already complete

---

_Generated by remote-monthly-agent on 2026-08-01. Source files: TASKS.md (partial, lines 1–179), WORKLOG.md (July entries via grep + targeted reads), CONVERSATION_MEMORY.md, integrated-status-LATEST.md, weekly-automation-LATEST.md (2026-07-27), daily/2026-07-05.md, daily/2026-07-20.md, daily/2026-07-31.md, monthly-review-2026-07.md (prev, 2026-07-03), drift-2026-06.md. Governance drift script skipped (no PowerShell in Linux container)._
