# Monthly Review — 2026-10 (September 2026)

- **Generated**: 2026-10-01 (remote-monthly-agent)
- **Period**: 2026-09-01 → 2026-09-30
- **Previous review**: 2026-07 (2026-08 and 2026-09 reports absent — gap)
- **Health at last closeout**: 100% (328/328, 2026-09-30)
- **Governance drift**: SKIPPED (no PowerShell available in remote Linux container; 2026-09 baseline: WARN, 115-day span)

---

## Accomplishments

### Cognitive OS (Major)
- **Research line P1 fully on prod**: WC-P1-01–14 all deployed; COS journal key `local-dev`, COLLECT_RESEARCH tokens wired through compose + Trigger.
- **WC-P1-15 期末閘 8/9**: DOD ①–④ ⑥–⑨ PASS; ⑤ prod erasing deferred (operator action R29).
- **WC-P2-07a/07b merged**: `literature_search` returns project academic sources; `run_recipe` passes `project_sources`; NA sink classifies `source_class=academic`.
- **WC-P4-01 merged**: `render_research_report` pure function + `report_refs_resolvable` gate; injection-proof via `_literal` + `_seal_section`.
- **WC-P2 planning §12.8 v1.52**: K1–K8 decisions, interface P-a–P-i, cards WC-P2-01–09 + WC-P3-01; cloud T28–T31 parallel; $60 credit allocated.
- **Result page redesign**: Cards ①–⑨ + approve card; interpretation contract 1.4.0 (summary, units, focus, solutions, loop, trend); `detail_integrity` gate; deployed `1fbb021f`.
- **My Projects feature**: Per-project click-through; per-analysis row; "execute in this project" via `?project=`; deployed `b6936ecc`.
- **P4 report API**: Added 2026-09-30.
- **Result-page gap batch** (2026-09-28): C1-10/C3-03 + 13 others — visible copy, input card shared component, expert gate table; web typecheck + 51 tests + golden 4247 pass; not yet deployed.

### Infrastructure
- **SG+EU VPS → ks-aw-01 merge complete** (2026-08-31): 13 DNS switches, OVH Edge Firewall, Codex security review 15 findings closed, switch runbook created. Single-host now `ks-aw-01` (145.239.195.47, SSH -p 58122); no fallback hosts.
- **POD order inbox sweep**: Trigger task every 10 min; `POD_INBOX_SWEEP_TOKEN` wired; smoke `pod_order_inbox` ok.
- **T26 Printful/Woo mode gate**: Printful writes check system mode; Woo webhook always 2xx (deferred); sweep + retry backoff; deployed next-admin `2c0604708`.
- **DB migration ledger**: `public.schema_migrations` + `apply-db-migration.mjs`; 90 migrations applied; 4 missing (0022/0024/0037/0057 — non-blocking, TASKS open).
- **hooks linked-worktree junction fix** (v-int2 incident closed): `Resolve-MonorepoRootWithAoResume` treats linked worktrees as non-root; `ensure-claude-junction.ps1` rejects worktree; prevents `~/.claude` deletion.
- **workflows TypeScript gate**: Added 2026-09-30.
- **HSTS + cookie Secure**: Authored 2026-09-30 (not yet deployed).

### Security
- **claude-opus-5-5 deployed** (2026-09-29).
- **Auto-Repair SSH target** updated to ks-aw-01 (pinned host key + forced-command gate) — 2026-09-23.
- **CF whitelist + fail2ban**: 4 live configs cleaned of retired IPs — 2026-09-23.
- **hosting-bridge key rotated** (`HOSTING_BRIDGE_SSH_KEY_B64`) — 2026-09-24.
- **SSH aliases** for retired IPs removed from `~/.ssh/config` — 2026-09-24.
- **`OPS_INBOX_INGEST_TOKEN` plaintext** removed from crontab — 2026-09-24.
- **Smoke test extended**: backup_script_probe.sg/eu checks added — 2026-09-24.
- **oracle packet fix**: Continuous failure ≥2 → oracle is now robust.
- **sg-deploy .env protection**: No plaintext secrets in deploy outputs (earlier in month).

### Client / WordPress
- **Soulful wp-cron reconnection** + nginx stale-while-revalidate + slow-request mu-plugin — 2026-09-24.
- **Soulful 500 fix, CF Rate Limit fix, wp-admin redirect root cause fix** — 2026-08-29 (prior closeout, worth noting).
- **MainWP bridge fixed** — 2026-09-24; DEPLOY_HOLD resolved 2026-09-26 (next-admin `b8c191698`).

---

## In Progress

| Item | State | Blocker |
|------|-------|---------|
| Research WC-P2 (02–09) + WC-P3-01 | Plan approved §12.8 v1.52; not started | Cloud T28–T31 possibly complete |
| COS result-page gap batch deploy | Code done, tests pass | Operator deploy authorization |
| COS remaining pages | check-mocks.py `--page` missing: home, tool catalog, tool page, workflow pages | Ready to execute |
| KB `provenance`+`author` → sink | `KnowledgeInput` missing fields | Blocks §1.3b |
| KB per-model partial HNSW | Needs EXPLAIN + ~2000 rows | Also `bm25_tsv` dead column |
| KB migration 0076 deferred items | 5 accepted non-blockers | See TASKS |
| 4 DB migrations to prod | 0022/0024/0037/0057 never applied | Ready to execute |
| MainWP E2E | Bridge + deploy done | One real create-wp-site run needed |
| HSTS + cookie Secure | Authored | Rebuild + reload needed |
| DMARC upgrade p=quarantine | Triggered 2026-09-28 | Operator must confirm rua reports |

---

## System Health

### Infrastructure
- **Host**: `ks-aw-01` only (145.239.195.47, SSH -p 58122). No fallback.
- **Last health gate**: 100% (328/328) at AO-CLOSE 2026-09-30.
- **Cognitive OS**: prod `b6936ecc`; 3 SQLite databases healthy at last deploy.
- **lobster next-admin**: prod `b8c191698`.
- **Trigger.dev**: v20260926.6 (16 tasks), self-hosted on ks-aw-01.
- **DB**: 90/94 migrations applied; 4 never applied to prod (non-blocking).

### Governance Drift (2026-10)
**Status: SKIPPED** — `pwsh`/`powershell` unavailable in remote Linux container. Same as 2026-07 monthly review.

Reference — 2026-09 drift baseline (generated 2026-09-12):
| Check | Status |
|-------|--------|
| existence | PASS |
| mtime_drift | WARN (span=115 days) |
| cross_reference | PASS |
| footer_present | PASS |
| mcp_set_consistency | PASS (20 shared MCPs, 0 divergence) |

Oldest doc: `TOOLS_DELIVERY_TRACEABILITY.md` (2026-05-20, 115 days stale). No structural failures; informational only.

### Open Security Debt
| Severity | Item |
|----------|------|
| 🔴 | Staging WP admin passwords in Trigger run output — 2 sites, 9 runs, redact + deploy |
| 🔴 | `HF_TOKEN` plaintext in transcript (2026-08-27) — rotation needed |
| 🔴 | `video/[id]` DELETE no reference check — client site broken (Soulful post 7393) |
| ⚠️ OVERDUE +99d | Defender trojan `Trojan:Win32/PowhidSubExec.B` source investigation (original due 2026-06-17) |
| ⚠️ | `BATCH_INTERNAL_SECRET` in Trigger run payload (tarot) |
| ⚠️ | `cloudflare-realip.conf` static IP list, no auto-update detector |

### Known Blind Spots
- `integrated-status-LATEST.md` was stale at time of last weekly report (generated 2026-08-29; regenerated by integrated-status routine, current state unknown in remote session).
- Playwright tests not run (remote container, registry EACCES/network blocked).
- HSTS + cookie Secure authored but not yet deployed/reloaded.

---

## Knowledge & Memory

- **ADR**: Cognitive OS interpretation contract 1.4.0 (new version); research line P2 §12.8 v1.52 decisions.
- **Runbooks**: KS-AW-01-HOST-SWITCH-RUNBOOK.md completed and live.
- **Patterns**: `git-partial-worktree-commit.py` + `worklog-insert-entry.py` enforce shared-file commit safety. `bughunt-oracle.ps1` validates BUGHUNT_DONE hits at commit time.
- **v-int2 incident**: hooks junction resolution fixed; CLAUDE.md updated with linked-worktree prohibition.
- **CONVERSATION_MEMORY** most recent entry (2026-08-29): 3-day consolidation, SG+EU → ks-aw-01, 13 DNS, OVH firewall, Codex security 15/15 closed.

---

## Next Month Priorities (2026-10)

### P0 — Hard deadlines
1. **Soulful 搬站 硬死線 2026-11-12**: ③ transfer domain to Cloudflare Registrar; ④ confirm Hostinger non-renewal. Machine purchase was due 2026-09-30 (status unknown — operator action).
2. **Defender trojan postmortem** (overdue 99d+): Source investigation + remediation (`Trojan:Win32/PowhidSubExec.B`).

### P1 — Security rotation (operator-gated)
3. Rotate `HF_TOKEN`.
4. Rotate staging WP admin passwords (2 sites) + redact 9 Trigger run outputs + deploy.
5. Fix `video/[id]` DELETE: add reference check before delete (client site already broken).

### P2 — Active development
6. Deploy COS result-page gap batch (`b…` → prod).
7. Research WC-P2-02–09 execution per §12.8 v1.52.
8. Apply 4 missing DB migrations (0022/0024/0037/0057) to prod.
9. Cognitive OS remaining pages (home, tool catalog, tool page, workflow pages).
10. KB `provenance`+`author` to sink fix.

### P3 — System hygiene
11. DMARC upgrade: `p=none → p=quarantine;pct=25` (confirm rua, then apply).
12. MainWP E2E: one real create-wp-site run.
13. HSTS + cookie Secure rebuild + reload.
14. Codex `/hooks` trust execution.
15. Governance drift check (run on next live session with pwsh available).

---

## Comparison with Last Month

| Dimension | 2026-07 (last available report) | 2026-10 (this report, covering Sep) |
|-----------|--------------------------------|--------------------------------------|
| Monthly reports gap | Was current | 2026-08 and 2026-09 reports absent (scheduled routine missed or not stored) |
| Health gate | 100% (362/362) | 100% (328/328) |
| Active host count | 3 (SG, EU, OVH — in transition) | 1 (ks-aw-01 only, merge complete 2026-08-31) |
| Cognitive OS | P1 planning | P1 on prod; P2 planned; P4 started |
| Security debt | Initial audit | 5+ open rotation items, 1 overdue 99d |
| Governance drift | SKIPPED (no pwsh) | SKIPPED (no pwsh); 2026-09 baseline WARN |
| Open tasks (TASKS.md) | ~117 open | ~117 open (estimate; file too large for full count) |

**Note**: 2026-08 and 2026-09 monthly reviews were not found in `reports/monthly/`. The last stored report was `monthly-review-2026-07.md`. This represents a two-month gap in monthly review cadence. Recommend verifying whether the scheduled routine ran for those months and if the reports were committed.

---

_Generated by remote-monthly-agent on 2026-10-01. Source files: TASKS.md, WORKLOG.md (2026-09-29 to 2026-09-30), CONVERSATION_MEMORY.md, integrated-status-LATEST.md, weekly-automation-LATEST.md (2026-09-28), monthly-review-LATEST.md (2026-07), drift-2026-09.md._
