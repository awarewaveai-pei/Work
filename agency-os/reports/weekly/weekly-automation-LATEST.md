# Weekly Summary 2026-09-21

**Generated**: 2026-09-21 (remote-weekly-agent)
**Period**: 2026-09-15 to 2026-09-21
**Prev report**: 2026-09-14 (covered 2026-09-08 to 2026-09-14)

---

## Completed this week

### 2026-09-15 to 2026-09-17 — HCI-30 collector + Cognitive OS major push

| Area | Item |
|------|------|
| HCI-30 | Phase B final: DNS+TLS+public URL verified, 8/8 services live |
| HCI-30 Collector | Task 2: migration 0020, DB schema laid |
| HCI-30 Collector | Task 3: isolated fetch runner network layer (ADR-0029 first impl); 4 Major critic findings fixed |
| HCI-30 Collector | Task 4+5: DNS-rebind protection, SSRF corpus, object storage client write path; 1 Critical + 2 Major fixed |
| HCI-30 Collector | Task 6: Seed governance org entity whitelist; 1 Major (null-body crash) fixed |
| HCI-30 Collector | Task 7: runner fetch+extract+untrusted content isolation; 3 Major + 2 self-caught bugs fixed |
| Cognitive OS | Prod redeployment #2, #3, #4 (AI Gateway + gap closure + live content) |
| Cognitive OS | AI Gateway: whiteboard description → AI draft → method gate validation; 42 /invoke 501 fixed |
| Cognitive OS | `literature_search` removed (operator decision: duplicates /ops/collect) |
| KB | K2h/K2i nested folders + paginated search; K2j card collapse by folder; migrations 0084/0085/0086 deployed |
| Governance | WORKLOG.md NUL byte causing grep binary-match fallback — fixed |

### 2026-09-18 — Method enrichment complete + HCI-30 network fix

| Area | Item |
|------|------|
| Cognitive OS | **285/285 methods fully enriched** (why/url/example): batches 14–25 across F02/F03/F06/F09/F13/F14/F15/F17/F19/F22 + art_therapy families |
| HCI-30 bridge | `hci_not_configured` root cause: network topology error (bridge connects to hci-app, not hci-fetch-runner); fixed |
| Perplexity | Chat default model sonar-pro → sonar (cost: $10/day spike on 2026-09-12 → reduced) |

### 2026-09-19 — Cognitive OS architecture + Perplexity key rotation

| Area | Item |
|------|------|
| Cognitive OS | 5W1H dashboard: `dimensions` structured array fixed (generic form generator was flattening it to bare JSON textarea) |
| Cognitive OS | Import architecture: one folder = one Project (was: one org = one Project) |
| Cognitive OS | Method count corrected from "250+" to exactly 266/285 (operator challenged accuracy) |
| Cognitive OS | DISCOVERED source → case EVIDENCE manual promotion path (HCI-30) |
| Perplexity | API key rotated: fWoh → Ztpe; sg-deploy next-admin deployed (smoke 5/5 OK) |
| Governance | New task opened: bughunt-oracle only validates hits=0 claims, not hits=N completeness |
| Governance | Root-caused Claude→Codex sync failure: bridge frozen + zero mechanical gates firing in Codex |

### 2026-09-20 — Heavy engineering day (続85–続94)

| Area | Item |
|------|------|
| Governance | Oracle packet pollution root cause fixed: `oracle-capture-policy.ps1` shared capture policy; `.claude/sessions/` excluded; 2MB hard cap added |
| Infrastructure | docker-compose.yml repo/prod drift: 9 missing variables added; `composeVarDrift` field added to `check-deploy-drift.ps1`; `ao-close.ps1` + `system-health-check.ps1` wired as consumers |
| Infrastructure | `safe-infra-patch.sh compose` used correctly (vs. the manual SSH bypass done earlier on 2026-09-20) |
| Security | Auth timing test method fixed: interleaved sampling replacing batched runs; median statistic; mutant test proves detector still catches real constant-time violation |
| Cognitive OS | 186 `why_en` entries rewritten (engineering jargon → plain language, matching updated Chinese versions); deployed to prod |
| Background investigation | ADR-014: Entity dossier relevance axis — `entity.ts`, `relevance.ts`, `query-plan.ts`, `entity-dossier.ts`, new `lib/dossier/` layer |
| Background investigation | `passing_mention` redesigned: peripheral sources kept but labelled, not discarded |
| Background investigation | `enforceCitations()` added: hallucinated [n] references rewritten to [?]; zero-citation response rejected |
| Background investigation | Migration 0090 (`collection_runs.off_entity` + `collection_issues.kind`) applied to prod |
| Background investigation | next-admin deployed; prod runCollection verified: run report now writes to DB (was silently lost before migration) |
| Background investigation | Language detection: Latin names → English-only queries (was producing CJK noise for Western targets) |

---

## Open tasks

### 🔴 Hard deadlines / P0 blockers

- **Soulful migration hard deadline 2026-11-12** (machine purchase deadline 9/30): sub-tasks EU①–⑥b + SG⑦–⑫ still open; main migration 2026-08-28 done; ③④ cleanup not done
- **Security: HF_TOKEN明文 (2026-08-27)** — token not yet rotated
- **Security: transcript credential leak (2026-08-15)** — 3 items not yet rotated
- **`video/[id]` DELETE無引用檢查** — Soulful published article already has broken video (r2.dev/video/...16x9.mp4 → 404)
- **Defender trojan Trojan:Win32/PowhidSubExec.B** — 69+ days overdue (original: 2026-06-17)

### Background investigation (蒐集器)

- **No render tier: most authoritative pages unreadable** (`scholars.latrobe.edu.au` etc. → `too_short`/JS-only); needs operator to choose vendor (Cloudflare Browser Rendering vs. Firecrawl)
- `provenance`/`author` fields break at sink (C1 × KB, 2026-09-11)
- density gate single-veto design question
- 94 migrations without ledger — "what's applied on prod" can't be answered mechanically

### Governance / infrastructure

- **Codex `/hooks` trust not executed** — Codex side has zero mechanical gates; only 1 item left in `check-claude-codex-parity.ps1`
- **Claude→Codex sync frozen** (bridge stopped) — Codex-led work gates can't fire
- `bughunt-oracle.ps1` only verifies hits=0, not hits=N completeness
- `cf-iprefresh` detector in error for 14+ days
- Phase 4 Check 1/2 returning SKIP in cloud containers (no `gh`); 12 weeks of false PASSes prior
- `cloudflare-realip.conf` static IP range list — no detector
- `ao-resume-last.txt` anchor stuck at 2026-06-12 — AO-CLOSE window calculation distorted
- CHANGE_IMPACT_MATRIX drift detector: 7 WARNs pending manual review

### Product / client

- **DMARC upgrade phase 1** trigger date: 2026-09-28 (p=none → p=quarantine;pct=25)
- Soulful backup health: 5/10 recent failures (latest failure 2026-08-24) — must resolve before migration
- Mockup Studio: operator symptoms still unconfirmed (server-side cleared 2026-06-16)
- Canvas editor `/tools/canvas` browser e2e testing still pending (validation debt)
- POD A1 e2e test + A2 confirm phase (🔴 payment gate)
- Media Production LEGO Platform (P0/P1, 2026-09-05)
- Postiz OAuth app review: Meta/Reddit/LinkedIn
- Scenery Travel Mongolia: new site Day 1

### Code quality / infra debt

- next-admin no DOM test infrastructure — React wiring bugs invisible to current vitest suite
- Staging orphans: 10 sites / ~1970 MB (decision pending)
- `video/[id]` R2 remotion objects (8 objects ~200MB, outside reconcile scope)
- R2 orphan `video/蒙古旅遊___...` 23MB — needs operator decision (keep/delete)
- Video attribution: `outName → organization_id` persistent mapping (vs. current object-key reverse-parse)
- EU origin not locked to Cloudflare (step A done, B pending)
- HCI-30 C6 real login integration plan (planner output 2026-09-17, pending authorization)
- `queryAsTenant()` SET ROLE without explicit transaction wrap

---

## System health

Source: `agency-os/reports/status/integrated-status-LATEST.md` (generated 2026-08-29; **may be stale**).

No current smoke report available in this run. Based on WORKLOG:

| Service | Last known status |
|---------|-------------------|
| next-admin (app.aware-wave.com) | ✅ Deployed 2026-09-20, 5/5 smoke OK |
| node-api (api.aware-wave.com) | ✅ 200 per last check |
| Cognitive OS (cognitive.aware-wave.com) | ✅ Deployed 2026-09-20, public smoke PASS |
| Supabase DB | ✅ Migration 0090 applied; queries verified |
| Oracle packet capture | ✅ Fixed 2026-09-20; 2MB cap enforced |
| check-deploy-drift | ✅ composeVarDrift=empty after 2026-09-20 sync |
| Codex mechanical gates | ❌ ZERO triggers confirmed; hooks trust not done |
| cf-iprefresh detector | ❌ Error for 14+ days |
| Phase 4 cloud checks | ⚠️ SKIP (no `gh` in cloud container) |

---

## Risks & blockers

1. **🔴 Soulful hard deadline 2026-11-12** — machine purchase must happen by 9/30. If delayed, migration timeline collapses.
2. **🔴 Background investigation 0% ingestion rate** — Firecrawl/Browser Rendering vendor decision is the single blocker. Current: `collected=correct, ingested≈0` (JS-rendered pages unreadable).
3. **🔴 Security tokens not rotated** — HF_TOKEN and 3× transcript leaks from Aug. Rotation overdue.
4. **Codex bridge frozen** — cross-model oracle path effectively unavailable; Claude reviews only.
5. **Soulful backup reliability** — 50% failure rate on recent backups must be resolved before migrating client site.
6. **Oracle capture regression risk** — shared policy is a denylist (fail-closed on unknown dirs); new runtime directories must be added to `RuntimePathPatterns`.

---

## Memory highlights

- **Single host**: Only `ks-aw-01` (145.239.195.47, SSH -p 58122). SG+EU consolidated 2026-08-31. No fallback hosts.
- **ClickHouse locked at 25.7.x** — no upgrade.
- **285/285 Cognitive OS methods now enriched** — milestone reached 2026-09-18.
- **Two-track deployment architecture confirmed**: app code via `sg-deploy.sh`; nginx/compose changes ONLY via `safe-infra-patch.sh compose`.
- **ADR-014 entity dossier**: `entity_passing_mention` redesigned — peripheral sources now kept and labelled, not discarded. True garbage (retail/social/aggregator) blocked at `source-class.ts` by URL before any fetch cost.
- **Auth timing test**: interleaved A/B sampling with median statistic is the correct method for heterogeneous-core laptops. Batched sampling caused stable false positives.
- **Oracle packet pollution (2026-09-20)**: root cause was `.claude/sessions/*.md` transcripts (~87 files) being inlined as "untracked source files". Fixed by shared capture policy with explicit runtime exclusions.
