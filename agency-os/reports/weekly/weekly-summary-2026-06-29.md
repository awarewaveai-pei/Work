# Weekly Summary 2026-06-29

**Period**: 2026-06-23 → 2026-06-29
**Generated**: 2026-06-29 (remote weekly-agent)

---

## Completed this week

### 2026-06-23 — Banner Studio Full Roadmap + Video + POD Fixes

- **feat(banner)**: Banner Studio P1 — streaming copy gen (5 variants), remove-bg compositing, `nano-banana-2` auto-routing for reference images (commit `437eb3cb`)
- **feat(banner)**: AI background compositing — `aiBgCompositeProduct` toggle + `bgImageHasProduct` provenance stamp + canvas export skips overlay when composited
- **feat(banner)**: Tier-1 conversion elements — CTA/badge/price/trust/scrim/stroke/layout templates
- **feat(banner)**: Tier-2/3 font pairing, emphasis text, kerning, Undo-Redo, AI one-click design, marketing styles
- **feat(banner)**: Tier-3 product scene templates + lighting presets (roadmap 100%)
- **feat(banner)**: Sticky-zoom layout + reference image color extraction + brand color
- **fix(banner)**: Composite mode restricted to models that actually place product
- **feat(video)**: 三尺寸各比例原生生成 + 勾選 UI (critic Critical fixed)
- **fix(video)**: ScriptForge 廣告A/B/C + AI主持人稿 + 「送去生產影片」按鈕; AI model selector restored
- **feat(video)**: VideoStudio UI 一致性 + 時間長度 + 去 emoji 重構; UX redesign — deployed
- **feat(pod-publish)**: 文案指示/品牌語氣 free-text field (deploy `a80e97c7`; browser verified)
- **fix(pod-publish)**: 一鍵 502 root cause = WebP thumbnail rejected by Printful; `route.ts` filters thumbnail to png/jpg; native store synced 20/20
- **fix(onboarding)**: onboarding 品牌色接進 `client_config.brandColors`
- **ops(soulful-printful)**: sync-timeout diagnosis + cleared 4665 failed schedules + deleted test product 7430; Printful-side 2 orphans remain (Dashboard)
- **feat(credentials)**: migration `0050` + 3 API routes + CredentialsTab UI full-stack deployed (26/32 smoke PASS)
- sg-deploy next-admin → prod (operator authorized)

### 2026-06-26 — EU Backup + CS Evidence + Governance

- **ops(backup)**: EU backup scripts fully real-tested end-to-end — backup-eu-stack.sh exit 0 (402M, all 7 new items); restore drills: `.env` openssl decrypt ✓, MainWP 44 tables ✓, n8n workflow in Supabase dump ✓; R2 upload fix (`set -a` export)
- **ops(backup)**: `check-backup-health.ps1` upgraded — real-exec both SG+EU PASSED + induced-failure unit tests; `verify-backup-eu.sh` comment-only cleanup
- **ops(dr)**: DR test: vault → R2 GET HTTP 200 → openssl decrypt → 4 `.env` files listed; throwaway script deleted
- **feat(cs)**: CS U0-U5 evidence committed (`9abdb0bf`, `91d026c4`); deployed `024b52c3`; migration `0051` applied EU prod (8 tables / 8 RLS / 8 policy / RPC / pgvector; SELECT cols validated)
- **ops(governance)**: AO report retention corrected to 90 days (`cba741aa`, `625e6442`); stale 30-day prune removed from all AO-CLOSE/AO-RESUME scripts; restored 2026-05-25 report

### 2026-06-27 — Oracle Platform + Canvas Overhaul + Provisioning Stage C

- **feat(oracle)**: 紫微十二宮逐星知識庫 — 14主星×12宮全斷語 (`lib/ziwei/stars.ts`, `palaceReading.ts`; tsc 0, vitest 118+7; deployed)
- **feat(oracle)**: 紫微頂規確定性分析引擎 (`patterns.ts` 21+ rules, `brightness.ts`, `flying.ts`, `analyze.ts`; deployed SG)
- **deploy(oracle)**: oracle.aware-wave.com 上線全部 8 功能 — git reset to fresh build, `.env.production` injected, 8 endpoints live, `/api/astrology` 200, `/api/interpret` premium 402 paywall confirmed
- **feat(canvas)**: 畫布自動適應一頁 + Adobe 快捷鍵 + 工具列整合右側欄 (commits `05f9f62f`, `470e10ba`; Chrome MCP real-test; sg-deploy healthy 7s)
- **feat(canvas)**: 兩批改善 — Batch 1 (`d9ac17e4`): 裁切/面板永顯/存檔修復; Batch 2 (`587d0a24`): 每圖記調色/滑桿undo; critic Deep ×2 pass; browser e2e verified
- **fix(tarot)**: `lockStyle()` 移除多餘 `saveToGallery()` 呼叫 (style lock no longer re-saves preview)
- **feat(onboarding)**: 公開接客門 — `intake-public/route.ts` (new); sidebar flow reorganized
- **feat(provisioning)**: Stage C — AI spec content injection: `seedContentFromSpec`, `buildSeedScript`, base64-via-stdin, CJK-safe, idempotent `aw_seed_done` flag
- **fix(provisioning)**: Stage C two-call split (timeout regression fix; `mode="seed"` separate POST)
- **feat(provisioning)**: slug fallback + brand color injection (CSS via `wp_update_custom_css_post`) + `wireClientToContentTools` (reserve-first pattern)
- **feat(provisioning)**: AI hero image — `generateAndInstallHeroImage`, flux-schnell, R2→`media_sideload_image`
- **feat(cs)**: AI 全自動客服系統 U0-U5 fully complete: `lib/cs/` 13 files (config, types, autonomy, guardrails, llm, cis, db, rag, intent, tools, generate, orchestrator, eval); U4 headless widget code complete

### 2026-06-28 — Netdata Fix + Culture Presets + Canvas Refinement

- **fix(netdata)**: SG `web_log` 「unparsed=100%」誤報 — netdata user added to `adm` group (`usermod -aG adm netdata`); verified: unmatched=0%, success=0.7%
- **feat(canvas)**: CanvasEditor panel reorder (匯出→top, 文字→below 圖層) + dynamic workspace height replacing `calc()` magic number (tsc 0, 551 tests, critic Deep 0 findings)
- **feat(studio)**: 世界文化 culture-presets.ts — CORE_TOPICS unified single-source (27 topics); MAP_THEMES/CULTURE_LENSES compose from it; data reorg, tsc EXIT=0, 0 dup keys, curated covers both-mode keys
- **feat(studio)**: 世界文化 整合版 — unified ALL_TOPICS(27, 核心/觀光/設計 grouped), single topic state, surprise expansion; verified tsc EXIT=0 + critic Low risk 0 Critical

### 2026-06-29 — Multi-Tenant Identity Foundation (S1)

- **feat(security)**: S1 Multi-Tenant Identity Foundation — `middleware.ts` CLAIM_HEADERS expanded (x-ops-user-kind, x-ops-org-id); `resolveTenantFromMeta()` + `applyIdentityHeaders()` helpers; unified identity injection across fresh/network/stale paths
- **feat(security)**: `lib/supabase/session-cache.ts` — `UserKind` type + `CachedIdentity` interface (userKind+orgId); all 3 exports updated
- **feat(security)**: `lib/tenant-guard.ts` (NEW) — `resolveTenant / assertOrgAccess / effectiveOrgId / OrgAccessError / toOrgAccessResponse`; S2 migration helper; dev-mode warn for uncovered routes
- **feat(security)**: `lib/supabase/route-client.ts` (NEW) — user-scoped Supabase client (anon key + cookies; RLS auto-enforced)
- **docs(security)**: `MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md` (NEW) — ~20 IDOR vulnerability audit + S1-S5 roadmap; `S1_TENANT_IDENTITY_DESIGN.md` (NEW)
- **feat(security)**: session-cache tests updated to `CachedIdentity` interface; client round-trip test added; 10/10 assertions pass (staff/client resolveTenant, cross-org 403, null-org throws 403)

---

## Open tasks

### Security / Overdue
- **🔴 OVERDUE**: Defender 木馬 `Trojan:Win32/PowhidSubExec.B` — source trace + remediation (target was 2026-06-17, now 12 days overdue)
- S2–S5 multi-tenant rollout (S1 shipped 2026-06-29; S2 = route-level `assertOrgAccess` enforcement)

### Social / Postiz
- Postiz OAuth apps setup (Meta/IG/FB, Reddit, LinkedIn — human operator required)
- Draft cleanup: test posts on Bluesky account (human)
- Bluesky account link to Postiz (human)
- Content Studio → social panel browser e2e (validation debt)

### POD (Print-on-Demand)
- Phase 4 true e2e + browser verify (A1 complete; e2e pending human)
- **A2 confirm phase — 🔴 金流紅線** (requires human explicit approval before any action)

### Canvas / UI
- Browser e2e test debt: Undo/Redo, genfill, Posterize, edge tool full flow
- `/tools/canvas` full browser e2e (still unverified round-trip)

### Content Engine
- RSS block + quality-score block + second batch sources/UI
- SEO/GEO Soulful positioning + article generation
- Search block registry live; remaining source/UI work

### Customer Service
- U6 Chatwoot (gated 8月 — waiting dedicated machine purchase)

### Infrastructure
- **EU→Dedicated migration** (gated 8月 — operator card-swipe required)
- SG production app-code drift (4 commits behind as of 2026-06-26/27; needs `/check-drift`)
- soulfulexpression.org → Cloudflare (DNS first, registrar after)
- app.aware-wave Stage 2 → Stage 3 → Stage 4 → Stage 5
- Hetzner dispatcher: M10 orphan reaper + partial index follow-up
- One-click hosting embed into app.aware-wave (Phase 5, plan ready)
- Client machine: post-boot full-stack deploy + maintenance layer (planned, not built)

### Auto-Repair / Governance
- M2/M4/M7-M10 rollout (obs period ended 2026-06-19; actionable, needs scheduling)
- Three-file governance audit (Inventory / Routing Spec / Routing Matrix / Traceability)
- endpoint-alert.sh automated deploy mechanism
- TASKS [x] auto-archive + duplicate detection gate (`archive-completed-tasks.ps1`, R0 approved)

### wp-bridge
- `/product` dry_run support
- Featured image operation
- update-existing-post / product update+delete operations
- wp-bridge → app.aware-wave Ops Dashboard + commercialize

### Clients / Sites
- Soulful Expression Art Therapy: Day 1 + Day 2 handover
- Scenery Travel Mongolia: new site Day 1 + Day 2
- Next-Gen trial: cloud staging acceptance (2 projects)
- Termius mobile SSH setup + cheat sheet (pre-travel requirement)

### Company
- Company desktop: Cloudflare vault token fix (`cfut_` → `cfat_`; add `CLOUDFLARE_ACCOUNT_ID`)
- Company desktop: SystemGuard re-register (fix red-flash window)
- Cross-border tax + legal compliance advisor review process
- lobster-factory A10-2 商業閉環実跑

---

## System health

| Component | Status | Notes |
|-----------|--------|-------|
| SG VPS (`5.223.93.113`) | ✅ Healthy | Health 100% (372/372); System Guard PASS (2026-06-26) |
| EU VPS (`204.168.175.41`) | ✅ Healthy | video-service + Postiz v2.11.3 live; netdata web_log fixed |
| Supabase (EU) | ✅ Healthy | Migrations `0048`–`0051` applied; pgvector + RPC live |
| oracle.aware-wave.com | ✅ Live | 8 endpoints; astrology 200; interpret premium 402 paywall |
| Video pipeline | ✅ Live | EU thread + R2 + browser polling; Pexels-video mode |
| AI Customer Service | ✅ U0-U5 deployed | U4 headless widget code complete; U6 Chatwoot gated 8月 |
| POD pipeline | ✅ Phase 1b done | Printful hex-bind + mockup chain; e2e pending human |
| Banner Studio | ✅ Roadmap 100% | Tier-1/2/3 complete; AI compositing live |
| Provisioning Stage C | ✅ Live | AI spec injection + hero image + brand color |
| Multi-Tenant S1 | ✅ Shipped | Identity layer; S2–S5 roadmap written |
| EU Backup | ✅ Verified | 402M e2e real-test; DR drill passed; R2 upload fixed |
| Postiz | ✅ Live | `postiz.aware-wave.com`; Bluesky Gate C verified |
| Search | ✅ Migrated | Serper.dev + Claude Haiku (all 7 Perplexity points replaced) |
| Soulful prod artworks | ⚠️ Restored | 420 restored; 2 blog images permanently lost (accepted) |
| Health gate (last close) | ✅ 100% | 2026-06-26 372/372 |

---

## Risks & blockers

| Risk | Severity | Status |
|------|----------|--------|
| Defender 木馬資安複盤 | 🔴 High | OVERDUE 12 days (target 2026-06-17); source unknown |
| POD A2 金流紅線 | 🔴 Critical | Zero automation before human explicit approval |
| SG app-code drift (4 commits) | 🟠 Major | Run `/check-drift` → `/verify` → sg-deploy to close |
| S2 multi-tenant enforcement | 🟠 Major | S1 done; S2 route-level assertOrgAccess not yet applied; ~20 IDOR risks documented |
| Auto-Repair M2/M4/M7-M10 | 🟠 Major | Obs period ended 2026-06-19; rollout deferred |
| EU→Dedicated migration | 🟡 Gated | 8月; operator card-swipe required |
| Postiz memory 67% (1400m) | 🟡 Minor | Monitor; restart if >85% |
| Serper quota unknown | 🟡 Minor | First full week; monitor usage |
| 2 soulful blog images permanently lost | Medium | Accepted; client may notice |

---

## Memory highlights

- **S1 Multi-Tenant SSOT**: `lib/tenant-guard.ts` + `lib/supabase/route-client.ts`; ~20 IDOR items audited in `MULTI_TENANT_ISOLATION_AUDIT_AND_PLAN.md`; S2 = apply `assertOrgAccess` at route level
- **Oracle platform live**: oracle.aware-wave.com — 紫微 8-endpoint API + deterministic analysis engine (patterns/brightness/flying); 14主星×12宮 knowledge base; premium paywall enforced
- **AI Customer Service U0-U5**: `lib/cs/` 13-file engine; intent classification, RAG, autonomous decision, guardrails, eval; U6 Chatwoot gated 8月
- **Provisioning Stage C**: AI spec content injection + brand colors + hero image; `seedContentFromSpec()` idempotent via `aw_seed_done` flag
- **Banner Studio roadmap 100%**: P1 + Tier-1 + Tier-2 + Tier-3 fully shipped; AI compositing + color extraction + scene templates live
- **EU Backup fully verified**: backup-eu-stack.sh 402M e2e; DR drill vault→R2→decrypt passed; `check-backup-health.ps1` with induced-failure tests
- **AO retention SSOT**: 90 days (not 30); corrected in all scripts 2026-06-26
- **WebP rule updated**: `normalizeForWp` applies to pipeline-generated media ONLY, never user-uploaded artworks
- **Perplexity fully retired**: Serper.dev + Claude Haiku is new search stack (all 7 points)
- **netdata fix**: SG `web_log` unmatched=0% after `usermod -aG adm netdata`
