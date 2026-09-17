# Weekly Summary 2026-09-14

**Generated**: 2026-09-14T01:08Z (remote-weekly-agent)
**Period**: 2026-09-08 to 2026-09-14
**Prev report**: 2026-09-07 (covered 2026-09-01 to 2026-09-07)

---

## Completed this week

### 2026-09-08 — Cognitive OS F16/F17/F01 + HCI30 + System Foundry

| Area | Item |
|------|------|
| Cognitive OS | Slices 63–82: F17 learning (3/9→9/9), F16 decision (2/13→13/13), F01 framing (0/11→3/11), 5 parallel agents |
| Cognitive OS | F16 `record_decision()` db-expert: 1 Critical + 2 Major fixed; 235/235 assertions + 122/122 mutations green |
| HCI30 | Person track: open-case/new-person capability added; broken evidence citation UI fixed; critic 1M+2m fixed |
| System Foundry v1.6 | Commerce OS blueprint: remaining 26 gaps closed (post-top-10 pass) |
| TASKS cleanup | Tarot batch operator TODOs verified as obsolete (secret via payload not Trigger.dev env, SG/EU no longer exist) |

### 2026-09-11 — HCI30 UI, Cognitive OS F07/F12, KB, Collection, Customer Service

| Area | Item |
|------|------|
| HCI30 UI | Case-detail page: layout reordered to match analysis flow; left/right split; card boundaries; accordion removed; textarea fill; h2 headings |
| HCI30 UI | `<details>` flex-child width root cause fixed (browser-level, not app bug) |
| Cognitive OS | F07 stakeholder/power/negotiation (0/10→10/10), 10 parallel agents; 2C+5M+3m all fixed same day |
| Cognitive OS | F12 challenge/red-team/risk (3/10→10/10), 7 parallel agents |
| Cognitive OS | Causal F11 (IV/DID/RD/SC) + F08 strategy opening batch (PESTEL/STEEPV/3C/TOWS/Porter) — verify-recent --ack |
| Collection | /ops/collect 3-section reorder + error message improvement (11th batch) |
| Collection | KB routing: Knowledge Base + Collection same group, both entry points added |
| KB | Short drama Story Bible real wiring: manual generation with Bible applied + continuity check passing |
| Postiz | AwareWave Meta app: privacy policy page created and added to App settings; duplicate page removed |
| Customer service U6 | accountId uniqueness index applied; SMTP wired via Resend; rate limit false positive resolved (nginx already had it) |
| Video | Generation list panel: video on left, list on right (operator requested) |
| Governance | `git-commit-scope-guard.js`: merge/cherry-pick exemption added (real blocker, not critic finding) |

### 2026-09-12 — Massive day: Platform fixes (続7–続14) + Cognitive OS + HCI30

#### Media Platform (app.aware-wave.com)

| Item | Detail |
|------|--------|
| AI video motion cost tracking | `logImageCost` Critical bug fixed: `job_id` was 16-char hex not UUID → 400 from PostgREST silently swallowed; changed to `randomUUID()`, manual backfill of 3 Runway calls ($0.75) |
| AI video motion | Deployed; real Runway Gen-4 Turbo test: 3 `.mp4` scenes generated; browser automation coord bug worked around |
| Video motion prompt | "Subtle" removed → "moves naturally and visibly (gesture, expression, or action)" |
| Story Bible complete flow | 35.2s final mp4 produced; portrait gender bug fixed (description from `continuity.prohibitions` now passed to generate-portrait) |
| TTS stage directions | `stripStageDirections()` structural filter + Claude prompt rule; verified on 4 real cases |
| /ops/collect async fix | Root cause: Cloudflare ~100s edge timeout killing sync-wait; fix: async job tracker + polling; 4 critic findings (2 Major, 2 Minor) all fixed; 215 tests pass |
| sg-deploy.sh smoke fix | node-api probe was hitting host-nginx (port 80, returning 301); 2 rounds critic; final: `docker port` runtime resolution + `nginx/api` probe via `--resolve` to port 443; 4 BUGHUNT files updated |
| Prod deployment | Deployed commit `591358aec`; 5/5 smoke checks pass; `.deployed-commit` confirmed via `docker exec` |

#### Cognitive OS / HCI30

| Item | Detail |
|------|--------|
| HCI30 C7 | Evidence hash chain (`migrations/0018`): P0-03 remaining 2 items closed |
| HCI30 C1-C10 | Full decision log built (`HCI_C1_C10_DECISIONS.md`) |
| HCI30 C10 | Evidence count disclosure field added to rollup |
| KB migration 0076 | 5 rounds critic/review cycle; hybrid keyword half-side fix; vector sort fix; HNSW partial index; deployed prod |
| Collection: SSRF | DNS rebinding gap narrowed (`ctx.fetch` bind fix) |
| Collection: 304 | 304 short-circuit persistent cross-run layer built (deeper than surface symptom) |
| Collection: schedule | Schedule automation (11th/12th batch); Trigger.dev `COLLECT_SCHEDULE_INGEST_TOKEN` wired; ks-aw-01 root-hardening regression fixes (sudo, nvm guard, docker registry 401) |
| Cognitive OS F09 | Systems thinking family (0/8→8/8), 4 parallel agents |
| Cognitive OS F10 | Hypothesis/evidence/cognitive quality (0/10→10/10), 5 parallel agents |
| Cognitive OS F13 | Unknown unknowns/foresight (0/14→14/14), 5 parallel agents |
| git index race | F10 closeout missing files recovered (concurrent session index conflict) |

### 2026-09-13 — Cognitive OS /invoke dispatch bug

| Item | Detail |
|------|--------|
| Cognitive OS | `/invoke` dispatch bug: 27% of methods (66/245) were never callable; root-caused and fixed via real data testing insisted on by operator |

---

## Open tasks

### 🔴 Security (action required)
- Defender malware `Trojan:Win32/PowhidSubExec.B` root cause investigation — **overdue 69 days** (original 2026-06-17)
- HF_TOKEN明文進入對話紀錄 (2026-08-27) — token rotation pending
- 2026-08-15 transcript credential leak — 3 items pending rotation
- `claude_desktop_config.json` holds 6 plaintext API keys, no governance
- Codex stop-time review gate disabled since 2026-08-25

### 🔴 Hard deadlines
- **Soulful migration off Hostinger: 2026-11-12** (machine purchase deadline: 2026-09-30)
  - EU: Supabase, Trigger.dev (ClickHouse override.xml), n8n, Postiz, MainWP, Uptime Kuma, Remotion/Video
  - SG: next-admin, WordPress+DB, Node API, oracle-web (has plaintext OpenAI key in env), Redis, observability stack
- DMARC upgrade: `p=none → p=quarantine;pct=25` triggered 2026-09-28

### 🔴 Client site
- `video/[id]` DELETE no reference check — **Soulful Expression article already broken** (pub-...r2.dev/video/...16x9.mp4 returns 404)
- Postiz Task 2 OAuth review: Meta IG+FB / Reddit / LinkedIn (requires operator to submit)
- Postiz test draft cleanup (draft ID `cmqo1wijz0005p58ncl1mtssr`)
- Postiz → client Hub link (operator action)

### 🟠 Infrastructure
- EU origin not locked to Cloudflare (step A done, step B pending)
- `cloudflare-realip.conf` IP range list is static, no detector
- SG disk 67% (48G/75G) — 10 staging orphans, 1969.7 MB; cleanup path ready, operator decision needed
- R2: 8 `remotion/` objects (~200MB) not covered by any reconciliation; 1 Mongolia orphan video (23MB) awaiting operator decision
- soulful weekly backup: 5/10 recent failures (may be moot post-migration, needs operator confirmation)

### 🟠 Product decisions (operator input needed)
- Short drama Story Bible "apply" wiring — from 2026-09-11 real test; operator must decide whether to build it
- `is_sensitive` flag non-functional for all current callers — KB K1
- DOM test infrastructure for next-admin (no jsdom/happy-dom) — operator decision on whether to add dependency
- Remotion/Video service R2 orphans — keep or delete?
- `/api/video/regenerate-image` 502 — different root cause from remotion-render 502, unfixed

### 🟠 Governance / Technical debt
- Phase 4 Check 1/2 reporting false green for 12 weeks (cloud container no `gh`)
- `ao-resume-last.txt` anchor stuck at 2026-06-12, AO-CLOSE window calculation distorted
- `system-health-check.ps1` checks 7 (deploy-drift) and 9 (cloudflare) never executing (fixed for 7b/7c, these 2 remain)
- CHANGE_IMPACT_MATRIX 7 WARN items pending manual confirmation (drift 127–141 days)
- SECURITY DEFINER function anon/authenticated hole could reopen on DROP+CREATE
- Database has no migration record table ("which are applied" relies on guessing)
- KB: `provenance` + `author` lost at sink
- KB: per-model partial HNSW usage unverified via EXPLAIN
- KB migration 0076 critic: 5 deferred non-blocking items
- TASKS `[x]` auto-archive + duplicate detection (plan approved, not started)
- Canvas editor browser test (validation debt — operator must do, no login session for Claude)
- Mockup Studio bug diagnosis stuck on operator providing symptoms
- `detector-contract` audit class not built
- Cursor prose residuals: 10 docs still say "open in Cursor"

### 🟡 Client work (waiting)
- Scenery Travel Mongolia: actual Cloudways site build (waiting for client billing)
- Customer service U6 Chatwoot: gate removed, just not started
- Meeting service web install: waiting for operator explicit instruction

---

## System health

Based on integrated-status report (generated 2026-08-29, last available):
- **Single host**: `ks-aw-01` (145.239.195.47, SSH -p 58122) — SG + EU consolidated 2026-08-31
- **No fallback hosts** — retired: 149.202.64.114 / 5.223.93.113 / 204.168.175.41
- **ClickHouse**: locked 25.7.x — no upgrade
- **Prod smoke (2026-09-12)**: 5/5 PASS after sg-deploy.sh probe fixes
- **Deploy drift**: deployed commit `591358aec` confirmed via `docker exec` on 2026-09-12
- **SG disk**: 67% (48G/75G) — staging orphans not yet cleared
- Note: Integrated status report itself is 16 days stale; no fresh health run in this remote session

---

## Risks & blockers

| Priority | Risk | Action needed |
|----------|------|---------------|
| 🔴 | Soulful migration hard deadline 2026-11-12; machine purchase by 9/30 | Operator: buy machine ASAP |
| 🔴 | Soulful Expression article has broken video (DELETE bug) | Fix `video/[id]` DELETE reference check |
| 🔴 | Defender malware investigation 69 days overdue | Operator: investigate transcript/source |
| 🔴 | 4 pending credential rotations (HF_TOKEN + 3 from 2026-08-15) | Rotate tokens |
| 🟠 | EU origin not Cloudflare-locked | Complete step B of origin lockdown |
| 🟠 | SG disk 67% — staging orphans | Operator: approve cleanup of 1969.7MB |
| 🟠 | Story Bible "apply" decision | Operator: decide whether to build wiring |
| 🟠 | Short drama: 2026-09-11 test found Story Bible not actually applied | Operator: prioritize or defer |
| 🟠 | `/invoke` 27% dispatch bug fixed but no regression test against all 245 methods | Add coverage |

---

## Memory highlights

- **Architecture lock**: ks-aw-01 is THE only host. Nothing else. Former SG/EU IPs all terminated.
- **Week pattern**: 2026-09-12 was the heaviest day (~15 WORKLOG entries): full media platform sprint (続7–続14) ran in parallel with Cognitive OS batches (F09/F10/F13) and HCI30 — most productive single day on record this quarter.
- **Cognitive OS progress**: Most method families now complete or near-complete. `/invoke` dispatch bug (27% methods unreachable) was caught only because operator insisted on real data testing over code review — validates the REALTEST_EVIDENCE protocol.
- **Video pipeline**: Now fully instrumented for cost tracking. The UUID vs hex-string DB type mismatch class of bug (silent `catch {}` swallowing errors) is the third time this pattern has appeared — worth a class-level audit.
- **HCI30 UI**: After 4 rounds of operator feedback on case-detail layout, converged on left/right split with card boundaries. Operator feedback loop here averaged < 1 session per iteration.
- **Soulful watch**: Backup failures on old Hostinger path are probably moot post-migration, but `video/[id]` DELETE is actively breaking a published article. Fix the DELETE route before migration.
