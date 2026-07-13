# Weekly Summary 2026-07-13

**Period**: 2026-07-07 → 2026-07-13
**Generated**: 2026-07-13 01:06 UTC (remote weekly-agent)

---

## Completed this week

**No operator sessions recorded this week (2026-07-07 – 2026-07-13).**

The operator is on planned travel (noted as upcoming in the 2026-07-06 weekly). Daily notes for 07-07 through 07-13 all contain empty "Done today / Current state / Next steps" placeholders. The WORKLOG contains no entries after the 2026-07-06 remote-weekly-agent entry. System has been idle for 7 days.

Last completed work (reference — carried from prior week):
- Phase 4 `/intake` public form + `(shell)/(public)` route group refactor (commit `915245b0`)
- Phase 5 Cloudflare Turnstile integration (commit `6306cd8e`)
- EU VPS ClickHouse OOM root-fix: mem_limit 1536m→3072m, 20GB crash logs cleared (commit `00ea2e03`)
- fix(trigger-build): CF hairpin → `http://next-admin:3000` + fetchWithRetry (commit `11886d04`)
- migration 0059 repair_runs_source_check added 'deploy' value (commit `b1d555e6`)
- Ops Inbox acknowledge route for human_only incidents (commit `70b17903`)
- Mongolia tourism client handoff docs ×4 (commits `ef71b328`–`8d642e77`)

---

## Open tasks

### 🔴 Critical / High Priority

- **【資安複盤 OVERDUE】Defender 木馬 `Trojan:Win32/PowhidSubExec.B` 善後** — Target was 2026-06-17; now **26 days overdue**. Temp file cleanup + scheduled task verification + hook hardening still outstanding.
- **POD A2 金流紅線** — A2 draft-only pipeline is LIVE but dormant; confirm/auto-fulfill phase not designed; requires explicit operator approval before any work begins.

### 🟠 Gated / Awaiting Operator Action

- **一鍵架站 Stage 4 開閘** — Code complete + idle verified (2026-07-03); needs `HETZNER_STAGING_TOKEN` in vault + SG .env 3 flags + sg-deploy (High/billable, awaits go-ahead)
- **EU → Dedicated 搬機 + 退雲端** (gated 8月): FSN i7-7700/64GB/2×512SSD ~€48.70; operator card-swipe required
- **CS U6 Chatwoot** (gated 8月): U0–U5 software layer live; Chatwoot wiring awaits dedicated machine
- **POD Phase 4 true e2e**: operator browser session to create real Woo+Printful product
- **Cold Outreach Workbench T10**: Gmail per-org OAuth (gated High-risk; T1–T9+T11+T12 all complete)

### 🟡 Human-Only Tasks

- Postiz OAuth apps: Meta/IG+FB, Reddit, LinkedIn (platform App Review required)
- Postiz test draft cleanup: delete `cmqo1wijz0005p58ncl1mtssr` from postiz.aware-wave.com
- Postiz → Client Hub account link (Bluesky → client slug social tab)
- Canvas full browser e2e: Undo/Redo, genfill, Posterize, group/ungroup (validation debt)
- soulfulexpression.org → Cloudflare DNS migration (confirm Hostinger billing line items first)
- Termius mobile SSH setup + cheat sheet (pre-travel requirement — **may now be past due**)

### Infrastructure

- Hetzner dispatcher pre-launch: M10 orphan reaper + partial index (before enabling `LOBSTER_EXECUTE_*`)
- Hetzner one-click hosting embed into app.aware-wave.com (Phase 5, recipe at `hosting/EMBED_PROVISION_INTO_APP.md`)
- smoke test `04-onboard` spec: needs app session login step
- `app.aware-wave` onboarding/provisioning IA restructure (Phase 1 ops-console retirement)
- **Company desktop**: Cloudflare vault token fix (`cfut_` → `cfat_` + `CLOUDFLARE_ACCOUNT_ID`) + SystemGuard re-register

### Security / Auto-Repair

- S2 multi-tenant enforcement: ~20 IDOR sites documented in `MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md`; S1 done, S2–S5 not yet applied
- Auto-Repair M2 per-source HMAC + M4 fingerprint (Batch 3 complete; Phase 2 rollout pending)

### Content / Tools

- Content Engine: RSS block + second-batch sources; `ContentStudio.tsx:1112` hardcoded source list
- SEO/GEO Soulful: real data (EdD/price/IG/citations) needed before articles publishable
- Image Output Pipeline: Tarot/POD color grading → WebP/CMYK PDF (Phase 1.5/2 remaining)
- TASKS `[x]` auto-archive + duplicate detection gate (`archive-completed-tasks.ps1`, R0 plan A approved)
- Mockup Studio diagnosis: server-side healthy; awaiting operator to provide symptom details

### wp-bridge

- `/product` dry_run support (`RestController:167`; bump AWBRIDGE_VERSION + release flow)
- Featured image sideload + update-existing-post + product update/delete
- wp-bridge → app.aware-wave.com Ops Dashboard + commercialize

### Clients / Sites

- Soulful Expression Art Therapy: Day 1 account handover (pending operator)
- Scenery Travel Mongolia: new site Day 1 + Day 2 (pending client card + domain confirmation)
- Next-Gen pilot: cloud staging acceptance (2 projects)

---

## System health

| Component | Status | Notes |
|-----------|--------|-------|
| SG VPS (`5.223.93.113`) | ✅ Last known healthy | Health 100% as of 2026-07-05; no sessions since to verify current state |
| EU VPS (`204.168.175.41`) | ✅ Last known healthy | ClickHouse OOM root-fixed 2026-07-05; all 9 containers Up+healthy at last check |
| Supabase (EU) | ✅ Last known healthy | Migrations through 0059 applied |
| Hook system v2 | ✅ Deployed | 54/54 tests; remote wiring script ready |
| next-admin (SG) | ✅ Last known live | Turnstile baked in; 599 tests; `(shell)/(public)` route groups |
| Auto-Repair | ✅ A1+A2+A3 | Self-healing engine operational |
| Provisioning pipeline | 🟡 Stage 4 gated | Stages 0–3 complete; Stage 4 awaits token + env flags + go-ahead |
| Health gate (last close) | ✅ 100% | 2026-07-05 362/362 |
| Operator status | 🟡 Traveling | No sessions 2026-07-07 to 2026-07-13; return expected ~August |

> ⚠️ No health checks have run since 2026-07-05. EU VPS ClickHouse stability window (3–5 days post-fix) has elapsed unmonitored. Recommend running `/health` + `/smoke-test` upon operator return.

---

## Risks & blockers

| Risk | Severity | Status |
|------|----------|--------|
| Defender 木馬資安複盤 | 🔴 High | **26 days OVERDUE** (target 2026-06-17); temp file + scheduled task + hook audit not done |
| POD A2 金流紅線 | 🔴 Critical | No automation before human explicit approval; confirm phase not designed |
| No monitoring during travel | 🟠 Major | 7-day idle window; EU VPS ClickHouse unmonitored post-OOM fix; SG drift unknown |
| S2 multi-tenant enforcement | 🟠 Major | ~20 IDOR items; S1 done, S2–S5 not yet applied |
| Stage 4 一鍵架站 | 🟠 Major | Code complete; blocked on `HETZNER_STAGING_TOKEN` + operator go-ahead |
| EU→Dedicated migration | 🟡 Gated | 8月; operator card-swipe; EU 8GB RAM insufficient for Chatwoot |
| Termius SSH pre-travel setup | 🟡 Possibly missed | Was listed as "before travel" requirement; unconfirmed if done |
| soulful blog images lost | ℹ️ Accepted | 2 images permanently lost; client may notice (accepted tradeoff 2026-06-28) |

---

## Memory highlights

- **Operator on travel**: System has been idle since 2026-07-06. No commits or sessions recorded 2026-07-07 through 2026-07-13. Expected return ~August for EU dedicated server purchase and CS U6 Chatwoot wiring.
- **Intake flow decision**: `/start/` → `/intake` React form redirect was built and reverted (2026-07-05). Authoritative path remains: FluentForm → MySQL+FluentCRM → webhook → Supabase → trigger-build. The `/intake` form exists as an alternative but is gated OFF.
- **CF hairpin pattern**: Never use `new URL("/api/...", request.url)` in server-side Next.js for intra-Docker calls. Always use `http://<container-name>:3000`.
- **ClickHouse OOM pattern**: System log TTL (7d/14d/30d) never ran because OOM killed ClickHouse before TTL could execute. Fix: raise mem_limit first → manually delete log dirs → TTL resumes normally.
- **Stage 4 gate requires 5 conditions**: `HETZNER_STAGING_TOKEN` (vault currently empty) + `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy.
- **Hook v2 SSOT**: `runner.js` + `rules.manifest.json` — 26 pure rule modules. `bash scripts/test-hooks.sh` is canonical verification. `scripts/wire-remote-hooks.sh` must be run in each new remote container.
- **WORKLOG rotation**: `rotate-worklog.mjs` runs at AO-CLOSE when >15k lines. Archives to `WORKLOG-archive-YYYY-MM.md`.
