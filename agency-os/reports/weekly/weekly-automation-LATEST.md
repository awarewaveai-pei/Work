# Weekly Summary 2026-06-22

**Period**: 2026-06-16 → 2026-06-22
**Generated**: 2026-06-22 (remote weekly-agent)

---

## Completed this week

### 2026-06-16/17 — Video Service Full Build (Phase 0 → 2-B)
- `pipeline.py` + `server.py` Python backend: moviepy→ffmpeg rewrite, A/V drift=0, 9min→23s speedup
- `render_video()` entry point wired up
- Dockerfile + docker-compose + EU authentication + R2 handoff
- Video gallery tab + independent R2 bucket
- EU prod deployment: R2 lifecycle + nginx + TLS + authed render→R2→public playback e2e PASS
- Async architecture confirmed: EU thread + browser polling (no Next.js background workers)
- Video reconciler: idempotent + cron + test artifact cleanup
- `/tools/video` web tool deployed (cost SSOT: $0.0486≈NT$1.56/video, vitest 6/6 pass, tsc 0)
- `video/pipeline` content block (5 libs + registry registration)

### 2026-06-18 — AI Tools + Video + Mockup Fixes
- `/tools/ai-models` AI Models comparison page deployed (commit `5b8c97ac`)
- Pexels Photos API switch (`pexels.ts`): Photos API, host allowlist, timeout
- Theme system `/tools/theme`: localStorage + inline script injection
- MockupStudio CORS fix: `resolveToDataUrl()` server-side proxy
- Content defaults for sites: JSONB field in sites table + SiteManager UI
- Video gallery reconciler idempotency fix
- Video async architecture confirmed definitive (SG 25s sync → EU thread → R2)

### 2026-06-19 — Video Refinement + ScriptForge + POD Phase 0-1b
- Video style picker: 3 photo presets (電影感/紀錄片/商業攝影)
- ScriptForge: multi-model support (Claude + GPT-4o), audience selector (6 categories), CTA brand voice, language selector
- Video job-store Supabase persistence: migration `0047_video_jobs.sql` applied to EU prod
- Video 16:9 aspect ratio + subtitle size fix (py + ts, critic Deep pass)
- POD `pod-catalog-config.ts`: 3 models × 4 hex × S-2XL (Printful v2 API 12/12 colors verified)
- POD Phase 1b: Printful hex-bind — `getCatalogVariants` v2 dual-match + `pfcreate` multi-model + `pod-product` multi-color + PublishWizard model dropdown (20/20 verified)
- `DesignsGallery.tsx` + `PublishWizard.tsx` updated for asset groups

### 2026-06-20 — POD Mockup Pipeline
- Printful mockup picker fix (`printful-mockup.ts`): white/Front priority (Front rank 0, back rank 300)
- `batch-mockup.ts` Phase 2-3: 4 specs (white-bg + 2 model shots + decorative flatlay), vitest 5/5
- `runAll` orchestrator integration in PublishWizard (Phase 3)
- Per-colour Printful mockup chain: `mockup route colorHex` + `pod-product variation image` + `publish route colorMockups` + `PublishWizard genColorMockup`
- Canvas edge strength slider fix (`CanvasEditor.tsx`): `isAsset guard` was missing `assetStrength` passthrough; 428/428 tests pass

### 2026-06-21 — Social Integration + wp-bridge + Client Hub
- **Perplexity → Claude Haiku migration** (quota exhausted): `trending/route.ts` + `market-analysis/route.ts` → Claude Haiku; `@perplexity-ai/mcp-server` removed from MCP registry
- **wp-bridge v0.13.0**: shipping profile feature (synced back: commit `b6551c18`)
- **wp-bridge v0.14.0**: color swatches (`ColorSwatches.php`, `_awbridge_color_swatches` meta key, JS extracted with CSP nonce, `is_singular` guard)
- **Client Hub unified UI**: `ClientPanelNav.tsx` + `ClientHubTabs.tsx` + `ClientHub.tsx` + `clients/page.tsx` + `clients/[slug]/page.tsx`; critic Deep pass, all Major fixed; tsc 0
- **Video Studio in Content Studio**: integrated with `ContentStudio.tsx`, `generate/route.ts`, `cost-model.ts`, `video-pipeline.ts`
- **Postiz Task 3**: `lib/content/postiz.ts` (new) + `app/api/content/social-publish/route.ts` (new) + `social_postiz_connections` table (migration `0011_social_postiz_connections.sql`, EU applied) + Gates A/B/D/E.1/E.2 verified
- **Postiz Task 4**: `social-channels/route.ts` + `social-admin/integrations/route.ts` + `social-admin/connections/route.ts` (all new) + ClientHubTabs social channels tab; critic Deep 2c/3m all fixed
- **Postiz Task 5**: `ContentStudio.tsx` social panel — 11 new state vars, channel checkbox, per-channel textarea, Draft/Now toggle, confirm modal; critic Medium→pass after double-submit fix
- **Postiz Gate C**: Bluesky multipart upload + draft post verified (HTTP 201 both steps)
- **Postiz Task 6**: `runbooks/POSTIZ-OPS-RUNBOOK.md` (new, 10 sections)
- **Postiz deploy**: commit `78451ebc`, tsc PASS, 431 tests PASS, sg-deploy smoke all 200
- **WebP ≤150KB**: `lib/studio/wp-web-image.ts` (`toWebUnder150KB` + `normalizeForWp`) + `lib/storage/r2.ts` + `publish/route.ts` + `wordpress-core.ts`; soulful prod backfill: 449 processed, 0 failed, 100.2MB saved; critic Deep 2c/3m all fixed

### 2026-06-22 — Incident Recovery + Banner Studio + Search Migration
- **🔴 CRITICAL INCIDENT recovered**: 420 soulful artworks accidentally WebP-converted; restored via SSH+wp-cli `aw-restore.php apply`; 2 blog images permanently lost (originals deleted in orphan cleanup); 19 product images kept as WebP; 2397+7275 embedded URLs reverted; new rule: `normalizeForWp` applies to pipeline-generated images ONLY, never user-uploaded artworks
- **Serper.dev migration** (all 7 Perplexity API points replaced):
  - `lib/content/trending-sources.ts`: `search/serper` + `perplexityChat()` → Claude Haiku
  - `lib/content/article/generate-core.ts`: `fetchRealSources` → Serper /search
  - `scripts/serper-cli.ps1` (new, PS5-compatible)
  - `mcp/user-env.ps1` + SG `.env`: `SERPER_API_KEY` added
  - `hl` locale fix: `p.hl.split("-")[0].toLowerCase()` for Serper 2-letter code
- **AI model selector restored** in `VideoStudio.tsx` (removed by pexels feature, now uses `__ai__` sentinel → full `IMAGE_RATES` dropdown)
- **Banner Studio P1**: `BannerStudio.tsx` full build ~860 lines — Step 0 streaming copy gen (5 variants), Step 2 product image (upload + remove-bg + position + scale), `exportToPng` layer order; critic Deep 0c/0m/3minor all fixed; commit `437eb3cb`
- **feat(banner)**: AI background compositing — `aiBgCompositeProduct` toggle + `bgImageHasProduct` provenance stamp + `nano-banana-2` auto-switch for refs + canvas export skips overlay when composited
- **feat(designs)**: Video tab in DesignsGallery — filter/sort/bulk actions, `videoSelectedIds`, `visibleVideos` useMemo, bulk download (JSZip) + delete, per-card checkbox; critic Deep 0c/1m/4n all fixed
- **feat(video)**: Pexels-video mode — `fetchBrollVideoUrl()` + video schema dynamic `schemaExample(sceneCount)` + `targetMinutes` param (1/3/5 min) + 3-button mode selector + duration selector; sg-deploy commit `6b49468c`, 431/431 PASS

---

## Open tasks

### Social / Postiz
- Postiz OAuth apps setup (requires human operator)
- Draft cleanup: test posts on Bluesky account (human)
- Bluesky account link to Postiz (human)
- Content Studio → social panel browser e2e (validation debt)

### POD (Print-on-Demand)
- Phase 4 true e2e + browser verify (POD A1 complete, e2e pending)
- **A2 confirm phase — 🔴 금류 red line** (requires human explicit approval before any action)

### Canvas / UI
- Browser e2e test debt: Undo/Redo, genfill, Posterize, edge tool full flow
- `/tools/canvas` full browser e2e (still unverified round-trip)

### Content Engine
- RSS block + quality-score block + second batch sources/UI
- SEO/GEO Soulful positioning + article generation
- Search block registry live, remaining source/UI work

### Infrastructure
- soulfulexpression.org → Cloudflare (DNS first, registrar after)
- app.aware-wave Stage 2 → Stage 3 → Stage 4 → Stage 5
- Hetzner dispatcher: M10 orphan reaper + partial index follow-up
- One-click hosting embed into app.aware-wave (Phase 5, plan ready)
- Client machine: post-boot full-stack deploy + maintenance layer (planned, not built)

### Auto-Repair / Governance
- Post-Phase 4 M2/M4/M7-M10 rollout (obs period ended 2026-06-19, now actionable)
- Three-file governance audit (Inventory / Routing Spec / Routing Matrix / Traceability)
- endpoint-alert.sh automated deploy mechanism

### wp-bridge
- `/product` dry_run support
- wp-bridge → app.aware-wave Ops Dashboard integration + commercialize
- `update-existing-post` / `product update+delete` operations

### Clients / Sites
- Soulful Expression Art Therapy: Day 1 + Day 2 handover
- Scenery Travel Mongolia: new site Day 1 + Day 2
- Next-Gen trial: cloud staging acceptance (2 projects)
- Termius mobile SSH setup + cheat sheet (pre-travel requirement)

### Security / Company
- **🔴 Overdue**: Defender 木馬 `Trojan:Win32/PowhidSubExec.B` — source trace + remediation (target was 2026-06-17)
- Company desktop: Cloudflare vault token fix
- Company desktop: SystemGuard re-register (fix red-flash window)
- Cross-border tax + legal compliance advisor review process

---

## System health

| Component | Status | Notes |
|-----------|--------|-------|
| SG VPS (`5.223.93.113`) | ✅ Healthy | Deployed `6b49468c` (2026-06-22), 431/431 tests pass |
| EU VPS (`204.168.175.41`) | ✅ Healthy | video-service + Postiz v2.11.3 live |
| Supabase (EU) | ✅ Healthy | `0047_video_jobs` + `0011_social_postiz_connections` applied |
| Postiz | ✅ Live | `postiz.aware-wave.com`, social publishing active |
| Video pipeline | ✅ Live | EU thread + R2 + browser polling, pexels-video mode added |
| POD pipeline | ✅ Phase 1b done | Printful hex-bind + mockup chain; e2e pending human |
| Search | ✅ Migrated | Serper.dev + Claude Haiku replacing Perplexity (all 7 points) |
| Soulful prod artworks | ⚠️ Restored | 420 restored; 2 blog images permanently lost |
| Health gate (last close) | ✅ 100% | 2026-06-22 sg-deploy smoke all 200 |

---

## Risks & blockers

| Risk | Severity | Status |
|------|----------|--------|
| 2 blog artwork images permanently lost (soulful) | Medium | Accepted — originals deleted in orphan cleanup; client may notice |
| Defender 木馬資安複盤 | 🔴 High | Overdue 5 days (target 2026-06-17); source unknown |
| Auto-Repair M2/M4/M7-M10 | 🟠 Major | Obs period ended 2026-06-19; rollout deferred, needs scheduling |
| POD A2 金流 red line | 🔴 Critical | Zero automation before human explicit approval |
| Postiz memory 67% (1400m) | 🟡 Minor | Monitor; restart needed if >85% |
| wp-bridge releases lag | 🟡 Minor | v0.14.0 awaiting `release-wp-bridge.sh` run |
| Serper quota unknown | 🟡 Minor | New API; monitor usage in first week |

---

## Memory highlights

- **Video cost SSOT**: $0.0486 ≈ NT$1.56/video (EU compute + R2 egress)
- **WebP rule updated**: `normalizeForWp` applies to pipeline-generated media ONLY, never user-uploaded artworks (`isDesignsAsset` guard in `r2.ts`)
- **Perplexity fully retired**: 0 active API calls; Serper.dev + Claude Haiku is the new search stack
- **Postiz architecture**: SG orchestrates via `postiz.ts` REST API; channels stored in `social_postiz_connections` (Supabase EU); Gate C (Bluesky) verified
- **Video async definitive**: EU Python thread → R2 → browser polling; no Next.js background workers; job state in `video_jobs` table (Supabase EU)
- **POD hex-bind**: Printful v2 `catalog-products` + dual hex-match (`pfcreate` → 3 models × 4 hex in one publish); mockup chain produces 4 specs per color
- **Banner Studio P1 live**: Streaming copy gen (5 variants), remove-bg compositing, `nano-banana-2` auto-routing for reference images
