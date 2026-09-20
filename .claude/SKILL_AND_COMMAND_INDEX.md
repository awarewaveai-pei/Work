# Skill & Command Index

> 自訂 slash command 與 SKILL.md 技能的完整索引。
> SSOT = `.claude/commands/*.md`（slash command）+ `.claude/skills/*/SKILL.md`（技能）。
> Last generated: 2026-07-02

兩類：
- **Slash commands**（`.claude/commands/*.md`，共 41）— 打 `/<name>` 觸發。
- **Skills**（`.claude/skills/`，共 12）— 由 Skill 工具依描述/trigger 詞自動載入。

---

## A. Slash Commands（41）

### AO 生命週期 / 每日

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/ao-resume` | 開工：依 AGENTS.md §快速續接 跑 AO-RESUME，輸出 AO-RESUME 報告（§0–§8）摘要。 | [commands/ao-resume.md](commands/ao-resume.md) |
| `/ao-close` | 收工：依 AGENTS.md + 40-shutdown-closeout.mdc 跑完整 AO-CLOSE（預授權）。 | [commands/ao-close.md](commands/ao-close.md) |
| `/recap` | 收工前先看今日工作摘要再決定是否關機。 | [commands/recap.md](commands/recap.md) |
| `/tasks` | 列出所有目前開著的待辦。 | [commands/tasks.md](commands/tasks.md) |
| `/tomo` | `/tomo <hint>` carry-over 協定：建跨 session handoff packet。 | [commands/tomo.md](commands/tomo.md) |
| `/checkpoint` | 從 monorepo 根跑 session 中途 git checkpoint。 | [commands/checkpoint.md](commands/checkpoint.md) |
| `/signals` | 抓某時段 Slack + Telegram 訊息（情境觸發時 Claude 必先自動跑）。 | [commands/signals.md](commands/signals.md) |

### 驗證 / 審查 / 稽核

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/verify` | 跑 build gates，確認所有品質與治理 gate 在 commit/deploy 前通過。 | [commands/verify.md](commands/verify.md) |
| `/verify-recent` | 驗證本 session 改過的 code 檔（syntax + critic + 實測）。 | [commands/verify-recent.md](commands/verify-recent.md) |
| `/review` | 對上次 commit 以來變更的檔做 code review，深度依改動大小與敏感度調整。 | [commands/review.md](commands/review.md) |
| `/codex-review` | 跨模型 oracle——**Claude 寫的**改動的 R0 Review 動作，落地 ORACLE gate artifact。 | [commands/codex-review.md](commands/codex-review.md) |
| `/claude-review` | 跨模型 oracle——**Codex 寫的**改動的 R0 Review 動作（反向 oracle）。 | [commands/claude-review.md](commands/claude-review.md) |
| `/audit-repo-hygiene` | repo hygiene 稽核：case-collision（AO-CLOSE 硬闥）+ oversized-file（資訊性）。 | [commands/audit-repo-hygiene.md](commands/audit-repo-hygiene.md) |
| `/apply-audit` | 以完整紀律套用 audit 報告的 ready-to-apply patches。 | [commands/apply-audit.md](commands/apply-audit.md) |
| `/audit-encoding` | 跑 PowerShell 腳本的 CP950 / encoding-trap 稽核。 | [commands/audit-encoding.md](commands/audit-encoding.md) |
| `/audit-cross-machine-bom` | 稽核跨 Google Drive 同步的 `.md` 的 UTF-8 BOM 合規；可 backfill。 | [commands/audit-cross-machine-bom.md](commands/audit-cross-machine-bom.md) |
| `/doc-sync` | 跑 doc-sync 自動化，對齊治理文件的交叉引用與 synced section。 | [commands/doc-sync.md](commands/doc-sync.md) |
| `/sync-check` | 跑 Claude Code 跨機 sync 驗證器並回報。 | [commands/sync-check.md](commands/sync-check.md) |
| `/health` | 跑系統 health check 並回報。 | [commands/health.md](commands/health.md) |
| `/smoke-test` | 跑每日機械 smoke test（AO-RESUME 後第一個檢查）。 | [commands/smoke-test.md](commands/smoke-test.md) |

### 部署 / VPS

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/sg-deploy` | SSH 進 ks-aw-01 跑 `sg-deploy.sh` 部署 lobster-phase1 服務（指令名稱為歷史，SG 已整併）。 | [commands/sg-deploy.md](commands/sg-deploy.md) |
| `/check-drift` | 對 ks-aw-01 production 跑 deploy drift checker 並回報。 | [commands/check-drift.md](commands/check-drift.md) |
| `/ks-aw-01-reboot` | 唯一現役主機 ks-aw-01 的安全重啟（完整 pre/post-flight）。取代已删除的 `/sg-reboot`／`/eu-reboot`。 | [commands/ks-aw-01-reboot.md](commands/ks-aw-01-reboot.md) |
| `/auto-reboot-status` | 檢查 VPS auto-reboot 系統健康（B-Minimal，唯讀診斷）。 | [commands/auto-reboot-status.md](commands/auto-reboot-status.md) |
| `/command-plane-verify` | 診斷 Telegram bot 為何沉默；跑 -Verify 並查主機 docker env。 | [commands/command-plane-verify.md](commands/command-plane-verify.md) |
| `/phase4-check` | 手動觸發 Repair Center Phase 4 週檢（fallback 路徑）。 | [commands/phase4-check.md](commands/phase4-check.md) |

### 客戶 / 租戶 / WordPress

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/client-onboarding` | 用 client-onboarding subagent 把新客戶上線到 Ops Dashboard。 | [commands/client-onboarding.md](commands/client-onboarding.md) |
| `/client-status` | 顯示所有（或單一）客戶的健康與 WP plugin 更新狀態。 | [commands/client-status.md](commands/client-status.md) |
| `/build-tenant` | 用 Lobster Factory workflow 佈建新客戶租戶。 | [commands/build-tenant.md](commands/build-tenant.md) |
| `/wp-maintenance` | 跑 WP 維護狀態/備份檢查/更新規劃/backup-gated 安全更新。 | [commands/wp-maintenance.md](commands/wp-maintenance.md) |
| `/playwright` | Playwright 瀏覽器自動化：smoke、QA flow、客戶站驗證、截圖。 | [commands/playwright.md](commands/playwright.md) |

### Secrets / 環境 / 雜項

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/vault-status` | 顯示 vault 金鑰盤點與對 MCP 設定的對齊缺口。 | [commands/vault-status.md](commands/vault-status.md) |
| `/vault-sync` | 把所有 vault secret 同步到 Windows user env 並回報對齊。 | [commands/vault-sync.md](commands/vault-sync.md) |
| `/decide` | 觸發 decision-intelligence agent 做結構化多 agent 決策審查。 | [commands/decide.md](commands/decide.md) |
| `/strategy-review` | 觸發 strategy-review 技能做多角度策略審查。 | [commands/strategy-review.md](commands/strategy-review.md) |

### 編碼工作流（新增 2026-06-04，整合自 mattpocock/skills）

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/caveman` | 壓縮 ~75% token 的說話模式。持續生效直到 "stop caveman" 或 "normal mode"。 | [commands/caveman.md](commands/caveman.md) |
| `/zoom-out` | 叫 agent 往上拉一層抽象，給出所有相關模組 + caller 的地圖。 | [commands/zoom-out.md](commands/zoom-out.md) |

---

### 維運 / 發版（2026-07-02 稽核補登）

| 指令 | 描述 | 路徑 |
|---|---|---|
| `/browser-test` | Chrome MCP 真瀏覽器 e2e 測試入口。 | [commands/browser-test.md](commands/browser-test.md) |
| `/provision-client` | 一鍵租主機（供應商依客戶而定，勿預設 Hetzner）+ day-1 硬化 + DNS。 | [commands/provision-client.md](commands/provision-client.md) |
| `/wp-bridge-release` | wp-bridge 外掛發版（release repo tag → GitHub Release zip）。 | [commands/wp-bridge-release.md](commands/wp-bridge-release.md) |
| `/wp-redirect` | WordPress 301/302 轉址（Rank Math）。 | [commands/wp-redirect.md](commands/wp-redirect.md) |

### 已退役（2026-09-20 删除）

保留一行是為了讓舊文件裡的指令名還查得到去路；檔案本身不再存在，也不再進每轮的指令清單。

| 已删除指令 | 原因 | 現行去路 |
|---|---|---|
| `/sg-reboot` | SG `5.223.93.113` 2026-08-30 已删機 | `/ks-aw-01-reboot` |
| `/eu-reboot` | EU `204.168.175.41` 2026-08-30 已删機 | `/ks-aw-01-reboot` |
| `/origin-lockdown` | 指向已删除的 SG 主機 | `runbooks/CLOUDFLARE-WAF-SETUP.md` §Origin Lockdown SOP + OVH Edge Firewall |
| `/fix-sidebars` | Cursor 2026-08-26 退場，`scripts/fix-cursor-ai-sidebars.mjs` 已不存在 | 無（不再適用）|

---

## B. Skills（13）

### 現有系統 Skills

| 技能 | 描述 | 路徑 |
|---|---|---|
| `feature-plan` | 規劃新功能：分析需求、拆技術任務、評估影響、更新 plan.md。觸發：「規劃功能 / 新功能 / 我想加一個 / plan a feature」。先跑 5-level 檢查。 | [skills/feature-plan/SKILL.md](skills/feature-plan/SKILL.md) |
| `level-check` | 用 5 Levels of Claude Code 框架稽核當前專案並自動修補缺口。觸發：「檢查 claude 層級 / 盤點專案結構 / level check」。 | [skills/level-check/SKILL.md](skills/level-check/SKILL.md) |
| `qa-review` | 在本地 dev 環境跑 QA 測試並產結構化報告。觸發：「跑 QA / 測試功能 / 找 bug / 上線前測試」。先跑 5-level 檢查。 | [skills/qa-review/SKILL.md](skills/qa-review/SKILL.md) |
| `sdd-update` | 同步系統設計文件（SDD）與近期 code 改動。觸發：「更新 sdd / 同步設計文件 / 技術文件過時了」。先跑 5-level 檢查。 | [skills/sdd-update/SKILL.md](skills/sdd-update/SKILL.md) |
| `strategy-review` | 非工程決策的多角度策略審查（選工具/客戶/商業/廠商/整合）：四角色協作、紅藍隊、pre-mortem，產可升 ADR 的決策紀錄。 | [skills/strategy-review/SKILL.md](skills/strategy-review/SKILL.md) |
| `browser-test` | Chrome MCP 驅動真實 Chrome 的 live e2e 測試（登入態/Canvas/React state）。 | [skills/browser-test/SKILL.md](skills/browser-test/SKILL.md) |

### 日常 Coding 工作流 Skills（整合自 mattpocock/skills，2026-06-04）

| 技能 | 描述 | 路徑 |
|---|---|---|
| `grill-me` | 逐一追問計畫/設計直到達成共識，每題提供推薦答案。觸發：「grill me / 問爆我 / 逼我想清楚 / 壓力測試計畫」。 | [skills/grill-me/SKILL.md](skills/grill-me/SKILL.md) |
| `grill-with-docs` | 逐一追問並同時更新 CONTEXT.md 詞彙表 + ADR。觸發：「grill with docs / 對齊設計 / 確認術語 / 更新詞彙表」。 | [skills/grill-with-docs/SKILL.md](skills/grill-with-docs/SKILL.md) |
| `tdd` | 紅綠重構 TDD：垂直切片、行為測試、mock 只在系統邊界。觸發：「TDD / 寫測試 / red-green-refactor / test-first」。含 tests.md / mocking.md / deep-modules.md / interface-design.md / refactoring.md。 | [skills/tdd/SKILL.md](skills/tdd/SKILL.md) |
| `diagnose` | 六段 debug loop：feedback loop → 複現 → 假說 → 插樁 → 修復 → 清理。含 R0 WORKLOG 要求。觸發：「diagnose / debug this / 找不到 bug / 一直報錯 / 效能問題」。 | [skills/diagnose/SKILL.md](skills/diagnose/SKILL.md) |
| `prototype` | 兩個分支：邏輯原型（終端 app）或 UI 原型（同一 route 多 variant）。觸發：「prototype / 做個原型 / 先試試看 / 試幾個設計」。含 LOGIC.md / UI.md。 | [skills/prototype/SKILL.md](skills/prototype/SKILL.md) |
| `improve-codebase-architecture` | 找架構「加深機會」，生成視覺 HTML 報告，進 grilling session。觸發：「架構改善 / 重構機會 / 模組太分散 / 很難測試」。含 LANGUAGE.md / DEEPENING.md / INTERFACE-DESIGN.md / HTML-REPORT.md。 | [skills/improve-codebase-architecture/SKILL.md](skills/improve-codebase-architecture/SKILL.md) |

> ⚠️ `skills/integration-javascript_node/` 為**空資料夾**（無 SKILL.md），不是有效技能 — 可考慮清除。
