# Weekly Summary 2026-07-06

**Period**: 2026-06-30 → 2026-07-06
**Generated**: 2026-07-06 01:02 UTC (remote weekly-agent)

---

## Completed this week

### 2026-07-02 — Governance Overhaul + Security Hardening (Massive Session)

**Hook Architecture v2 (strangler migration)**
- Full governance audit: 10-point mechanical gate injection test; discovered remote container had zero hook wiring
- Rewrote 23 old hooks → single `runner.js` + `rules.manifest.json` (26 pure rule modules + `lib/{shared,flags}.js`)
- 54/54 hook tests pass (`bash scripts/test-hooks.sh`)
- Phase 4 three rules mechanized: deploy-guard / VBC-reminder / vault-hint (60/60 tests)
- `scripts/wire-remote-hooks.sh` → `.claude/settings.local.json` (remote container hook wiring; previously zero governance in remote sessions)

**Security batch S1–S5 multi-tenant role gates**
- S3: role gates on video/workflow-runs/integrations routes (tsc 0, critic Deep 0C/0M)
- S4: `ops/clients` role gate + repairs org filter (tsc 0, 568 vitest PASS)
- S5: social-publish/integrations/social-admin/social-channels (tsc 0, 568 vitest, critic Deep 0C/0M)

**Provisioning pipeline (one-click site builder)**
- ✅ Stage 2 n8n bridge complete (workflow `RbrHNu3BUEmpNWeT` active, e2e verified)
- ✅ Stage 3 program + migration 0055 applied
- ✅ Stage 4 program complete + idle verified (gate: HETZNER_STAGING_TOKEN + SG env flags, High risk, awaits go-ahead)
- 6-bug provisioning fix: manifests+shell+TS verified (tsc clean, bash -n OK, DRY_RUN e2e PASS)

**Maintenance**
- WORKLOG monthly rotation: `rotate-worklog.mjs` (fence-aware/idempotent/atomic) 15,708 → 8,356 lines, 108 blocks conserved
- Garbage file cleanup: 11 zero-byte tracked files removed; `/nul` added to `.gitignore`
- critic Deep review: 5 Major/Medium all fixed (rotate fence false positive, non-atomic write, junk guard quotePath fix, rm -Rf variant, commit-tree false block)
- Governance docs: AGENTS.md new §規則優先序 (C1–C4 resolution) + §已知信任邊界; TOOL_TRIGGER_MAP §Hooks rewrite + D1–D5 drift corrections

### 2026-07-03 — Auto-Repair Major Upgrade

- Auto-Repair three major upgrades: A1 evidence engine + A3 closed-loop + A2 Remediation executor
- System upgraded from "automated paperwork" to self-healing capable
- 22 new tests all pass, critic Deep pass, npx tsc 0 errors

### 2026-07-04 — Onboarding Public Portal + Infrastructure Fixes

**One-click Site Builder public intake**
- ✅ Phase 4 `/intake` public form + Next.js `(shell)/(public)` route group refactor (commit `915245b0`)
- critic security closure: 2 Critical + 2 Major all fixed (gate logic, rate limit, SSRF)
- 599/599 vitest PASS

**Database / Infrastructure**
- fix(db): migration 0059 `repair_runs_source_check` added `'deploy'` value (b1d555e6) — resolved all deploy-source incident 409 errors
- fix(repair-center): `human_only` incident changed to display "已知悉" button → direct acknowledge/close without creating repair_run (70b17903)
- fix(onboarding): FluentForm select/checkbox rendering + n8n bridge deactivated (multiple commits)

### 2026-07-04/05 — Turnstile + EU VPS Emergency + Client Handoffs

**Security / UX**
- ✅ Phase 5 Cloudflare Turnstile integration (commit `6306cd8e`): gate logic Critical fix (prod bypass requires SECRET_KEY), frontend explicit render, token refresh on expiry
- nginx `/start/` → `/intake` redirect: built then reverted (44da8365) — restored original FluentForm → FluentCRM → Supabase → trigger-build intake design

**EU VPS Emergency**
- ✅ EU VPS ClickHouse OOM death spiral root-fixed (commit `00ea2e03`):
  - Root cause: mem_limit=1536m → OOM on startup → 2,344 container restarts → 20GB crash log accumulation
  - Fix: mem_limit 1536m → 3072m; deleted 20GB system log dirs; restarts=0, healthy at 9.63% mem
- ✅ fix(trigger-build): CF hairpin TCP failure → changed to `http://next-admin:3000` internal routing + fetchWithRetry (2 retries) + failed state reset (commit `11886d04`)
- ✅ MONGOLIA-03 intake_form status unlocked (manual PATCH: `building` → `spec_generated`)
- ✅ hotfix: SG docker-compose `build.args` added `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Turnstile widget now visible)

**Client Work**
- ✅ Mongolia tourism client handoff docs ×4 (on-site startup checklist, Cloudways plan, public key location, domain Namecheap) — commits `ef71b328`–`8d642e77`

---

## Open tasks

### 🔴 High Priority / Overdue

- **Defender 木馬資安複盤 `Trojan:Win32/PowhidSubExec.B`** — OVERDUE since 2026-06-17 (19 days); source trace + remediation still outstanding
- **POD A2 金流紅線** — A2 draft-only pipeline is LIVE but dormant; confirm/auto-fulfill requires human explicit approval before any code is written

### 🟠 Gated / Awaiting Operator Action

- **一鍵架站 Stage 4 開閘** — code complete + idle verified; needs `HETZNER_STAGING_TOKEN` in vault + SG .env 3 flags + sg-deploy (High risk, awaits go-ahead)
- **EU → Dedicated 搬機 + 退雲端** (gated 8月): FSN i7-7700/64GB/2×512SSD ~€48.70; operator card-swipe required
- **CS U6 Chatwoot** (gated 8月): software layer U0–U5 live; only connection wiring remains once dedicated machine purchased

### 🟡 Human-Only Tasks

- Postiz OAuth apps: Meta/IG+FB, Reddit, LinkedIn (platform App Review required)
- Postiz test draft cleanup: delete `cmqo1wijz0005p58ncl1mtssr` from postiz.aware-wave.com
- Postiz → Client Hub account link (Bluesky → client slug social tab)
- POD Phase 4 true e2e: operator browser session to create real Woo+Printful product
- Canvas full browser e2e: Undo/Redo, genfill, Posterize, group/ungroup (validation debt)

### Infrastructure

- soulfulexpression.org → Cloudflare DNS migration (confirm Hostinger billing line items first)
- SG production drift check (`/check-drift` → `/verify` → sg-deploy if needed)
- Hetzner dispatcher pre-launch: M10 orphan reaper + partial index (before enabling `LOBSTER_EXECUTE_*`)
- Hetzner one-click hosting embed into app.aware-wave (Phase 5, recipe ready at `hosting/EMBED_PROVISION_INTO_APP.md`)
- smoke test `04-onboard` spec: needs app session login step (currently fails without app auth)

### Security / Auto-Repair

- S2–S5 multi-tenant rollout: S1 identity layer shipped (2026-06-29); S2 = apply `assertOrgAccess` at route level (~20 documented IDOR items)
- Auto-Repair M2/M4/M7–M10 rollout (obs period ended 2026-06-19; scheduled, deferred)
- M2 per-source HMAC + M4 fingerprint (Batch 3 complete; Phase 2 rollout + Phase 3 constraint swap remaining)

### Content / Tools

- Content Engine: RSS block + second-batch sources/UI; 動態來源 UI (`ContentStudio.tsx:1112` still hardcoded)
- SEO/GEO Soulful: operator to fill real data (EdD/price/IG/citations) before articles publishable
- Image Output Pipeline: Tarot/POD color grading → WebP/CMYK PDF (Phase 1.5/Phase 2 remaining)
- TASKS `[x]` auto-archive + duplicate detection gate (`archive-completed-tasks.ps1`, R0 plan A approved)

### wp-bridge

- `/product` dry_run support (`RestController:167`)
- Featured image sideload + update-existing-post + product update/delete operations
- wp-bridge → app.aware-wave Ops Dashboard + commercialize

### Clients / Sites

- Soulful Expression Art Therapy: Day 1 account handover (pending operator)
- Scenery Travel Mongolia: new site Day 1 + Day 2 (pending client card + domain confirmation)
- Next-Gen pilot: cloud staging acceptance (2 projects)
- Termius mobile SSH setup + cheat sheet (pre-travel requirement — operator travel upcoming)

### Company Desktop (Backlog)

- Cloudflare vault token fix (`cfut_` → `cfat_` + add `CLOUDFLARE_ACCOUNT_ID`)
- SystemGuard re-register (fix red-flash window)

---

## System health

| Component | Status | Notes |
|-----------|--------|-------|
| SG VPS (`5.223.93.113`) | ✅ Healthy | Health 100% (as of 2026-07-05); Turnstile widget live; /intake form deployed |
| EU VPS (`204.168.175.41`) | ✅ Healthy | ClickHouse OOM root-fixed (restarts=0, 9.63% mem); all 9 containers Up+healthy |
| Supabase (EU) | ✅ Healthy | Migrations 0059 applied; repair_runs source check complete |
| Hook system v2 | ✅ Deployed | 54/54 tests; remote wiring script ready (`wire-remote-hooks.sh`) |
| next-admin (SG) | ✅ Live | Turnstile baked in; `(shell)/(public)` route groups; 599 tests |
| Auto-Repair | ✅ Upgraded | A1+A2+A3 — self-healing engine now operational |
| Provisioning pipeline | 🟡 Stage 4 gated | Stage 0–3 complete; Stage 4 awaits token + env flags + go-ahead |
| n8n bridge | ✅ Stage 2 live | Workflow active, e2e verified |
| Health gate (last close) | ✅ 100% | 2026-07-05 362/362 |
| EU ClickHouse | ✅ Stable | After emergency fix; monitor 3–5 days before reducing mem_limit |

---

## Risks & blockers

| Risk | Severity | Status |
|------|----------|--------|
| Defender 木馬資安複盤 | 🔴 High | OVERDUE 19 days (target 2026-06-17); no forensics done yet |
| POD A2 金流紅線 | 🔴 Critical | No automation before human explicit approval; confirm phase not designed |
| Stage 4 一鍵架站 | 🟠 Major | Code complete; blocked on HETZNER_STAGING_TOKEN + operator go-ahead |
| S2 multi-tenant enforcement | 🟠 Major | S1 done; ~20 IDOR items documented in `MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md`; S2 not yet applied |
| EU→Dedicated migration | 🟡 Gated | 8月; operator card-swipe; current EU 8GB RAM insufficient for Chatwoot |
| ClickHouse stability | 🟡 Monitor | 3–5 day observation window after OOM fix (2026-07-05); may adjust mem_limit |
| Operator travel upcoming | 🟡 Info | Termius SSH setup + cheat sheet pre-travel requirement not yet done |
| soulful blog images lost | ℹ️ Accepted | 2 images permanently lost; client may notice (accepted tradeoff from 2026-06-28) |

---

## Memory highlights

- **Hook v2 architecture SSOT**: `runner.js` + `rules.manifest.json` is single source of truth for all 26 governance rules; old 23-file pattern deleted. `bash scripts/test-hooks.sh` is the canonical verification command.
- **Remote container hook gap patched**: `scripts/wire-remote-hooks.sh` must be added as setup script for Claude Code web environments (governance vacuum found 2026-07-02 audit). One-time per container; subsequent sessions in same container inherit hooks.
- **ClickHouse OOM root cause**: system log TTL (7d/14d/30d) had never executed because OOM killed CH on startup before TTL could run — classic death spiral. Fix: raise mem_limit first, clear logs manually, then TTL resumes.
- **CF hairpin pattern**: `new URL("/api/...", request.url)` in server-side Next.js code produces external URL → loops through Cloudflare → fragile under Docker GC. Always use `http://<container-name>:3000` for intra-Docker calls.
- **Intake flow decision (reverted)**: `/start/` → `/intake` redirect was built and reverted; original FluentForm → MySQL + FluentCRM → webhook → Supabase → trigger-build is the authoritative intake path. `/intake` React form exists as alternative channel but FluentForm is the live path.
- **Stage 4 gate**: `HETZNER_STAGING_TOKEN` (vault currently empty, needs decision: dedicated token vs main token) + `SG_PROVISION_ENABLED=true` + `LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `HETZNER_STAGING_ENABLED=true` + sg-deploy. All five required before Stage 4 activates.
- **WORKLOG rotation**: `rotate-worklog.mjs` is now part of `ao-close.ps1`. Threshold: ~15k lines triggers rotation. Archives go to `WORKLOG-archive-YYYY-MM.md`.
- **Multi-tenant isolation plan**: `MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md` documents ~20 IDOR vulnerability sites; S1 identity layer shipped (2026-06-29); S2–S5 rollout roadmap written.
