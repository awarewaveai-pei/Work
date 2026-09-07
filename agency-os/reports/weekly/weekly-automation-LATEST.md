# Weekly Summary 2026-09-07

**Generated**: 2026-09-07T01:07Z (remote-weekly-agent)
**Period**: 2026-09-01 to 2026-09-07
**Prev report**: 2026-08-31 (covered 2026-08-25 to 2026-08-31)

---

## Completed this week

### 2026-09-04 — Governance & Cognitive OS real stack

| Area | Item |
|------|------|
| Governance | AGENTS.md 2nd trimming: 48.7KB → 20.5KB; full text archived to AGENTS_APPENDIX.md |
| Governance | Workflow tool blocked in `permissions.deny` (template + wire-remote-hooks.sh + parity test) — closes 99-agent fan-out incident class |
| Governance | Retired IP cleanup across 12 files (old SG 5.223.93.113 / EU 204.168.175.41 references) |
| Governance | `high-risk-bash-warn.js` updated with active prod host 145.239.195.47; mutation-verified |
| Governance | PowerShell 7.6.5 container install instructions added to CLAUDE.md |
| Cognitive OS | Ollama 0.33.3 + gemma3:4b + AIGateway (Ollama/Anthropic BYOK) deployed as full real LLM stack |
| Cognitive OS | `--coding local-llm`: open/axial/selective coding all model-generated (non-fixture) |
| Cognitive OS | `--transcription meeting-service`: speechbrain 1.1.0→1.1.1 (Windows path bug fixed) |
| Cognitive OS | Tests: 131 → 190; all new gates have mutation tests |
| Cognitive OS | ADR-024 + quota circuit breaker + repeat-failure gate + RUNNABLE_DEMOS registered |

### 2026-09-05 — System Foundry v1.6 + Method Atlas slices 29–33

| Area | Item |
|------|------|
| System Foundry | UI/UX first batch: 27 sections reordered (WHO→WHAT→Business→Ops→Tech), categories merged, group rendering |
| System Foundry | 7 new financial capabilities: OCR accounting, AR aging/collections, bank reconciliation, inventory valuation, auto financial statements, financial analysis |
| System Foundry | External review: 4 findings fixed (manifest git ls-files, schema_runtime $ref, test_selection_matrix ValueError) |
| System Foundry | critic 2C+5M+6m all fixed; clean-checkout 12-step verify chain passed |
| Hooks | `git-commit-scope-guard.js` v5: heredoc + git log pathspec bug fixed; 155/155 hook tests green |
| Cognitive OS (slice 29) | `database_data.reconciliation`: 2 Critical (float precision, builder never recomputed check) |
| Cognitive OS (slice 30) | `database_data.expand_contract_migration`: same Critical class re-caught and fixed |
| Cognitive OS (slice 31) | `devops_sre.capacity_model`: 2 Critical (gate recomputes output without re-validating input) |
| Cognitive OS (slice 32) | `devops_sre.release_readiness_review`: same gate defect recaught; due-diligence gaps |
| Cognitive OS (slice 33) | `devops_sre.runbook_execution`: first slice to proactively apply prior lessons; 394,400-shape oracle proof |
| Cognitive OS total | devops_sre family: 8 members (largest); total 33 slices; 896 tests; golden suite 2786 |

### 2026-09-06 — Massive day: HCI30, Cognitive OS F20, System Foundry gaps

#### HCI30 Wave 1 (9 rounds)

| Round | Item |
|-------|------|
| 3 | `mutation-check-node-gates.ps1`: 12/12 mutations killed; 2 commit rounds of Node gate coverage |
| 4 | `HCI_CONFIDENCE_SPEC.md` partial: method-finding combination; critic 51-mutation scan: 1C+8M+7m all fixed |
| 5 | `HCI_RISK_SPEC.md` partial: severity-floor detection; 1C+3M+3m all fixed |
| 6 | `HCI_EVIDENCE_QUALITY_SPEC.md` partial: per-dimension classification; 2C+4M+5m; first time all 7 citation line numbers correct |
| 7 | Sparse-array debt: `normalizeDimensionScores` + `normalizeEvidenceRefs` (silent fail-open fix — critical class); tests 137→154; 3 mutations added |
| 8 | `dimension_disagreement` field in rollup-trust-domains; tests 154→161; 3 mutations added; ADR-0004 updated |
| 9 | P0-04 3 OPEN specs (Permission/Contradiction/Time Decay — cannot be rushed); `bias-check-gate.mjs` + 20 tests; 161→181 tests; 33→33 mutations |
| Security | C1 fix: `HCI_PERMISSION_SPEC.md` false claim "zero Permission enum definitions" — P0-P6 enum existed in corpus; propagated false claim repaired across 4 files |

#### Cognitive OS F20 Security family

| Slice | Item |
|-------|------|
| 46 `security.attack_tree` | F20 #3; genuine AND/OR compute; critic FAIL→SHIP; 6 Major all fixed; recursion depth guard (M5 found 2nd layer bug) |
| 47 `security.pasta` | F20 #4; fixed 7-stage pipeline; 5040-permutation exhaustive sort verify; critic FAIL→SHIP; 6 Major all fixed; 1 critic directly applied fix |
| 48 `security.dpia_pia` | F20 #5; non-EC§32 member; GDPR Art.35 risk traceability + Art.36 escalation invariants; 71 tests; ADR-002 real use case |
| F20 total | 5/10 complete (STRIDE/LINDDUN/Attack Tree/PASTA/DPIA-PIA); 6 remaining: Zero Trust/Secrets Threat/Supply Chain/Abuse Case/Security Control Mapping |

#### System Foundry — real gaps closed

| Item | Detail |
|------|--------|
| Slices 1–5 | Pricing/Promotions, Fraud/Risk, Logistics/Shipping, PLM/Quality, Merchandising — all landed |
| Slice 6 | Multi-Location Stock (CAP-MULTI-LOCATION-STOCK + CAP-CYCLE-COUNT); CAP-CYCLE-COUNT module redesign after critic BLOCK |
| mutation-coverage gate | 24 derivation rules + 179 requires edges; 1000 random config samples; `make verify` PASS |
| Final state | capabilities=265, modules=51, questions=226, pairwise_valid=25419, pairwise_rejected=6 |

---

## Open tasks

### Security / Credentials (🔴 all require human action)

- **🔴 Trojan:Win32/PowhidSubExec.B** — overdue 80+ days (orig. 2026-06-17), source/cleanup pending
- **🔴 HF_TOKEN明文** (2026-08-27) — rotate pending; 3rd occurrence of same mask-apply-after-read pattern
- **🔴 2026-08-15 transcript credential leak** — 3 tokens to rotate
- **🔴 `claude_desktop_config.json`** — 6 plaintext API keys, no governance
- **🟠 Codex stop-time review gate** — still disabled since 2026-08-25

### Migration / Infrastructure (🔴 hard deadlines)

- **🔴 Soulful off Hostinger by 2026-11-12** (machine purchase deadline: 2026-09-30)
  - EU: Supabase (highest risk, go-last), Trigger.dev, n8n, Postiz, MainWP, Uptime Kuma, Remotion/Video service
  - SG: next-admin, WordPress+DB, Node API, oracle-web, Redis, Grafana/Loki/Promtail
  - Pre-condition: Soulful backups must be reliable before migration
- **🔴 Soulful backups: 5/10 recent failures** (last backup 2026-08-24 = FAIL)
- **🔴 EU backup retention deleted drill-verified backups** — needs fix before migration
- **🔴 `video/[id]` DELETE has no reference check** — live Soulful article already broken (404 video embed)
- **🟠 EU origin not locked to Cloudflare** (step B pending)
- **🟠 `cf-iprefresh` detector erroring for 14+ days, no readers**

### Product / Client

- **Postiz OAuth app review**: Meta IG+FB / Reddit / LinkedIn — manual human submission required
- **Postiz draft cleanup**: delete test draft ID `cmqo1wijz0005p58ncl1mtssr`
- **Postiz client Hub link**: operator must connect Bluesky integration in ops/clients
- **Customer service U6 Chatwoot** — gate lifted (2026-08-30), just not started yet
- **POD A2 confirm phase** — 🔴 payment pipeline; needs explicit authorization before any work
- **Canvas editor browser testing** — operator must test (Claude cannot log in)
- **Mockup Studio diagnosis** — awaiting operator symptom details
- **Scenery Travel Mongolia** — awaiting client card payment for Cloudways

### Technical Debt

- **System Foundry**: 6 capabilities still pull in `CAP-PAYMENTS` even when operator answers "no online payments"
- **HCI30 OPEN specs**: Permission/Contradiction/Time Decay — blocked on operator/product decisions (not code problems)
- **mutation-coverage gate**: 2 graph algorithm defects in `explain_redundant_edge()`/`forced_prereq_qids()` (tracked, not urgent)
- **Phase 4 Check 1/2**: 12 weeks of fake PASS in cloud; now honest SKIP; decision needed (option C: accept SKIP recommended)
- **DOM testing infra**: next-admin has no jsdom/testing-library; 3 confirmed bugs uncatchable by current tests
- **10 staging orphans**: 1969.7MB (4 unregistered, 3 deprovisioned, 6 DB-only); SG disk 67% (48G/75G)
- **Cursor references**: 10 docs still instruct operator to "open in Cursor" (Cursor retired 2026-08-26)
- **SECURITY DEFINER functions**: anon/authenticated gap could be silently reopened by future DROP+CREATE

---

## System health

> Note: integrated-status-LATEST.md was generated 2026-08-29 (9 days ago). No newer integrated status available from this session.

| Component | Status |
|-----------|--------|
| Host | ks-aw-01 (145.239.195.47, SSH -p 58122) — single-machine era post 2026-08-30 |
| Old hosts | SG (5.223.93.113) + EU (204.168.175.41) permanently deleted 2026-08-30 |
| SG disk | 67% used (48G/75G) — staging orphan cleanup needed |
| Soulful backups | 🔴 5/10 failures, last run failed |
| Codex oracle | Quota restricted; stop-time review gate disabled |
| Phase 4 detectors | Check 1/2 = SKIP in cloud (honest); local = PASS |
| HCI30 tests | 181/181 pass (Node); 33 mutations all killed |
| Cognitive OS | 1965 tests OK (Python product root); 48 slices total |
| System Foundry | 226 questions, 265 capabilities — golden suite all PASS |

---

## Risks & blockers

1. **🔴 CRITICAL — Backup reliability**: Soulful 5/10 backups failing. Migration impossible without reliable backup. Hard deadline 2026-11-12.
2. **🔴 CRITICAL — Live site damage**: Soulful published article with broken video embed (DELETE without reference check). Customer-visible.
3. **🔴 CRITICAL — Machine purchase deadline**: Must buy dedicated machine by 2026-09-30 to enable EU→dedicated migration.
4. **🔴 HIGH — Credential exposure**: HF_TOKEN + 3 items from 2026-08-15 unrotated for 1–3 weeks.
5. **🟠 MEDIUM — Governance**: 3 HCI30 specs OPEN; blocked on operator/product input (Permission trust profiles, Contradiction model, Time Decay).
6. **🟠 MEDIUM — Oracle gap**: Codex quota restricted; stop-time review gate disabled; backup review path = self-review + mutation tests only.
7. **🟠 MEDIUM — Parallel session governance**: WORKLOG header truncation happened twice on 2026-09-06 (parallel sessions committing during active sessions); `git add -A` in AO-CLOSE sweeps in-progress files from other sessions.

---

## Memory highlights

- **Single-host epoch**: All 39 containers now on ks-aw-01 since 2026-08-30. No fallback host. Infra runbooks updated.
- **Cognitive OS milestone**: 48 Method Atlas slices total; F20 security family 5/10 complete. Real Ollama LLM stack working for research pipeline (non-fixture).
- **System Foundry v1.6**: 265 capabilities, 226 questions, 6 real gaps closed, mutation-coverage gate covers all 179 requires edges.
- **HCI30 Wave 1**: tests grew 137→181 in one day (2026-09-06); 9 separate rounds of work; 3 OPEN specs require operator input.
- **Anti-pattern #3**: "Claim non-existence without grep" caught for 3rd time in same session. P0-P6 Permission enum existed in corpus; false claim propagated to 4 files before being caught.
- **Anti-pattern: WORKLOG truncation**: Parallel sessions committing to WORKLOG truncated each other's section headers twice on 2026-09-06. Fixed in separate commits each time. Root cause: `git add -A` cross-contamination.
- **Security family design discovery**: F20 has at least 3 distinct structural shapes (per-element STRIDE/LINDDUN, genuine-compute AttackTree, fixed-pipeline PASTA) and first non-EC§32 member (DPIA/PIA).
- **Key operator decisions pending**: Soulful machine purchase (deadline 9/30), HCI30 Permission/Contradiction/Time Decay specs, DOM testing infra, Phase 4 Check 1/2 approach.
