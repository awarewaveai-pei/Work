# Weekly Summary 2026-09-28

## Completed this week

### Cognitive OS — Major Feature Sprint
- **Result page redesign** (2026-09-26 續61/62): Cards ①–⑨ + approve card; interpretation contract 1.1.0 (summary, units, focus, solutions, loop, trend); `detail_integrity` gate; deployed `1fbb021f` to prod.
- **My Projects feature** (2026-09-27 續1/3): Click-through per-project; per-analysis row (status, time to minute, result/progress links); "execute in this project" via `?project=`; URL changes to analysis page on submit. Deployed `b6936ecc`.
- **Research line P1 (WC-P1-01–14) all on prod** (2026-09-26 续52/54/55): COS journal key `local-dev`, COLLECT_RESEARCH tokens wired through compose + Trigger.
- **Research line WC-P1-15 期末閘 8/9** (2026-09-26 续59): DOD ①–④ ⑥–⑨ PASS; ⑤ prod erasing not verified (R29, operator action).
- **Research line WC-P2-07a merged** (2026-09-26 续63): `literature_search` returns project academic sources when project has them.
- **Research line WC-P2-07b merged** (2026-09-27 续2): `run_recipe` passes `project_sources`; NA sink classifies academic collector as `source_class=academic`.
- **Research line WC-P4-01 merged** (2026-09-26 续64): `render_research_report` pure function + `report_refs_resolvable` gate; all citations must resolve to manifest sha256; injection-proof via `_literal` + `_seal_section`.
- **Research line P2 planning** (2026-09-26 续57/60): §12.8 v1.52 with K1–K8 decisions, interface P-a–P-i, cards WC-P2-01–09 + WC-P3-01; cloud T28–T31 parallel; cloud credit $60 allocated.

### Infrastructure / Security
- **hooks linked-worktree junction fix** (2026-09-27 续4): `Resolve-MonorepoRootWithAoResume` now treats linked worktrees as non-root (`.git` is file → `$null`); `ensure-claude-junction.ps1` rejects worktree; `agent-dispatch-log.js` updated. Prevents `~/.claude` deletion via worktree rm. (v-int2 incident closed)
- **POD order inbox sweep** (2026-09-26 续56): Trigger task `pod-order-inbox-sweep` every 10 min; `POD_INBOX_SWEEP_TOKEN` wired; smoke `pod_order_inbox` ok.
- **T26 Printful/Woo mode gate** (2026-09-26 续51/53): Printful writes check system mode; Woo webhook always 2xx (deferred); sweep + retry backoff; deployed next-admin `2c0604708`.
- **DB migration ledger** (completed earlier, 2026-09-26 续): `public.schema_migrations` table + `apply-db-migration.mjs`; 90 applied / 4 missing (0022/0024/0037/0057).

### Security (prior week completions now in TASKS as [x])
- Auto-Repair SSH target updated to ks-aw-01 (pinned host key + forced-command gate) — 2026-09-23
- 4 live configs cleaned of retired IPs (CF whitelist×3, fail2ban ignoreip) — 2026-09-23
- hosting-bridge key rotated (`HOSTING_BRIDGE_SSH_KEY_B64`) — 2026-09-24
- SSH aliases for retired IPs removed from `~/.ssh/config` — 2026-09-24
- `OPS_INBOX_INGEST_TOKEN` plaintext removed from crontab — 2026-09-24
- Soulful wp-cron reconnection + nginx stale-while-revalidate + slow-request mu-plugin — 2026-09-24
- `update-client-wp-plugins.ps1` config now points to correct live site — 2026-09-24
- Smoke test extended to check `backup_script_probe.sg/eu` — 2026-09-24

---

## Open tasks

### A. ⏰ Has external deadline
- **Soulful 搬站 買機死線 2026-09-30 (TODAY)** — machine must be purchased or Soulful migration plan at risk
- **🔴 Soulful 網站搬離 Hostinger 硬死線 2026-11-12** — main migration complete (2026-08-28), remaining: ③ domain to CF Registrar, ④ hosting expiry
- **⚠️ 逾期 134 天｜Defender trojan `Trojan:Win32/PowhidSubExec.B`** — source investigation and remediation (originally due 2026-06-17)
- **Codex stop-time review gate re-enable** — was disabled 2026-08-25; due date 2026-08-31 (OVERDUE)

### B. 🔒 Blocked on operator
- **🔴 staging WP admin passwords in Trigger.dev run output** — 2 live sites need password rotation + 9 run redacts + deploy
- **🔴 `HF_TOKEN` plaintext in conversation transcript** (2026-08-27) — rotation needed
- **🔴 2026-08-15 transcript credential leaks** — 3 items pending rotation
- **Codex `/hooks` trust not executed** — Codex side has zero mechanical gates until operator runs `/hooks` trust in Codex
- **DMARC upgrade** (2026-09-28 trigger) — `p=none → p=quarantine;pct=25`; needs operator confirmation of rua reports
- **Postiz Task 2 OAuth app review** — Meta IG+FB / Reddit / LinkedIn submissions needed
- **Postiz draft cleanup** — delete test draft `cmqo1wijz0005p58ncl1mtssr`
- **Postiz → ClientHub account link** — operator must link Bluesky integration in ops/clients

### C. 🔒 Blocked on external
- **蒙古客戶 Cloudways 實際建站** — waiting for client payment
- **Scenery Travel Mongolia new site** — waiting for client

### D–G. Ready to execute
- **MainWP E2E** — bridge fixed (2026-09-24), next-admin deployed `b8c191698`; need one real create-wp-site run to verify
- **Research line WC-P1-15 ⑤** — prod data erasing (operator authorized; R29)
- **Research line WC-P2-02–09** — per §12.8 plan; some cloud T28–T31 may be complete
- **Cognitive OS remaining pages** — check-mocks.py `--page` missing for: home, tool catalog, tool page, workflow pages
- **KB: `provenance` + `author`断 at sink** — `KnowledgeInput` missing fields; blocks §1.3b completion
- **KB: per-model partial HNSW** — needs EXPLAIN with ~2000 rows; also `bm25_tsv` dead column
- **KB migration 0076 deferred items** — 5 accepted non-blockers (see TASKS)
- **`video/[id]` DELETE no reference check** — 🔴 client site already broken (Soulful post id 7393)
- **4 DB migrations never applied to prod** — 0022/0024/0037/0057
- **nginx hci.aware-wave.com block drift** — repo missing server block; risk: overwriting prod with repo file breaks hci site
- **`git-align-main-aoresume-feature-*` swallows uncommitted edits**
- **workflows package missing typecheck step**
- **Woo reconciliation: webhook status + failure_count**
- **10 staging orphans / ~2GB** — deprovision path ready, awaiting operator decision
- **R2 remotion/ objects (~200MB) not covered by reconciliation**

### H. 🧊 Known risks / not processing
- WPvivid Google Drive refresh_token in conversation history — operator decided not to process
- Codex stop-time review gate disabled (2026-08-25) — waiting re-enable

---

## System health

Based on most recent smoke and status data (integrated-status-LATEST.md is stale — generated 2026-08-29; no fresh smoke in repo):

**Infrastructure**: Single host `ks-aw-01` (145.239.195.47, SSH -p 58122). SG+EU VPS fully merged 2026-08-31. No other hosts.

**Cognitive OS**: Running on prod; `b6936ecc` is latest. 3 SQLite databases healthy at last deploy.

**lobster next-admin**: `b8c191698` on prod (DEPLOY_HOLD resolved 2026-09-26).

**Trigger.dev**: v20260926.6 (16 tasks), self-hosted on ks-aw-01.

**Known blind spots**: `integrated-status-LATEST.md` is 30 days stale. Fresh smoke was not run by this session (remote container, no SSH or pwsh access). Recommend running `/health` on next live session.

---

## Risks & blockers

| Severity | Item | Action needed |
|---|---|---|
| 🔴 BLOCKER | Soulful 買機死線 **2026-09-30 (today)** | Operator must purchase machine or extend plan |
| 🔴 SECURITY | Staging WP admin passwords in Trigger run output | Operator: rotate 2 sites + redact 9 runs + deploy |
| 🔴 SECURITY | HF_TOKEN + 2026-08-15 leaks | Operator: rotate tokens |
| 🔴 CLIENT IMPACT | Soulful broken image (video/[id] DELETE no ref check) | Fix `video/[id]` route or restore R2 object |
| 🔴 GOVERNANCE | Codex zero mechanical gates | Operator: run `/hooks` trust in Codex session |
| ⚠️ OVERDUE | Defender trojan investigation (134 days) | Security review |
| ⚠️ OVERDUE | Codex review gate still disabled (28 days past due) | Re-enable |
| ⚠️ TECH DEBT | 4 DB migrations (0022/0024/0037/0057) never applied to prod | Apply with `apply-db-migration.mjs` |
| ⚠️ DRIFT | nginx hci.aware-wave.com block missing from repo | Add to repo before any nginx overwrite |

---

## Memory highlights

- **Single-host era**: ks-aw-01 is the only prod host since 2026-08-31. All prior SG/EU IP references in scripts/config have been cleaned or flagged.
- **Cognitive OS is the main product in active development**: Research line P1 complete (14 cards on prod); P2 work started with cloud parallel agents T28–T31.
- **Interpretation contract 1.1.0** introduces structured output fields (summary, units, focus, solutions, loop, trend) with `detail_integrity` gate enforcing citation resolution and data provenance.
- **hooks junction incident (v-int2, 2026-09-27)**: AO hooks could silently corrupt `~/.claude/` when run from a linked worktree. Fixed — `.git` file (not directory) = non-root, skip all junction/AO-RESUME side effects.
- **Oracle review gate architecture**: Claude writes → Codex reviews; Codex writes → Claude reviews. Both use `agency-os/reports/oracle/` artifacts with date-based gates. `bughunt-oracle.ps1` verifies BUGHUNT_DONE `hits=0` claims against actual grep.
- **AGENTS.md §5 session limit**: Max 2 sessions sharing working directory simultaneously (8-session incident burned 5h quota). Worktree-based parallel agents (in `D:\tmp\wt-*`) are exempt from this count.
- **AO lifecycle**: `ao-resume-on-prompt.ps1` runs once per session; `ao-close.ps1` is pre-authorized at AO-CLOSE triggers. Linked worktrees now correctly skip AO-RESUME side effects.
