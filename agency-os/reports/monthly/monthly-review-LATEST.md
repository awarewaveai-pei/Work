# Monthly Review 2026-06

Generated: 2026-06-08

---

## Accomplishments

This was the busiest month in the project so far — 8 days in, with a dense stream of deployments, security hardening, infrastructure breakthroughs, and product features shipping.

### Infrastructure & DevOps

| Date | Item | Evidence |
|------|------|----------|
| 2026-06-01 | EU VPS ClickHouse backup cleanup — 0 errors confirmed over 13 days, 906MB backup deleted, disk freed to 36% | WORKLOG 2026-06-01 |
| 2026-06-01 | GitHub auth root fix — `gh auth switch --user awarewaveai-pei`; pull --rebase 530 commits + push 14; 0/0 aligned | WORKLOG 2026-06-01 |
| 2026-06-03 | **Lobster Factory A7 closed** — `provision-staging` hosting bridge route live; SSH→docker exec WP install; Trigger.dev `http_json` adapter wired; E2E staging `green-valley-farm-28ba09` HTTP 200 verified | commit 2af74c49 |
| 2026-06-03 | Trigger.dev workflows deployed twice (v20260603.1, v20260603.7) | commits 739/743 |
| 2026-06-03 | Onboarding Portal §7/§8 — `POST /api/onboarding/trigger-build` live; idempotency + FK cross-validate; `UPTIME_KUMA_URL` wired in docker-compose; real exec run_id c9b6cc0e, status=building | commits a573b759+59d4e7c |
| 2026-06-04 | Webhook emergency fix — 2.3h full outage (PostgREST PGRST202) resolved via `NOTIFY pgrst, 'reload schema'`; schema cache reload SOP established | WORKLOG 2026-06-04 |
| 2026-06-04 | Memory in git — 41 memory files now git-tracked (was local-only); cross-machine sync via `git pull` | commit 70fb8e51 |
| 2026-06-05 | app.aware-wave.com 大修 (12 problems) — P1 Supabase Auth login (nginx proxy-auth injected), P2-P12 all fixed and deployed | WORKLOG 2026-06-05 |
| 2026-06-06 | **Hetzner Phase 1 hosting layer fully verified** — M9/M7/M3/M10 via tsc(0 errors) + vitest(18/18) + critic(0 Critical) + db-expert(sound); WORKLOG R0 evidence complete | commit e6a3a72a |
| 2026-06-06 | **Hetzner 一鍵租機+硬化+DNS real-machine verified** — `provisionClient.ts` + Hetzner/Cloudflare providers + cloud-init; cpx12@sin verified (IPv4+IPv6 firewall, key-only auth, no orphans) | WORKLOG 2026-06-06 |
| 2026-06-06 | `routine-output-watchdog.sh` deployed to SG — always-on Telegram leg for routine output monitoring | commit e6a3a72a |
| 2026-06-08 | ao-resume.md root fix — Step 0-git gate (git pull before reading state); B1-stale detection prevents phantom fresh state | WORKLOG 2026-06-08 |
| 2026-06-08 | verify-archive-tasks-lift.ps1 root fix — handoff slug cross-check + BOM fragility fix; system-health 100% (364/364) | WORKLOG 2026-06-08 |

### Security & Quality

| Date | Item | Evidence |
|------|------|----------|
| 2026-06-01 | **Phase Z8** — AO-RESUME archive mechanical gate (`verify-aoresume-archive.ps1` + health gate 12d); prevents silent archive miss | commit a67ac175 |
| 2026-06-01 | ao-resume.ps1 design fix — hard exits → soft exit; WORK_ROOT dynamic; Case B1/B2 routing | commits c1d1180c/610a62b5 |
| 2026-06-02 | **npm audit automation** — `qs` DoS fix (6.11.1→6.15.2 GHSA-q8mj-m7cp-5q26); GHA `weekly-workflows-security-audit.yml` with Slack+Telegram bilingual alerts (weekly Monday) | commits 6c228230/814756ad |
| 2026-06-02 | scripts/ vs agency-os/scripts/ 20-file drift → wrapper化 收尾 — 9 dual-impl all converted to wrappers; system-guard dedup merge | commit 9b85f24c |
| 2026-06-02 | system-guard LAST_SYSTEM_STATUS churn root fix — conditional write on actual state change (BOM + 3-line normalize); 0 churn verified | commit a205499 |
| 2026-06-04 | **Auto-Repair Batch 3** — M9 TOCTOU `escalateAnalysisOnlyRun` atomic UPDATE; M10 `upsertIncidentAtomic` PL/pgSQL (EU Supabase applied); m4 uptime-kuma hostname | commit 9f862d82 |
| 2026-06-04 | VBC (Verify Before Conclude) principle added to AGENTS.md R4 — prevents false "uncompleted" claims from single-source lookups | commit 1fc640fc |
| 2026-06-04 | Skills wave 3 — 8 skills integrated: caveman/zoom-out/grill-me/grill-with-docs/tdd/diagnose/prototype/improve-codebase-architecture | commit 29d9859b |
| 2026-06-05 | **M2/M4 Phase 1 security** — per-source HMAC (5 webhook routes) + fingerprint V2; npm test 197/197; tsc exit 0; critic x2 (0 Critical) | commit per 2026-06-05 |
| 2026-06-05 | Cloudflare WAF wp-login fix — operator IP `114.32.129.172` added to CIDR; permanent fix: `ip.geoip.country` alternative noted | WORKLOG 2026-06-03/04 |
| 2026-06-06 | Certbot DNS-01 aware-wave.com wildcard cert verified (SG); 5 orphaned certs cleaned | WORKLOG 2026-05-25 (completed) |
| 2026-06-06 | `check-routine-freshness.ps1` — new script monitoring scheduled routine staleness; integrated into ao-resume | WORKLOG 2026-06-06 |

### Product Features

| Date | Item | Evidence |
|------|------|----------|
| 2026-06-02 | **Client Onboarding Portal MVP** — 14-segment spec (`agency-os/docs/architecture/client-onboarding-portal-spec.md`); `intake-form`/`package-selector`/`spec-generator` libs; EU migration 0034; `/api/onboarding/{submit,generate-spec}` routes; `/ops/onboarding` UI; sg-deploy smoke 4/4 | commits 90ea27d2/8ca09075 |
| 2026-06-05 | **Tarot Card Print Tool launched** — `app.aware-wave.com/tools/tarot`; 5 models (flux-schnell ~NT$8/deck → openai-high); client canvas 70×120mm @300DPI + bleed; JSZip download PNG; deployed SG `ccfbd176` | WORKLOG 2026-06-05 |
| 2026-06-06 | **wp-bridge v0.5.6 shipped** — Kadence Tabs + YouTube block + accordion pane-id fix + `wp_slash()` for PostCreator; real post 7053 verified | WORKLOG 2026-06-06 |
| 2026-06-06 | **SEO/GEO Content Engine productization** — `docs/seo-content/` (prompt-kit + 2 Gems); Soulful Expression positioning locked: Arts Practice for Self-Discovery / EdD Arts-Based Reflective Pedagogy; CONTENT_STRATEGY.md + first article template | WORKLOG 2026-06-06 |
| 2026-06-06 | **app.aware-wave 一鍵架站 MASTER PLAN** — 5-stage provisioning blueprint SSOT; AGENTS.md auto-trigger row; TASKS置頂 | WORKLOG 2026-06-06 |

### Governance & Process

| Date | Item | Evidence |
|------|------|----------|
| 2026-06-02 | routines SSOT backfill — DailyBriefing/WeeklyReview/MonthlyReview canonical routines documented | commit aa32970c |
| 2026-06-02 | WeeklyReview OAuth re-authorization confirmed by operator | TASKS closed 2026-06-02 |
| 2026-06-05/06 | Phase4Weekly second scheduled fire verified — AUTO_TASK_DONE_APPLIED 2026-06-06 | WORKLOG line 46 |
| 2026-06-04 | verify-closeout-completeness DEBUG-TAG gate added | WORKLOG 2026-06-04 |
| 2026-06-04 | APP_AWARE_WAVE_COMPLETE_REFERENCE.md (1800 lines) — full codebase analysis; 12-problem evidence | commit 7b25b380 |

---

## In Progress

### Top Priority (blocker-class or next-up)

| Item | Status | Next step |
|------|--------|-----------|
| **app.aware-wave 一鍵架站 Stage 1** | In progress — Stage 0 verified (2026-06-06 run 655197bf + curl 200) | Retry `POST /api/onboarding/trigger-build` on 2 `spec_generated` intake forms; diagnose L35-39 role 403 or UI "back to step 1" missing spec/intake id |
| **Auto-Repair Post-Phase 4 (M2 HMAC + M4 fingerprint Phase 2 rollout)** | Phase 1 code done; Phase 2 rollout + Phase 3 constraint swap pending | handoffs/2026-06-05-2017-tomo-201752.md |
| **Hetzner dispatcher 上線前 follow-up** | Gated OFF pending M10 orphan reaper + partial index | `dispatch-action-run.ts:157-180` orphan reaper; `idx_ops_action_runs_pending_dispatch` partial index |
| **wp-bridge 外掛接進 app.aware-wave.com + 販售** | Planned, not started | handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md |
| **Content Engine Phase 1 MVP — soulful 試點第一篇 draft** | Spec done, real content pending | Operator must supply real data (EdD/price/IG/citations); handoffs/2026-06-06-2029-tomo-202949.md |

### Open Tracks

- **客戶試點 Soulful Expression** — Day 1 §1.2/§1.3 done; Day 2 staging blocked on Hostinger panel (operator must login)
- **客戶試點 Scenery Travel Mongolia** — Tenant skeleton done; Day 2 blocked on domain/host selection  
- **POD Studio roadmap + tarot 框線收尾** — handoffs/2026-06-06-2026-pod-studio-roadmap.md
- **SEO/GEO 引擎產品化** — Content strategy locked; articles pending operator real data; §49 errata pending spec pull
- **客戶機 Post-boot全棧部署** — Plan complete (`SERVER_STACK_DEPLOYMENT_PLAN.md`), `provision-stack.sh` orchestrator not yet written; handoffs/2026-06-06-1925-postboot-stack-deploy.md
- **onboarding/provisioning IA 重整** — Phase 1 ops-console retirement planned; not started; handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- **Claude Code settings.json hooks object↔array drift** — Recurring at every AO-CLOSE; root cause: runtime writes object form vs SSOT array form; opened 2026-06-02, not started
- **endpoint-alert.sh 自動化部署機制** — No auto-deploy path; manual scp still required; opened 2026-05-30
- **三檔長期治理巡檢** — Routing Spec + Routing Matrix stale (see Governance Drift below)
- **scan-for-secrets baseline (Z4)** — ~24 known WARNs noise; opened 2026-05-28
- **AO-CLOSE health gate fetch-recency (Z5)** — opened 2026-05-28
- **Auto-Repair M2-M4/M7-M10 + m2-m6/m8-m11** — 7 Major + 9 Minor remaining; scheduled post Phase 4 observation (2026-06-19+)
- **A10-2 商業閉環** — Not started; depends on Stage 1 onboarding completion
- **Termius mobile SSH setup** — Operator manual task; planned pre-travel

---

## System Health

### Overall
- Health gate consistently at **100%** (364/364 as of 2026-06-08) across sessions
- sg-deploy: all June deploys exited 0 with smoke checks passing
- Supabase memory: 38.89% (< 85% threshold) per 2026-06-03 monthly check
- EU VPS ClickHouse: stable at 25.7.x since 2026-05-19; no ClickHouseError in 13+ days

### Notable Events
- **2026-06-04 07:02–09:21 UTC: 2.3h webhook outage** — PostgREST schema cache stale after migration 0035 added new function without `NOTIFY pgrst, 'reload schema'`. Resolved. SOP established: every new PL/pgSQL function must trigger schema reload.
- **GitHub auth desync** resolved 2026-06-01 — 530 commits behind; `gh auth switch` + `pull --rebase` brought to 0/0.
- **AO-RESUME state file stale** (recurring) — Fixed 2026-06-08 with Step 0-git gate; prevents phantom fresh reports when git-align fails.

### Build Gate History
- verify-build-gates: PASS across all June sessions
- npm test: 168/168 (onboarding), 197/197 (security webhooks), 18/18 (hosting), 27/27 (Phase 2 foundation), 75/75 (Phase 2d/2e provisioning)
- tsc --noEmit: 0 errors on all modified files (pre-existing 20 errors in workflows package unchanged)

### Governance docs drift
(Source: `agency-os/reports/governance/drift-2026-06.md`, generated 2026-06-03)

**Overall: WARN** (same as May 2026)

| Check | Jun 2026 | May 2026 | Delta |
|-------|----------|----------|-------|
| existence | PASS | PASS | — |
| mtime_drift | PASS | PASS | — |
| cross_reference | PASS | PASS | — |
| footer_present | PASS | PASS | — |
| mcp_set_consistency | WARN | WARN | no change |

**mtime drift span worsened**: 16 days (May) → **54 days** (June). The laggards are `MCP_TOOL_ROUTING_SPEC.md` and `ROUTING_MATRIX.md`, both last modified 2026-04-10 (58 days ago as of today). `Inventory` was refreshed 2026-06-03; `Traceability` last updated 2026-05-18.

**Key finding**: mcp_set_consistency WARN persists — 9 servers only in Inventory, 0 only in Spec. The 9 extras (`awarewave-ops`, `chatgpt-fast/latest`, `claude-fast/latest`, `gemini-fast/latest`, `hetzner-ssh`, `supabase-awarewave-postgres`) are real MCP servers added to the registry without being synced back to RoutingSpec/RoutingMatrix. This is a documentation drift, not a functional breakage.

**Compared to May**: No regression (WARN in both). mtime span increased significantly (16→54 days) due to RoutingSpec/RoutingMatrix not being touched since April 10. Flag: if this continues unaddressed, the span will hit the FAIL threshold (180 days) by ~2026-10-07. **Action required**: update RoutingSpec + RoutingMatrix to reflect current MCP registry within the next 2 months.

Note: governance drift check script (`scripts/check-governance-docs-drift.ps1`) could not be re-run in this session — PowerShell is unavailable in the Linux remote execution environment. Report from 2026-06-03 is the current source of truth.

---

## Knowledge & Memory

### Key Decisions Made This Month

1. **PostgREST schema cache SOP** (2026-06-04): Every new PL/pgSQL function/migration must trigger `NOTIFY pgrst, 'reload schema'` immediately. Cost of missing: full webhook outage (2.3h).

2. **Memory in git** (2026-06-04): 41 memory files moved from gitignored to git-tracked. Cross-machine sync now via `git pull` — no more manual copy. Major operational simplification.

3. **Tarot key provisioning lesson** (2026-06-05): Server-side secrets (REPLICATE_API_TOKEN, OPENAI_API_KEY) must be verified present in target container env *before* deploying a new feature that depends on them. "Explore agent said .env has keys" is not verification.

4. **Hetzner 一鍵租機 is real machine verified** (2026-06-06): `provisionClient.ts` + cloud-init complete and real-machine validated. DO NOT rewrite — call directly via `provisionClient()`.

5. **VBC (Verify Before Conclude)** principle formalized in AGENTS.md (2026-06-04): Before declaring "X is missing / not done", verify whether an alternate layer has already covered it. Root case: CF WAF=0 rules → didn't check LLAR installed → false alarm.

6. **Soulful Expression positioning locked** (2026-06-06): Public face = Arts Practice for Self-Discovery; academic/EdD = Arts-Based Reflective Pedagogy (Schön/Kolb/Mezirow); non-clinical art therapy (YMYL guardrails); domain soulfulexpression.org retained; brand differentiator = WuSheng Healing Module™.

7. **app.aware-wave 5-stage provisioning blueprint** (2026-06-06): Stage 0 (engine) done and real-machine verified. Next: Stage 1 (connect intake UI to trigger-build), Stage 2 (FluentForm bridge), Stage 3 (quote), Stage 4 (Hetzner provisioning via provisionClient), Stage 5 (Supabase/n8n/monitoring integration).

8. **ao-resume Step 0-git gate** (2026-06-08): If git pull fails, AO-RESUME must STOP — do not output a 7-section report based on stale state files. This prevents phantom "fresh" reports after network failures.

### Lessons Learned

- **Parallel AI sessions cause merge conflicts**: spec file `docs/wp-kadence-ai-seo-geo-content-engine.md` was being edited by another AI during the SEO session; operator stopped it. Mitigation: always check via VBC before assuming "the other session didn't do it".
- **Hook architecture**: exit-0 stderr is invisible in Claude Code PreToolUse; exit-2 is visible and acts as a real gate. All mechanical gates must use exit-2, not advisory stderr.
- **scripts/ vs agency-os/scripts/ dual-SSOT**: 20 files with content drift was a long-standing 30-year risk. Closed via wrapper pattern — but the pattern requires ongoing discipline.

---

## Next Month Priorities

Ranked by urgency and strategic impact:

1. **[P1] app.aware-wave Stage 1 接通入口** — Stage 0 done; Stage 1 is the gating milestone for the entire onboarding product. Diagnose trigger-build route L35-39 role 403 or UI spec/intake ID bug. Target: complete intake → trigger-build → status=building flow end-to-end without touching DB.

2. **[P2] Hetzner dispatcher 上線 pre-flight** — orphan reaper (M10) + partial index before enabling `LOBSTER_EXECUTE_MANIFEST_STEPS=true`. This gates the entire hosting automation pipeline.

3. **[P3] Auto-Repair Phase 4 observation period close (2026-06-19)** — Phase 4 observation ends June 19. Run final Phase4Weekly check, confirm all indicators healthy, close the observation. Then proceed to Phase 2 rollout (M2 per-source HMAC + M4 fingerprint) and M7-M10 remaining Major fixes.

4. **[P4] wp-bridge v0.3.0 / v0.5.6 integrate into app.aware-wave + monetize** — Plugin is feature-complete enough to be the first billable product. Wire into Ops Dashboard + aware-wave.com showcase page + WooCommerce sales funnel.

5. **[P5] Content Engine Phase 1 MVP — first Soulful draft published** — Positioning locked; Gem templates ready; operator just needs to supply real profile data (EdD, price, IG). First published article validates the entire SEO/GEO engine.

Secondary:
- Update RoutingSpec + RoutingMatrix (governance drift mtime span 54d → getting worse)
- Termius mobile SSH setup (operator pre-travel task)
- Claude Code settings.json hooks drift fix (recurring AO-CLOSE pain)
- Post-boot full-stack deploy layer (provision-stack.sh orchestrator)
- Soulful + Scenery Travel staging Day 2 (blocked on operator panel access)

---

## Comparison with Last Month

No previous monthly review exists in the `reports/monthly/` directory (this is the first monthly review generated by the scheduled routine). Baseline established with this report. Compare against this file next month.

**What improved vs. late May 2026 context** (from CONVERSATION_MEMORY):
- Hook mechanical gates: exit-2 architecture deployed; all major gates functional
- Memory cross-machine sync: now git-tracked (was local-only risk)
- Hetzner hosting: went from 0 to real-machine verified provisionClient
- App.aware-wave: went from "12 known problems" analysis to all 12 fixed and deployed
- Auto-Repair Batch 1+2+3: all complete (was: Batch 1 just started in late May)
- Certbot DNS-01: fully resolved (was: expiry risk flagged)

**What stalled / remains open from May**:
- RoutingSpec/RoutingMatrix still not updated (mtime drift worsening)
- Soulful + Scenery staging (operator-blocked since May 7)
- endpoint-alert.sh auto-deploy (opened May 30, not started)
- scan-for-secrets baseline Z4 (opened May 28, not started)
- settings.json hooks drift fix (opened June 2, not started)
- Lobster Factory A10-2 商業閉環 (not started)
