# Monthly Review 2026-11

- **Generated**: 2026-11-01
- **Period**: 2026-10-01 → 2026-10-31
- **Previous review**: `monthly-review-2026-10.md` (covered 2026-09)
- **Health at last closeout**: 99.4% (316/318) on 2026-10-31; 99.7% (319/320) on 2026-10-26
- **Governance drift**: SKIPPED (no PowerShell available in remote Linux container; previous month 2026-10: PASS, span=19 days)

---

## Accomplishments

### Product Commercialization — ADR 017 Major Milestone

October was dominated by closing the commercial loop for the AwareWave platform. Key deliverables:

- **4c Seller Sites** (4c-1 through 4c-3): Each checkout site validates payments and "entry" with its own Ed25519 key. `0133_seller_sites`, `0140`, `0141` applied to prod. `aware-wave-store 1.1.0→1.2.0→1.2.1` released.
- **4c-2 deployed** (`b22ce2277`, `77fd74a72`): payment + door verification per-site key, seller determined by site, proxy check before account creation.
- **4b-10**: Staff can gift products and proxies to customers from the staff console (`0143`, `66b612ead`).
- **Monthly billing by paid_at**: WooCommerce `date_paid` field forwarded (`0142`, `24c1d9973`; 7-day trust window).
- **First plan** `studio_basic` (`0144`): credits shared across products, Taiwan-card subscriptions renew manually.
- **Credits and priced calls**: All paid AI calls charged via cost logger with credit pre-deduction and settlement (`4b-11`, `33afaf8`).
- **Daily WooCommerce reconciliation** (`f40dca2`): `/ops/billing` compares paid Woo orders against `payment_events`; first prod run matched order #41.
- **Payment rails**: ECPay (台灣卡, personal) + PayPal (overseas card), replacing the WCS+TapPay plan.

### Customer Self-Registration

- **Member registration on aware-wave.com** with Cloudflare Turnstile CAPTCHA (`c1830f1`).
- **Sign-up gift**: 50 credits unlocking 5 products on registration (`420233a`).
- **Google sign-in** via Nextend Social Login (1.3.2 safe-link guard, 1.3.3 button, 1.3.4 Google sign-up flow) (`553e7a4`, `1cc831d`, `6076282`).
- **aware-wave-store 1.3.x series**: full registration + gift + Google sign-in flow.
- **Product doors** (steps 10–12): Customer workspace (`61f9f26`), WP My Account → workspace handoff (`4632004`), one-time door links (`da0804a`).
- **Content door** launched on `content.aware-wave.com` (`e62dc2fcd`, `3f9bb4273`).

### Security & Infrastructure Hardening

- **RLS hardening 0136/0137**: 22 control-plane tables member-only SELECT; `current_clerk_org_id_from_jwt` no longer trusts `user_metadata.org_id` from client. `getSupabaseServerClient` fallback removed (503 on missing key).
- **0094 RLS**: 3 tables without RLS locked to service_role only; new public tables auto-RLS. Applied to prod 2026-10-03.
- **Pre-commit mass-delete guard** (`scripts/githooks/pre-commit`): blocks any commit deleting more than half of tracked files.
- **CF Managed Challenge on wp-login**: brute-force blocked at edge; admin display name vs login name separated (`1932438e5`).
- **AO-CLOSE index scope fix** (`tests/ao-close-index-scope.test.ps1` 11/11): gate only checks current session's staged content.
- **HSTS + cookie Secure**: applied and deployed 2026-10-01.
- **4 missing DB migrations applied** (0022/0024/0037/0057) to prod 2026-10-01.
- **DMARC upgraded**: `p=none → p=quarantine;pct=25` (first stage, 2026-10-01; second stage 10-15 pct=100).
- **workflows security scan** reduced from 15 → 0 issues; deepmerge8 Prisma6-specific, exemptions removed, 136 tests (`392d7fda8`).

### Scheduling Architecture — Trigger.dev Retirement

- All scheduled tasks migrated from Trigger.dev to host crons. `TaskSchedule` 0 rows.
- C2.2–C2.5 manual first-runs confirmed; C4.6⑦ first daily report sent to Slack.
- **Host liveness probe** (GitHub Actions, `host-liveness-probe.yml`): TCP+HTTPS every 5 min.
- **Backup status** now judged by host (`phase4-checks.py --judge-backup-json`), no longer committed to repo.

### Video & Auto Content Pipeline

- **Auto content P3–P9.6** completed (54/61 items); AI review cycle closed.
- **Video tools V1–V7** restructured; Whisper self-hosted.
- **Subtitle dual-engine** (D11: source determined by audio source).
- **P7 YouTube publishing** real first videos: AW channel "差點放棄的那一夜" + Soulful Expression channel 51s video (US$0.03, `https://youtube.com/watch?v=HKMc7sTumvI`).
- **P9.1 daily trending search** wired to cron (YouTube Data API key needed for full P9.3/P9.5).

### UI / Theme Editor

- **Theme Editor**: 37 four-color palettes (24 arrangements + Shuffle + swap); `--accent-text`, `--btn-primary-*`, sidebar `.active`, `--tab-bg-active` connected; Font Family selector (3 fonts); 888 color combinations AA-tested.
- **Staff tools permissions** (ADR 019) C1–C5: shadow mode live since 2026-10-25 03:00 deploy; C6 decision due 2026-11-01.

### Social Manager V1

- **C20–C28+** completed (thread templates, repeat posts, Meta auto-reply scaffolding).
- **C27/C28 META_* env drift** resolved: 8 `META_*` variables added to prod compose via `safe-infra-patch.sh`.
- Social accounts `claim` endpoint deployed (`3dc138272`).
- social.aware-wave.com: all 7 doors' Cookie 400 bug fixed (`large_client_header_buffers 4 32k`).

### Tarot & AI Models

- **RWS 78-card dual-review**: 13 image corrections, 56 minor-arcana meanings reviewed, Lovers card 3-variant prompts (`829347e99`).
- **Animal role 3-button** (人物/動物擬人/動物自然); per-card 4-leg action for "animal natural" (`e45f4417b`).
- **AI Models settings page** added (`3451dcac6`).
- Haiku 4.5 → 5.5 upgrade in next-admin.

### Cognitive OS & Cognitive Sovereignty Platform

- **PostgreSQL migration**: COS moved from SQLite to PostgreSQL (multi-region ready).
- **Cognitive Sovereignty Platform** steps 1–4 online at `cognitive.aware-wave.com`.
- **JSON shape guards**: all AI calls expecting JSON objects carry a format spec; violations record path not value.
- **CI isolation**: `COS_FULL_SUITE=1` gate; PostgreSQL in CI; queue-retry isolation.
- **Result-page gap batch** (C1–C10 + 13 more): visible copy, shared input card, expert gate table — deployed.

### Governance

- **verify-governance-pointers** tool: ensures AGENTS.md trigger index stays in sync with TOOL_TRIGGER_MAP.md.
- **file-claim-guard** extended to Bash file writes and already-committed claims.
- **Model routing table** finalized in AGENTS.md (Fable/Opus/Sonnet/Haiku by work type).
- **Outbound OS v2 spec** (2026-10-31): GPT draft replaced by executable spec; supervisor handoff with 10 cards and 43 items.

---

## In Progress

| Item | State | Blocker |
|------|-------|---------|
| Staff tools C6 (enforce mode) | Decision due 2026-11-01 | Operator reviews 7-day `would_deny` log at `/ops/staff` |
| DMARC 3rd stage (`p=reject`) | Trigger 2026-11-06 | Zero unexplained failures in rua reports required |
| ADR 017 step 2 | Lawyer confirmation on Postiz AGPL-3.0 + MinIO + Redis + Keygen CE licenses | Blocks buyer step 5 (perpetual license delivery) |
| Social Manager V1 C23+ | Pending next deploy | DEPLOY_HOLD active (ADR 017 step 2 prerequisite) |
| Soulful domain → CF Registrar | No hard deadline (paid to 2028) | Operator manual action |
| Cognitive OS P2 research lines | Plan complete | Operator defines threshold for DOD-2 |
| 4c next: first reseller site | 1.1.0 install + public key → `/ops/sellers` | Operator action |
| Soulful customer service | Exam gate live; AI auto-reply deployment pending | Operator runs exam, enables auto-reply |
| knowledge base: contextual prefix | Awaiting Soulful website content finalization | Operator confirms content ready |
| ADR 017 4b対帳 billing report | Designed 2026-10-25 | Ready to execute |

---

## System Health

### Infrastructure

- **Host**: `ks-aw-01` only (145.239.195.47, SSH -p 58122). No fallback.
- **Last health gate**: 99.4% (316/318) on 2026-10-31; 99.7% (319/320) on 2026-10-26.
- **next-admin prod**: `cf57484` (2026-11-01 daily scaffold). Last code deploy `3f9bb4273`.
- **Trigger.dev**: fully retired from scheduling. Worker `20261026.3` handles ad-hoc jobs only.
- **DB**: Migration `0148` on prod (latest). Billing, plans, seller sites all live.
- **7 doors**: All Cookie 400 resolved; all 200/307 confirmed.
- **Backups**: Soulful 3B/3C/3D PASS; host-local `/var/lib/awarewave/backup-status/` active.
- **YouTube**: AW + Soulful first videos published and confirmed via oembed.

### Open Security Debt

| Severity | Item |
|----------|------|
| 🔴 HIGH | `SUPABASE_SERVICE_ROLE_KEY` may have been printed in WORKLOG 2026-10-26 续6 — operator should evaluate rotation |
| 🟠 MED | `awmainwp` username exposed (320 targeted login attempts) — rename or add 2FA |
| 🟠 MED | AUTOCONTENT-GAP: trending search + topic proposal not yet wired to cron — needs YouTube Data API key |
| 🟡 LOW | collection events bypass `upsertIncidentAtomic` (`lib/collect/report-store.ts:166`) — duplicate incidents won't reopen |
| 🟡 LOW | Woo webhook status check for POD order inbox missing |
| 🟡 LOW | Defender trojan `Trojan:Win32/PowhidSubExec.B` postmortem overdue (since 2026-06-17) |

### Governance Docs Drift (long-term 4-doc check)

**2026-11 status: SKIPPED** — `pwsh`/`powershell` unavailable in remote Linux container. Same limitation as 2026-09 and 2026-07 monthly reviews.

**Previous month (2026-10): PASS** — significant improvement from 2026-09 baseline (WARN, span=115 days).

| Check | 2026-09 | 2026-10 | 2026-11 |
|-------|---------|---------|---------|
| existence | PASS | PASS | SKIPPED |
| mtime_drift | WARN (115 days) | PASS (19 days) | SKIPPED |
| cross_reference | PASS | PASS | SKIPPED |
| footer_present | PASS | PASS | SKIPPED |
| mcp_set_consistency | PASS (20 MCPs) | PASS (20 MCPs, 0 divergence) | SKIPPED |

**Key findings from 2026-10 drift** (generated 2026-10-13):
- `mtime_drift span=19 days` (youngest=2026-10-13, oldest=2026-09-24 RoutingMatrix)
- No structural failures; all docs exist; MCP set is consistent (20 shared, 0 divergence)
- The 115-day → 19-day span improvement from Sep→Oct was driven by Inventory and Traceability updates on 2026-10-13

**Recommendation**: Governance drift went from WARN → PASS — maintain by syncing RoutingMatrix when MCP tools change. Run `scripts/check-governance-docs-drift.ps1` monthly from a Windows/macOS session with pwsh installed.

---

## Knowledge & Memory

### Architecture Decisions
- **ADR 017 (商業模型)**: Seller sites 4c complete; buyer experience closed end-to-end. First real customer walked sign-up + gift + door entry prod on 2026-10-30.
- **ADR 019 (Staff tools)**: Shadow mode deployed; shadow-log period ends 2026-11-01 with operator decision on enforce mode.
- **Payment rails**: ECPay (個人, no 統編) + PayPal — vendor decision finalized after WCS+TapPay was dropped on 2026-10-30.
- **Scheduling**: Trigger.dev is for ad-hoc workflows only. All periodic tasks run as host crons. This is stable architecture.

### Lessons Learned
- **Google sign-in deployment friction**: Nextend Social Login follows WP registration toggle; CF wp-login rate limit counts GET requests too — both caused 429 during operator self-test. Config ordering matters.
- **Auto-deploy gate value**: `npm test` gate on sg-deploy caught `color-mix()` usage (2026-10-22) that Codex introduced without running page-rules tests. Full gate prevents targeted-test-only omissions.
- **shared-file commit discipline**: AO-CLOSE index scope fix (2026-10-23) corrected a bug where gate checked entire index instead of session scope — ensures multi-session environment doesn't stage other sessions' work.
- **SUPABASE_SERVICE_ROLE_KEY print incident**: sed mask was too short; secret appeared in WORKLOG. Raises need for output scrubbing for sensitive env values.

### Context Shifts
- **aware-wave.com is now a commerce front-end** (WordPress only), fully wired to next-admin for payments and member entry. App URL removed from aware-wave.com per operator decision 2026-10-30.
- **Cognitive Sovereignty Platform** is live as a separate product at `cognitive.aware-wave.com`, backed by PostgreSQL.
- **Credits as the universal currency**: ADR 017 §0 — credits only from shared `can()`, spending only through shared `lib/ai/gateway.ts`. Per-product quota logic (tarot's `quota.ts`) to be removed.

---

## Next Month Priorities (November 2026)

Ranked by urgency:

1. **[TODAY 11-01] Staff tools C6 decision**: Operator reviews 7-day `would_deny` log at `https://app.aware-wave.com/ops/staff`; if no false positives, approve `STAFF_TOOLS_MODE=enforce` → `safe-infra-patch.sh compose` (High-STOP).

2. **[11-06] DMARC 3rd stage (`p=reject`)**: Check rua reports (dmarc@aware-wave.com → awarewaveai Gmail) for zero unexplained failures since 10-23; if clean, upgrade to `p=reject`.

3. **[ADR 017 step 2] License lawyer confirmation**: Postiz AGPL-3.0 + MinIO AGPLv3 + Redis RSALv2/SSPL + Keygen CE Fair Core License — legal clearance before selling perpetual licenses (step 5 of buyer flow).

4. **Social Manager V1 C23+**: Continue after DEPLOY_HOLD is resolved; focus on META auto-reply (C27/C28 pending Meta Standard Access), report page, and Postiz v2.25 UI gap closures.

5. **Soulful CS knowledge base rebuild**: After Soulful website content finalized — contextual prefix per chunk, reimport (est. US$1), retest exam #3 (currently 25/30).

---

## Comparison with Last Month

| Dimension | 2026-10 report (covering Sep) | 2026-11 report (covering Oct) |
|-----------|------------------------------|-------------------------------|
| Health gate | 100% (328/328) | 99.4% (316/318) |
| Commits in month | ~0 logged (gap in coverage) | 54 first-parent commits |
| Primary theme | COS P1 on prod; VPS consolidation | Product commercialization (ADR 017 buyer + seller closed) |
| Customer registration | None | Live (aware-wave.com + Google sign-in) |
| Payment rails | None | ECPay + PayPal wired; first test order walked |
| Product doors | 0 live | Video, Design, Content doors live |
| Staff tools | Not started | ADR 019 shadow mode live (C1–C5) |
| YouTube | No videos | 2 videos published (AW + Soulful) |
| Scheduling | Trigger.dev had crons | All periodic tasks → host crons |
| RLS hardening | 0094 pending | 22 control-plane tables locked; fallback removed |
| Governance drift | WARN (115 days) | PASS (19 days) — improved |
| Security debt | SUPABASE key exposure risk noted | Same + awmainwp username exposure |
| Social Manager | C12 deployed | C20–C28 deployed; META_* env patched |
| DMARC | p=quarantine;pct=25 (2026-10-01) | pct=100 since 10-15; 3rd stage pending 11-06 |
| Open tasks estimate | ~117 open | ~85 open (rough, file too large for full count) |

**What improved**: Commercialization loop closed (major milestone); governance drift back to PASS; scheduling architecture simplified; RLS hardened; YouTube pipeline live.

**What stalled**: Soulful CS knowledge base (waiting on content); HCI-30 C6 login (no operator authorization); Defender trojan postmortem still overdue (since 2026-06-17, 137 days as of today).

---

_Generated by remote-monthly-agent on 2026-11-01. Source files: TASKS.md (partial), WORKLOG.md (Oct section headers + grep), CONVERSATION_MEMORY.md, integrated-status-LATEST.md (2026-10-30), weekly-automation-LATEST.md (2026-10-26), memory/daily/2026-11-01.md, monthly-review-2026-10.md, drift-2026-10.md._
