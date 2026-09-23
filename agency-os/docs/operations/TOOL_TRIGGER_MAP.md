# Tool Trigger Map

> 所有工具的觸發情形一覽。每次新增工具時同步更新本文件。
> Last updated: 2026-09-04（AGENTS.md 五張查表搬入本檔；Runbooks 表合併）

## 圖例

| 符號 | 意義 | 可靠性 |
|-----|------|--------|
| 🔴 Hook | 系統機械強制，我無法繞過 | 100% |
| 🟠 File-path-router | 編輯特定路徑時 hook 自動觸發 | 100% |
| 🟡 AO 生命週期 | Session 開工/收工關鍵字 | 100% |
| 🟢 AGENTS.md 自判 | 我應自行識別情境觸發，靠判斷力 | 中等 |
| ⚪ 需你發動 | 需你明確說或指示，或 High-risk 等 go-ahead | 依你 |

---

## AGENTS.md 觸發與路由正本（2026-09-04 自 AGENTS.md 逐字搬入；AGENTS.md 只留指標）

> 這一節是 `agency-os/AGENTS.md` 瘦身時搬出來的 5 張查表，內容逐字未改（含當時的日期與案例）。它們仍是**強制規則**：`AGENTS.md` 每輪都載入，這裡是「遇到情境才查」的正本。改這裡不必改 AGENTS.md；新增觸發語只在這裡加。

### 問題症狀 → Runbook 路由表


| 症狀 / 告警 | 立即讀取的 Runbook |
|-----------|----------------|
| 網站 502 / 回應極慢 / OOM / container restart loop | `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` |
| 可疑 process / 不明高 CPU / crypto miner 跡象 | `runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md` |
| 未授權存取 / credentials 外洩 / 安全事件 | `runbooks/SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` |
| Telegram bot 沉默 / command plane 無回應 | `runbooks/COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md` |
| Uptime Kuma 監控壞了 / 誤報 / 設定錯誤 | `runbooks/UPTIME-KUMA-MONITOR-FIX.md` |
| Trigger.dev deploy 失敗 / Cloudflare BFM 問題 | `runbooks/TRIGGER-DEPLOY-CLOUDFLARE-BFM.md` |
| Codex 設定錯誤 / MCP 連不上 | `runbooks/CODEX-CONFIG-ERRORS-FIXES.md` |
| 要新增週期性健康檢查 | `runbooks/ADD-PERIODIC-HEALTH-CHECK.md` |
| Cloudflare WAF 規則 / scanner 攻擊 / DDoS | `runbooks/CLOUDFLARE-WAF-SETUP.md` |
| VPS reboot 訊號 + 16h 未處理 | `runbooks/VPS-AUTO-REBOOT-RUNBOOK.md` |
| 雲端排程報告沒更新 / Telegram 排程警報 / routine source 漂移 / 週報月報 stale | `runbooks/自動排程監控與手機Telegram警報-維護手冊.md` |
| EU/SG 搬機 / 上 dedicated 主機 / 備份策略 / RAID / 災難還原 / Cloud→Dedicated 遷移 | `runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` |
| 換更便宜機器 / KS-6 / KS-7 / 整機轉移 ks-aw-01 / 月租退出權 | `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` |

MCP 分工完整表：`docs/operations/cursor-mcp-and-plugin-inventory.md`


### 工作類型 → Agent/Tool 路由表


| 使用者描述的工作 | 自動使用 |
|--------------|---------|
| VPS / Docker / nginx 問題 / container crash | `devops-engineer` agent |
| 前端頁面 / UI 設計 / landing page / component | `frontend-designer` agent |
| 10+ 檔案重構 / rename / 搬移 | `refactor-specialist` agent |
| 框架升級 / 套件 major version bump | `migration-engineer` agent |
| MainWP 連不上 / child site 斷線 | `mainwp-engineer` agent |
| WP 客戶備份 / 更新 / MainWP sync | `wordpress-maintenance-agent` agent |
| PostHog 數據 / funnel / 轉換率 / feature flag | `posthog-analyst` agent |
| 陌生 repo / 第一次接觸這個 codebase | `onboarder` agent |
| 策略 / 要不要做 X / 紅藍隊壓力測試 | `strategy-review` skill |
| 新功能需求拆解 / 要加什麼功能 | `feature-plan` skill |

→ 完整路由表見 [`docs/operations/TOOL_TRIGGER_MAP.md`](TOOL_TRIGGER_MAP.md)


### Claude 工作自觸發規則（不依賴使用者輸入）


這是最重要的一張表。**觸發條件是 Claude 自己在做什麼，與使用者說什麼無關。**

| Claude 正在做的事 | 自動執行 |
|----------------|---------|
| 要實作跨 3+ 模組 / 新功能設計 | 先召喚 `planner` agent 拆任務，再實作 |
| 讀 code 時發現 bug / 異常行為 / 邏輯錯誤 | 召喚 `debugger` agent 系統性追根因 |
| 改動 auth/RLS/金流、DB schema/migration、Supabase、n8n、nginx/docker-compose/Dockerfile、WP 外掛主題路徑 | **🔧 機械閘**：`hooks/rules/file-path-router.js` 按路徑自動 BLOCK 並指路（7 類別）。照閘指示召喚對應 agent；**不可省**：auth 類改完 `critic` → Critical/High 再 `vuln-verifier`；DB 改前 `db-expert`；nginx/docker 先讀 `safe-infra-patch.sh` + 改後立即 health check（§Auto-Repair 紅線）|
| 改動 wp-bridge 外掛 code（`lobster-factory/packages/wp-bridge-plugin/`）並要讓操作者拿到 → bump `AWBRIDGE_VERSION`（header+define 兩處）+ 通過 R0 後 **自動跑 `bash scripts/release-wp-bridge.sh`**（無需詢問），回報 Release URL。**核心坑**：外掛發佈正本是 `awarewaveai-pei/aware-wave-wp-bridge`（push tag `v*` → Action 出 zip）**不是 Work**；只 push Work ≠ 發版。詳 `runbooks/WP-BRIDGE-RELEASE-RUNBOOK.md` / `.claude/commands/wp-bridge-release.md` |
| 改動 `.ts/.tsx` 任何檔案 | 完成前 `npx tsc --noEmit` 必綠（**🔧** `batch-format.js` Stop 時自動跑）；型別錯誤不得宣告完成 |
| 完成任何 code 改動（`.ps1/.ts/.tsx/.js/.sh/.py`）| 跑 `/verify-recent`（**🔧** verify-gate 三件套硬擋未驗證 commit）|
| critic 回報 Critical 或 High 問題 | 召喚 `vuln-verifier` 寫 PoC 確認是否真實漏洞 |
| 改動 governance 文件（`AGENTS.md` / `CLAUDE.md` / hooks）| 改後跑 `/doc-sync`；若同時改了 `.claude/commands/` `.claude/agents/` `.claude/skills/` → 跑 `/sync-check` |
| 任何 R0 任務完成後（輸出 [已修改]）| 跑 `/checkpoint` 存 mid-session commit（tree 乾淨時靜默跳過）|
| 準備 sg-deploy 前 | 自動跑 `/check-drift` + `/verify` + `tsc --noEmit`（有 ts 改動時）|
| sg-deploy 完成後 | 自動跑 `/playwright smoke` |
| wp-maintenance safe-update 完成後 | 自動跑 `/playwright client <slug>` |
| 讀 log / SSH 進 VPS 看到 error / 異常 | 召喚 `incident-responder` 先 triage，再決定 runbook |
| 發現問題需要 web 查規格 / API 文件 | 召喚 `web-researcher`，不靠訓練資料猜 |
| 需要做技術選型 / 架構決策 | 召喚 `decision-intelligence`（`/decide`），不靠直覺推薦 |


### 任務到達協議 步驟 2 — 任務類型預載表

| 任務類型 | 判斷條件 | 預載 |
|---------|---------|------|
| Infrastructure | VPS / Docker / nginx / 服務異常 | `incident-responder` triage → runbook |
| Code change | 新增 / 修改 / 重構程式碼 | 見步驟 3 |
| Client site | soulful / WP / 客戶相關 | `/client-status` 先確認 → `wordpress-*` agent |
| Database | schema / migration / query / 資料 | `db-expert` 先審 → `supabase-engineer`（如涉 Supabase）|
| Security | auth / RLS / permission / 漏洞 | `critic` → `vuln-verifier` |
| Data/Analytics | PostHog / funnel / 轉換率 | `posthog-analyst` |
| Technical decision | 工具選型 / 架構 / A vs B | `/decide` |
| System health | 健康 / 監控 / 是否正常 | `/health` → `/smoke-test` |

### 代理自動工具使用規則（使用者說了某句話 → 觸發）


以下列的是「使用者說了某句話 → 觸發」。流程完成後自動接續的下一步（deploy 完成後跑 smoke、governance 文件改完後 doc-sync 等）不重複列在這裡，見下方 §Claude 工作自觸發規則（2026-08-24 去重：兩表曾各自維護同一批列，改為單一正本）。

| 觸發情境 | 立即執行 |
|---------|---------|
| 使用者提到「改外觀 / 改顏色 / 改主題 / theme / 字體 / 側欄樣式 / 換配色 / 外觀不對 / appearance」 | **先讀** [`app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md`](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md)（外觀系統 SSOT：哪個檔改什麼 + 改完怎麼上線）。**禁止**臆測哪個檔；90% 調整只碰 `lib/theme/tokens.ts` 或 `app/tools/theme/page.tsx` |
| 使用者問某段時間的 Slack / Telegram / 告警 / incident | `scripts/fetch-external-signals.ps1 -From ... -To ...`（無時區預設 CST/UTC+8）|
| AO-RESUME digest `since_utc` 比需要範圍早 > 2 小時 | 補跑 `/signals -From <需要起點>` |
| AO-RESUME | 讀 `reports/status/cf-security-LATEST.md`，列入外部信號段（mtime >24h 才重跑腳本）|
| AO-RESUME／使用者問「Trigger.dev 慢」「EU 卡卡的」「ClickHouse 又爆了嗎」 | 讀 `reports/status/clickhouse-LATEST.md`，於 §1 系統快照點名 verdict（🟢/🟡/🔴）。**要同時看兩類訊號，不可只看資料比**：① **結果面** system/app 資料比（2026-08-15 事故時 345:1）② **機制面** 失敗的 merge 數／stalled merges／單一分區 part 數／最寬系統表欄數／merge 記憶體預算是否生效。2026-08-25 第 5 次事故證明**光看資料比會漏**：merge 失敗時 part 不被消耗，資料量反而停在低點，該次燒了 3 天 CPU 100% 而資料比只有 8.3x（門檻 5x），偵測器在數學上不可能升到 🔴。🟡/🔴 → 檢查 `override.xml` 的產生源設定是否被還原；**禁止**用「調高 mem_limit / 清資料」了事 —— 那正是前三次復發的原因，`max_server_memory_usage` 現由 `validate-config.ps1` 機械鎖定 |
| AO-RESUME／使用者問「CI 過了嗎」「build 綠的嗎」「Actions 有沒有壞」 | 讀 `reports/status/ci-LATEST.md`，於 §1 系統快照點名 verdict（🟢/🟡/🔴）。🔴 = 某個 workflow 已**連續紅 ≥3 次或 ≥7 天**——那不是 flake，是一道閘已經關掉那麼久了（2026-08-15 起 `Trigger infra config guard` 紅了 4 次 10 天沒人發現，直接促成第 5 次 ClickHouse 事故）。**BLIND SPOT 字樣 = `gh` 讀不到，一律當未驗證不當健康** |
| AO-RESUME／使用者問「機器夠不夠用」「記憶體/硬碟還好嗎」「ks-aw-01 撐得住嗎」「要不要再買一台」 | 讀 `reports/status/capacity-LATEST.md`，於 §1 系統快照點名三台 verdict（🟢/🟡/🔴）。**ks-aw-01 門檻刻意最嚴（記憶體 60%／硬碟 60%）**——它是 64GB 買來裝 128GB 規劃的整併目標，這支檢查就是操作者選擇「不砍範圍、改用監控補償」的那個補償本體；它啞了等於規格缺口無人管理。**不可只看 % used**：報告同時給 PSI stall 時間、OOM 次數（vmstat + journal 取大值）、swap、容器重啟數——85% 可能只是可回收的 page cache，70% 也可能正在 thrash。**`blind spots` 非空 = 某個維度這輪沒量到，一律 WARN 不當 PASS**。硬碟高但 `reclaimable` 也高 = docker 垃圾，不是真的滿 |
| 使用者問 Cloudflare 設定是否正常 | `scripts/check-cloudflare-security.ps1` |
| `fetch-external-signals` Telegram 欄出現 `error.*401\|error.*403` | ① curl inbox/digest 確認 403/401 類型；② `secrets-vault.ps1 -Action import-user-env`；③ 更新 `OPS_INBOX_INGEST_TOKEN` 到 User registry；④ 重跑確認 ok。詳見 `runbooks/CLOUDFLARE-WAF-SETUP.md §API 維護` |
| EU VPS `infra-alerts` 出現 scanner 路徑（`/.aws/`、`/.ssh/`、`/wp-config`）且 bad request % > 50 | SSH EU 確認；若持續 → Cloudflare WAF PATCH API 追加 block rule；curl 實測 403。詳見 `runbooks/CLOUDFLARE-WAF-SETUP.md §API 維護` |
| next-admin 程式碼改動後 sg-deploy 失敗且 log 含 `npm test FAILED` | ① 在本機 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/` 跑 `npm test` 查看失敗詳情；② 修好測試或修好程式碼（二擇一，視測試是否合理）；③ commit + push；④ 重跑 `sg-deploy.sh next-admin`。**禁止**：繞過 test gate（--skip-pull + 手動 rsync 或直接 `docker compose build`）。 |
| 訊息含 reboot 訊號（`needs reboot` / `重啟` 等）且含 `ks-aw-01`／`145.239.195.47` | 先讀 `reports/status/auto-reboot-LATEST.md`（verdict 🟢/🟡/🔴）。< 16h → auto-reboot 自動處理，不主動跑指令。≥ 16h 或非 🟢 → escalate 手動 `/ks-aw-01-reboot`（High risk，等 go-ahead）。AO-RESUME 時必點名 verdict。換機期間流程僅見 `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`。 |
| 任何 `Edit`／`Write`／`MultiEdit` 寫入或修改 `.ps1` 檔（CP950 trap class，2026-05-22 backfill-missed-daily.ps1 真實爆過）| **🔧 機械閘**：`hooks/rules/code-change-tracker.js` 修改 .ps1 時自動提示。立即執行 `/audit-encoding --file <該檔絕對路徑>`（exit 0=放行；exit 1=fix：wrap capture site 或加 AUDIT_REGISTRY 豁免）。詳：[.claude/commands/audit-encoding.md](../../../.claude/commands/audit-encoding.md) |
| AO-CLOSE health gate 執行時（`case-collision` class，2026-09-05 由 hci30/HCI30 大小寫分裂路徑事件觸發）| **🔧 硬閘**：`system-health-check.ps1` check 7d 自動跑 `scripts/audit-repo-hygiene.ps1 -CaseCollisionOnly -Quiet`（exit 1 = FAIL，`Add-CriticalFailure`，AGENTS.md 禁止 `-AllowNonPerfectHealth` 繞過）。新增或搬移目錄跨大小寫（Windows 磁碟 vs git index）時主動跑 `/audit-repo-hygiene --case-collision-only` 提前確認。`oversized-file` class 為資訊性、非閘，見 [.claude/commands/audit-repo-hygiene.md](../../../.claude/commands/audit-repo-hygiene.md) |
| 任何 `Edit`／`Write`／`MultiEdit` 改動 code 檔（`.ps1 .ts .tsx .js .jsx .mjs .sh .py`）後即將完成 R0 任務（準備寫 [驗證結果]）| **🔧 機械閘**：`hooks/rules/verify-gate-stop.js` session 結束時提醒。Review 段寫入前強制跑 `/review`（critic subagent，**外部 oracle**）；critic 結論納入 [驗證結果] Review 段。**禁止**：以自我描述替代 critic output。**critic 連續失敗（529/逾時）≥ 2 次 → 改用 `.\scripts\codex-oracle.ps1 -Mode review -Context "<改動說明>"` 當替代 oracle，不再重試同一個失效工具**（2026-08-24：critic 該 session 連續 6 次 529，codex-oracle.ps1 更新至最新版後正常運作；§跨模型 oracle 分工表本就把 Review 動作歸給 Codex，兩者是同一件事的兩條路徑，不是互斥）。詳：[`.claude/commands/review.md`](../../../.claude/commands/review.md) |
| 任何 audit / 抓蟲 / bug class / encoding / silent fail / 工具化 / class-by-class 相關問題或情境 | 先讀 [`docs/operations/BUG_HUNT_PROTOCOL.md`](BUG_HUNT_PROTOCOL.md)（方法 SSOT，5-tier 觸發 + 9-step playbook + KPI）+ [`docs/operations/AUDIT_REGISTRY.md`](AUDIT_REGISTRY.md)（狀態 SSOT）再回答，不靠常識 / 不臨機自創流程 |
| 操作者說「apply audit」／「apply the patches」／「套用 audit」／「把 audit 修一修」／「處理好所有的事」並指涉一份 `agency-os/reports/audit/*.md`（或可從 WORKLOG / AUDIT_REGISTRY 推得最近未 apply 的 logic audit）| **立即執行 `/apply-audit <report-path>`**：強制 §Patch Errata fold-in 在改 code 前 + 跨檔抓蟲 catch-up（grep callsites of new symbols across `lobster-factory/`、`agency-os/`）+ 4-action verify per patch + AUDIT_REGISTRY 🔴 TRACKED → 🔴 FIXED 含 commit hash + WORKLOG entry 含 R0+R4 4 動作。**禁止**：跳過 Errata 折回直接 apply（2026-05-23 三次 push-back 的根因）；Medium-High 風險 patch（prod deploy script / auth / DB migration）沒操作者明示 OK 就 apply。詳：[`.claude/commands/apply-audit.md`](../../../.claude/commands/apply-audit.md) |
| 操作者說 `/tomo <hint>` | secret check → context 抽取 → 6 段 packet → 直接寫 `handoffs/` + TASKS + WORKLOG → commit + push（無 propose 確認）。詳見 [`.claude/commands/tomo.md`](../../../.claude/commands/tomo.md) |
| **部署流程觸發**：使用者說「部署」/「deploy」/「推上去」/「可以上了」/「上線」 | ① `/check-drift` 確認 drift 清零 ② `/verify` 確認 build gate 通過 ③ 若有 `.ts/.tsx` 改動先在本機跑 `npx tsc --noEmit` ④ 三者 pass 才**提議**（不自動）`/sg-deploy`，等明示 go-ahead。**🔧 機械閘**（2026-07-02）：`hooks/rules/high-risk-bash-warn.js` BLOCK ssh→prod VPS 的 sg-deploy/systemctl restart/docker down/reboot，首行 `# CONFIRMED-HIGH-RISK:` 解鎖 |
| 使用者問「系統狀態」/「是否健康」/「health」/「有沒有問題」 | 跑 `/health`；若回報 `sync_check: FAIL` → 接著跑 `/sync-check` |
| MCP tool 回 401 / 403 / connection failed / empty API response | 跑 `/vault-status`；若顯示 key 缺口 → 跑 `/vault-sync`。使用者主動問「vault/密鑰/secret 不見了/API key 哪裡找」同此路由。**🔧 機械閘**（2026-07-02）：`hooks/rules/mcp-health.js` 於 401/403 失敗時自動附 `/vault-status` 路由提示 |
| 使用者提到「客戶」/「soulful」/「WP 更新」/「外掛」/「maintenance」 | 先跑 `/client-status [slug]` 了解現況，再決定下一步 |
| 使用者提到「搬站」/「換主機」/「機器買好了」/「二手 Hetzner」/「soulful 搬」/「Hostinger 到期」/給一個新主機 IP | **先讀 [`tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md`](../../tenants/company-soulful-expression/core/SITE_MIGRATION_RUNBOOK.md)**（步驟／切換／回滾 SSOT），再依 §0.5 → §3 → §4 → §5 → §6 執行。**硬死線 2026-11-12**（Hostinger hosting 不續約）。**禁止**：不讀 runbook 就開始建機或搬檔；重做已完成項（CF zone 14 筆已建、nameserver 已切、信箱 mail-tester 10/10、EU 三份備份 769 MB、還原演練 Drill #1 PASS）|
| 使用者提到「一鍵架站」/「自動開站」/「provision」/「租主機」/「Hetzner 開機」/要在 app.aware-wave.com 加建站按鈕 | **先讀 [`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`](../../../lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md)**：「租 Hetzner 主機+day-1 硬化+DNS」**已寫好且真機驗證通過（2026-06-06）**，核心函式 `packages/workflows/src/provision/provisionClient.ts`。**直接呼叫，禁止重寫**。嵌進 app = 加 API route 呼叫 `provisionClient()`（雙觸發設計）。違反樣態：重新實作租機/cloud-init/secretStore 邏輯（已存在且驗過）。 |
| 使用者提到「app.aware-wave」/「onboarding」/「建站」/「佈建」/「企業佈建」/「ops-console」/「做 Stage N」/「繼續（上次那個建站的）」 | **先讀 [`docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`](APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md) 的「🚀 開工必讀（按順序）」7 步**（藍圖+最新真相+程式+活資料），讀完即完全掌握狀況再動工。這份是 5 階段總藍圖 SSOT（Stage 0 建站引擎已驗；現況/下一步以該檔 §2/§3 為準）。**禁止**：不讀 plan 就臆測卡點；重寫已存在的站層/機層；碰 Tarot（另一 AI 處理）。 |
| 使用者要規劃／設計一個新的、需要長期維護的系統或專案治理架構（新產品線、新治理框架、`docs/HCI` 等尚未有既有 governance 的新建置；不含 `D:\Work` 既有子系統的日常任務）| **先讀 [`docs/operations/GOVERNED_SYSTEM_BUILD_SOP.md`](GOVERNED_SYSTEM_BUILD_SOP.md)**（通用治理建置 SOP；§1 明定何時適用/何時不划算，不是所有專案都要套；§2-9 文件治理層＋§10-17 單一任務執行層，涵蓋規劃閘／來源路由／四動作驗證／不變量／風險分級／交接協議／機械檢查）。**禁止**：對週末原型或一次性小改動套用全套流程（§1 排除）；把 §10-17 誤當成本 repo 還要另外遵守的新規則——那些內容本就是從這份 `AGENTS.md` 的 R0／R4／風險分級抽出來的通用版，`D:\Work` 直接用這份原版即可 |
| Telegram bot 無回應 / 沉默 > 30 分鐘 / 使用者說「Telegram 壞了」/「指令沒反應」 | 跑 `/command-plane-verify` |
| 使用者說「別的 AI 處理好了」/「另一個 session 做了 X」/「之前已經做過」/「似乎完成了」（任何基礎設施 / 安全 / 功能改動）| **🔧 機械閘**（2026-07-02）：`hooks/rules/vbc-reminder.js` 於 UserPromptSubmit 偵測語境自動注入 VBC 提醒。**VBC 協議（強制，R4 SSOT）**：① 先讀 `agency-os/WORKLOG.md` 最近 3 個 `## YYYY-MM-DD` 區塊，找對應 `[已修改]` / `AUTO_TASK_DONE` / `REALTEST_EVIDENCE` → 完整理解「做了什麼、用什麼替代方案」② 才做正向驗證（確認效果符合記錄）③ **禁止**：只查單點系統（CF API / git diff / VPS 單一服務）就宣告「沒做好」— 單層消失可能代表另一層已接手。根因：2026-06-04 CF WAF=0 rules 誤報案例（未讀 WORKLOG 確認 LLAR 已裝） |
| 使用者說「doc 過時了」/「更新設計文件」/「SDD 跟程式碼不一致」/「文件同步一下」 | 跑 `/sdd-update` |
| 使用者要任何測試：「跑 QA/找 bug/上線前測試」「幫我測/瀏覽器/Chrome/e2e」「截圖/效能」 | QA 結構化報告 → `/qa-review`；真瀏覽器 e2e（登入態/Canvas/React state）→ `browser-test` skill（先 `list_connected_browsers`）；smoke/完整/截圖/perf → `/playwright smoke\|qa\|screenshot <url>\|perf` |
| Repair Center 告警（`/api/ops/repairs/health` 回 503 / `ok: false` / Phase 4 失敗）| 跑 `/phase4-check`；若持續失敗 → 讀 `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` |
| AO-RESUME 且今日 TASKS 含部署相關任務 | 在 §7 下一步點名今日 deploy flow：`/check-drift` → `/verify` → go-ahead → `/sg-deploy` → `/playwright smoke` |
| 使用者說「回顧一下」/「今天做了什麼」/「收工前看一下」/「要 close 了嗎」 | 跑 `/recap`（唯讀；確認後才跑 `/ao-close`）；問「任務/還有什麼/今天要做哪些」→ `/tasks` 列 open 待辦 |
| 編輯 Auto-Repair 邏輯路徑（repair-center / webhooks / ops/repairs / sg-deploy.sh 等）| **🔧 機械閘**：`hooks/rules/auto-repair-guard.js` 首次 BLOCK 並列出 4 步前置檢查（閘訊息即完整清單），照做後 re-issue 通過；路徑與步驟 SSOT 在該 rules 檔 |
| 使用者說「grill me」/「問爆我」/「逼我想清楚」/「壓力測試計畫」/「對齊一下設計」 | 有 codebase 相關 → `grill-with-docs` skill（同時更新 CONTEXT.md + ADR）；純概念層 → `grill-me` skill。**Claude 自覺同觸發**：需求有歧義/多可能詮釋時，先 grill 再實作。**禁止**：直接開始實作而不確認需求 |
| 使用者說「TDD」/「寫測試」/「test-first」/「測試先行」/「red-green-refactor」 | 跑 `tdd` skill（整個紅綠重構流程，含垂直切片 + REALTEST_EVIDENCE 要求）。**Claude 自覺同觸發**：開寫新 feature 而未先寫 test → 停下改走 TDD，禁止先寫全部 impl 再補 test |
| 使用者說「做個原型」/「prototype」/「先試試看」/「試幾個設計」/「讓我玩一下」 | 跑 `prototype` skill（依問題類型路由：邏輯問題→LOGIC.md；UI→UI.md）。**Claude 自覺同觸發**：feature 出現 2+ 架構方向無法靠分析裁決 → 提議 prototype 驗證 |
| 使用者說「架構改善」/「重構機會」/「模組太分散」/「很難測試」/「run improve-codebase」 | 跑 `improve-codebase-architecture` skill（探索 → HTML 報告 → grilling loop）。**Claude 自覺同觸發**：發現 shallow module（介面與實作一樣複雜）|
| 使用者說「token 太多」/「caveman」/「be brief」/「壓縮一下」/「less tokens」 | 跑 `/caveman`（持續生效直到 "stop caveman"）|
| 讀 code 時碰到完全陌生的模組區段、不知道 caller 是誰 | 主動跑 `/zoom-out`（不問使用者，直接輸出模組地圖） |
| 使用者說「diagnose」/「debug this」/「一直報錯」/「找不到 bug」/「六段 debug」 | 跑 `diagnose` skill（6 段結構化 loop；複雜 root-cause 時 skill 內部 defer `debugger` agent）。**Claude 自覺同觸發**：debug 第一假說失敗或難複現 → 切 diagnose，不繼續猜 |


## Slash Commands（41 個）

### AO 生命週期

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/ao-resume` | 開工七段式摘要 | 🔴 Hook `ao-resume-on-prompt.ps1` (UserPromptSubmit) + 🟡 開工短句 |
| `/ao-close` | 收工完整流程：WORKLOG + memory + push | 🟡 「收工」「晚安」「bye」「done」等 |
| `/recap` | 今日完成摘要（唯讀）| 🟢 準備收工前 / 「今天做了什麼」|
| `/tasks` | 列出所有 open 待辦 | 🟢 不確定 backlog 狀態 / 「還有什麼」|
| `/tomo` | 跨 session carry-over packet | ⚪ 你輸入 `/tomo <hint>` |
| `/checkpoint` | Mid-session git commit（不 push）| 🟢 每個 R0 任務完成後 [已修改] 輸出後 |
| `/signals` | 抓 Slack + Telegram 訊號 | 🟢 你問告警/incident/外部訊號時 |

### 驗證 / 審查 / 稽核

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/verify-recent` | Code 改動驗證（syntax + critic + exec）| 🔴 Hook `verify-gate-commit.js`（git commit 前 BLOCK）+ `verify-gate-stop.js`（Stop 提醒）|
| `/review` | Critic subagent code review | 🔴 Hook `verify-gate-stop.js` 提醒；🟢 R0 任務完成前強制跑；critic 連續失敗（529/逾時）≥2 次 → fallback 到 `codex-oracle.ps1 -Mode review`（2026-08-24 起）|
| `/verify` | Build gates + 治理 gate | 🟢 準備 sg-deploy 前自動跑 |
| `/apply-audit` | 套用 audit 報告 patches | 🟢 你說「apply audit」「套用 audit」「把 audit 修一修」|
| `/audit-encoding` | `.ps1` CP950 encoding 稽核 | 🔴 Hook `code-change-tracker.js`（.ps1 修改後提醒）|
| `/audit-cross-machine-bom` | `.md` UTF-8 BOM 跨機稽核 | ⚪ 手動 / 改動跨機 .md 後 |
| `/audit-repo-hygiene` | case-collision（硬閘）+ oversized-file（資訊性）稽核 | 🔴 AO-CLOSE 硬閘（`system-health-check.ps1` 7d，case-collision only）；⚪ 手動全掃 / 月度排程挑 oversized-file backlog |
| `/doc-sync` | 治理文件交叉同步 | 🟢 改動 governance 文件後（AGENTS.md / CLAUDE.md / hooks / cursor rules）|
| `/sync-check` | Claude Code 跨機 sync 驗證 | 🟢 改動 `.claude/commands/` 或 `.claude/agents/` 後；`/health` 回報 sync fail |
| `/health` | 系統 health check | 🟢 你問「系統狀態」「有沒有問題」「healthy 嗎」|
| `/smoke-test` | 每日機械 smoke tests | 🟢 AO-RESUME 後第一個動作（Blueprint §3）|

### 部署 / VPS

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/check-drift` | SG production deploy drift 檢查 | 🟢 準備 deploy 前自動跑（`/verify` 之前）|
| `/sg-deploy` | 部署 SG VPS lobster-phase1 | 🟢 `/check-drift` + `/verify` 都 pass 後提議；⚪ High risk — 等明示 go-ahead |
| `/playwright` | 瀏覽器自動化 QA（smoke/qa/client/screenshot/perf）| 🟢 `sg-deploy` 完成後自動跑 smoke；`wp-maintenance` 完成後跑 client |
| `/ks-aw-01-reboot` | ks-aw-01 安全重啟 | ⚪ High risk — 等明示 go-ahead（reboot 訊號 ≥ 16h 後 escalate）|
| `/auto-reboot-status` | VPS auto-reboot 健康診斷 | 🟢 訊息含 reboot 訊號 + VPS 識別字時 |
| `/command-plane-verify` | Telegram bot 沉默診斷 | 🟢 Telegram 沉默 > 30 分鐘 / 指令無回應 |
| `/phase4-check` | Repair Center Phase 4 健康 | 🟢 `/api/ops/repairs/health` 回 503 / `ok: false` |

### 客戶 / WordPress

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/client-status` | 客戶健康 + WP plugin 更新狀態 | 🟢 你提到客戶 / soulful / WP 更新 / 外掛 |
| `/wp-maintenance` | WP 維護（備份 + safe-update）| 🟢 WP update/maintenance 提及；wave 排程到期 |
| `/client-onboarding` | 新客戶上線 Ops Dashboard | ⚪ 明確新客戶指示 |
| `/build-tenant` | Lobster Factory 租戶佈建 | ⚪ 明確佈建指示 |

### Secrets / 工具

| 指令 | 功能 | 觸發 |
|-----|------|------|
| `/vault-status` | Vault key 庫存 + 齊缺狀態 | 🟢 MCP tool 回 401/403 / 你提到 secret/密鑰/key |
| `/vault-sync` | Vault → Windows env 同步 | 🟢 `/vault-status` 顯示缺口後自動接著跑 |
| `/decide` | Decision-intelligence 19 階段決策 | 🟢 A vs B / 架構決策 / 技術選型 / 工具比較 |
| `/strategy-review` | 多角度策略審查（紅藍隊 / pre-mortem）| 🟢 「要不要做 X」「值不值得」「策略審查」|

### 2026-06 後新增（2026-07-02 稽核補登）

| 指令 | 功能 | 觸發 |
|------|------|------|
| `/zoom-out` | 陌生模組地圖（caller/系統層定位）| 🟢 讀 code 碰到陌生區段時 Claude 自動跑，不問 |
| `/browser-test` | Chrome MCP 真瀏覽器 e2e 測試 | 🟢 「幫我測」「瀏覽器測試」「live test」|
| `/caveman` | token 壓縮 ~75%（本 project 永久預設）| 🟢 「caveman」「be brief」「less tokens」|
| `/provision-client` | 一鍵租主機（供應商依客戶而定）+ day-1 硬化 + DNS | 🟢 「一鍵架站」「租主機」「provision」（High 步驟等 go-ahead）|
| `/wp-bridge-release` | wp-bridge 外掛發版（release repo tag → zip）| 🟢 改 wp-bridge code 且 bump 版號後自動 |
| `/wp-redirect` | WordPress 301/302 轉址（Rank Math）| 🟢 「轉址」「redirect」|

---

## 跨模型 Oracle（Codex 協作，2026-08-17 起）

完整分工原則、機械閘細節見 `AGENTS.md §跨模型 oracle`；本節只列工具本身的觸發時機。

| 工具/環節 | 功能 | 觸發 |
|-----|------|------|
| `/codex-review`（2026-08-30 起主力，本 repo 自建 command）| 包住 `/codex:adversarial-review` + 固定附帶隱藏依賴/NO FINDINGS focus text + 自動落地 ORACLE gate artifact | 🟢 R0 [驗證計畫] Review 動作（寫入者 = Claude）；`/review` 的 critic 連續失敗 ≥2 次時的第一層 fallback |
| `/claude-review`（2026-09-19 起，本 repo 自建 command）| `scripts/claude-oracle.ps1`：capture → `claude -p` 唯讀審查 → ORACLE artifact（`-Reviewer claude`）| 🟢 R0 [驗證計畫] Review 動作（寫入者 = Codex）；額度鍵 `critic` |
| `scripts/codex-oracle.ps1 -Mode inspect` | Codex 唯讀讀 repo，回摘要問答 | 🟢 規劃前想省 Claude context 時；`-Prompt "<具體問題>"`（inspect 用途不變，仍為主力）|
| `scripts/codex-oracle.ps1 -Mode review` | Codex 對抗式覆審 working tree（含 untracked 新檔）| 🟡 **降級為備援**：`/codex-review` 連續失敗 ≥2 次時的第二層 fallback（2026-08-30 起）|
| ORACLE gate（`verify-closeout-completeness.ps1` §ORACLE gate）| staged 含 source 檔時強制要求當日 review artifact 存在 | 🔴 Hook（AO-CLOSE 自動強制）；刪除的檔案改用 `path@blob-hash` 內容綁定（2026-08-24），修改的檔案仍用時間戳排序 |
| `bughunt-oracle.ps1` | 機器驗證 `BUGHUNT_DONE hits=0` 宣告是否為真 | 🔴 Hook（AO-CLOSE commit 時，僅覆蓋 ASCII identifier + code 檔）|

---

## Custom Skills（12 個）

### 治理 / 系統 Skills（原有 6 個）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `feature-plan` | 新功能需求拆解 + 技術任務規劃 | 🟢 「新功能」「plan 一下」「我想加一個」|
| `level-check` | 5 Levels of Claude Code 合規稽核 | ⚪ 明確要求 |
| `qa-review` | Dev 環境 QA 測試報告 | 🟢 「跑 QA」「找 bug」「上線前測試」|
| `sdd-update` | SDD 與 code 同步更新 | 🟢 「doc 過時」「設計文件更新」「SDD 跟 code 不一致」|
| `strategy-review` | 非工程策略多角度審查 | 🟢 策略決策 / 紅藍隊 / pre-mortem |
| `ai-decision-intelligence` | 技術決策多 agent 辯論系統 | 🟢 via `/decide` 自動呼叫 |

### 日常 Coding 工作流 Skills（6 個，整合自 mattpocock/skills，2026-06-04）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `grill-me` | 逐一追問計畫直到共識，每題提供推薦答案 | 🟢 「grill me」「問爆我」「逼我想清楚」|
| `grill-with-docs` | 追問 + 同步更新 CONTEXT.md 詞彙表 + ADR | 🟢 「grill with docs」「對齊設計」「確認術語」|
| `tdd` | 紅綠重構 TDD：垂直切片、行為測試、mock 只在邊界 | 🟢 「TDD」「寫測試」「red-green-refactor」|
| `diagnose` | 六段 debug loop（含 R0 WORKLOG 要求） | 🟢 「diagnose」「找不到 bug」「一直報錯」「效能問題」|
| `prototype` | 邏輯原型（終端 app）或 UI 原型（多 variant route） | 🟢 「prototype」「做個原型」「試幾個設計」|
| `improve-codebase-architecture` | 找架構加深機會，生成 HTML 報告 + grilling | 🟢 「架構改善」「重構機會」「很難測試」|

### 瀏覽器測試 Skill（2026-07-02 稽核補登）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `browser-test` | Chrome MCP 驅動真實 Chrome 的 live e2e（登入態/Canvas/React state）| 🟢 「幫我測」「Chrome 測一下」「跑一下 e2e」|

> 註：`/caveman` 是 slash command 非 skill，已移至 Slash Commands 表（2026-07-02 修正歸類）。

---

## Platform Skills（12 個）

| Skill | 功能 | 觸發 |
|-------|------|------|
| `code-review` | Code review（由 `/review` 呼叫）| 🔴 Hook `verify-gate-stop.js` 提醒 |
| `security-review` | 安全深度稽核 | 🟢 critic 回報 Critical 後；⚪ 你要求 |
| `simplify` | 重構簡化 | ⚪ 你要求 |
| `fewer-permission-prompts` | 分析 transcript 加 allowlist | ⚪ 你覺得 permission prompt 太多 |
| `loop` | 週期重複執行 | ⚪ 你說「每 N 分鐘做一次」|
| `schedule` | 排程 remote agent | ⚪ 你要設定排程 |
| `claude-api` | Claude API / Anthropic SDK 開發 | ⚪ 你在寫 Anthropic SDK 程式 |
| `run` | 啟動並驗證 app | ⚪ 你說「跑起來看看」|
| `init` | 新專案初始化 | ⚪ 新 repo / 新專案 |
| `update-config` | 修改 settings.json / hooks | ⚪ 你說「從現在開始每次…」自動化需求 |
| `keybindings-help` | 自訂快捷鍵 | ⚪ 你問快捷鍵 |
| `statusline-setup` | 設定 status line | ⚪ 你要設定 status line |

---

## Agents（25 個）

### DevOps / 維護

| Agent | 功能 | 觸發 |
|-------|------|------|
| `devops-engineer` | SG/EU VPS SSH / Docker / nginx | 🟢 VPS 問題 / container crash / nginx 設定 |
| `incident-responder` | Production 告警 triage | 🟢 讀 VPS log 看到 error / Uptime Kuma DOWN / Sentry 告警 |
| `repair-agent` | 系統健康診斷（唯讀）| 🟢 health check 失敗 / MCP 連線問題 |
| `mainwp-engineer` | MainWP 管理 | 🟢 MainWP 連不上 / child site 斷線 / sync 失敗 |
| `n8n-engineer` | n8n workflow 建立/修復 | 🟠 file-path-router（編輯 `n8n/` 路徑）|
| `trigger-deploy-agent` | Trigger.dev deploy | 🟠 file-path-router（編輯 `trigger/` 路徑）|

### 資料庫 / Supabase

| Agent | 功能 | 觸發 |
|-------|------|------|
| `db-expert` | Schema / migration 安全審查（唯讀）| 🟠 file-path-router（migration/schema 路徑）|
| `supabase-engineer` | Supabase RLS / Edge Function / storage | 🟠 file-path-router（`supabase/functions/migrations/` 路徑）|

### 程式 / 工具

| Agent | 功能 | 觸發 |
|-------|------|------|
| `fullstack-engineer` | P7 全端 feature 實作 | 🟢 跨前後端 feature 需求 |
| `frontend-designer` | UI / 頁面設計 | 🟢 你說要做 landing page / dashboard / UI 改版 |
| `refactor-specialist` | 10+ 檔案大規模重構 | 🟢 重構範圍 ≥ 10 檔案 |
| `migration-engineer` | 框架/套件 major 版本升級 | 🟢 「升級 Next.js」「Vue 2→3」「套件大版本」|
| `onboarder` | 陌生 codebase 快速了解 | 🟢 第一次看這個 repo / 幾個月沒碰 |
| `tool-expert` | 工具選型 / MCP 問題 | ⚪ 工具鏈複雜問題 / MCP 失效 |

### 品質 / 安全

| Agent | 功能 | 觸發 |
|-------|------|------|
| `critic` | Code review + 安全稽核 | 🔴 Hook `verify-gate-stop/commit` 強制提醒；🟢 R0 完成前強制 |
| `debugger` | 系統性 bug 根因分析 | 🟢 讀 code 發現 bug / log 看到異常 / 行為不符預期 |
| `vuln-verifier` | 漏洞 PoC 驗證 | 🟠 file-path-router（auth/RLS 路徑）；🟢 critic 回報 Critical 後 |

### 規劃 / 決策

| Agent | 功能 | 觸發 |
|-------|------|------|
| `planner` | 複雜任務拆解（P9）| 🟢 功能跨 3+ 模組 / 需求模糊需拆解 |
| `decision-intelligence` | 19 階段技術決策辯論 | 🟢 via `/decide`；技術選型 / 架構審查 |

### 客戶 / 佈建

| Agent | 功能 | 觸發 |
|-------|------|------|
| `wordpress-maintenance-agent` | WP 備份 / 更新 / MainWP | 🟢 WP 維護工作 |
| `wordpress-plugin-expert` | WP 外掛 / Kadence / WooCommerce / Fluent | 🟠 file-path-router（wp-content/plugins 路徑）|
| `client-onboarding` | 新客戶上線 Ops Dashboard | ⚪ 明確新客戶指示 |
| `site-builder` | Lobster Factory 租戶佈建 | ⚪ 明確佈建指示 |

### 研究 / 分析

| Agent | 功能 | 觸發 |
|-------|------|------|
| `posthog-analyst` | PostHog 數據 / funnel / feature flag | ⚪ 你問「數據怎樣」「轉換率」「有人用嗎」|
| `web-researcher` | 查 API 規格 / 官方文件 / 版本差異 | 🟢 需要查外部規格或文件，不靠訓練資料猜 |

---

## Runbooks（正本 = 上方 §問題症狀 → Runbook 路由表，2026-09-04）

> 原本這裡的 12 列「Runbook | 查閱時機 | 觸發」表與 AGENTS.md 的 13 列「症狀 → Runbook」表是同一件事的兩份，2026-09-04 合併：症狀表為正本（多 `KS-AW-01-HOST-SWITCH-RUNBOOK.md` 一列），舊表逐字保留在 `AGENTS_APPENDIX.md` §舊 Runbooks 觸發表 供對照。

## Hooks（runner v2 — 單一 runner + 純規則模組）

全部 🔴 機械強制。**接線唯一正本：`mcp/claude-userlevel/hooks/rules.manifest.json`**（本表為快照，數量/清單以 manifest 為準；SessionStart banner 自動報實數）。所有事件經 `node runner.js <event>` 進入，runner 保證：規則 crash = 大聲 fail-open（不擋工作、不拖垮其他規則）、只有 exit 2 是 BLOCK、`bash -c` 字串包裹會被解包掃描、指令偵測以 command-position segments 執行（散文/heredoc 提及指令不誤攔）。

### PreToolUse（在工具呼叫前）

| Rule | 攔截對象 | 作用 |
|------|---------|------|
| `rules/dangerous-bash.js` | Bash | BLOCK：指令位置的 rm -rf、git --no-verify（取代舊 inline blockers — 舊版讀錯欄位從未生效，v2 起真正執法）|
| `rules/branch-protection.js` | Bash | BLOCK：force push 到保護分支；main 上 commit 提示 |
| `rules/commit-quality.js` | Bash | BLOCK：git commit 前檢查 staged debugger statements + secrets |
| `rules/verify-gate-commit.js` | Bash | BLOCK：tracker 有未驗證 code 檔時拒絕 git commit / gh pr merge |
| `rules/high-risk-bash-warn.js` | Bash | BLOCK：docker compose down/stop、VPS rsync/scp、DB migrate deploy、**ssh→prod VPS 部署/重啟**（sg-deploy/systemctl restart/reboot，2026-07-02 Phase 4）；首行 `# CONFIRMED-HIGH-RISK:` 解鎖；bash -c 包裹也攔 |
| `rules/sensitive-file-block.js` | Write\|Edit | BLOCK：寫入 .env/.pem/.key、/secrets/、credentials 路徑 |
| `rules/git-log-injector.js` | Write\|Edit（首次）| BLOCK：顯示上一完整 session 全部 commits（fallback -10），防並行 session 重工 |
| `rules/auto-repair-guard.js` | Write\|Edit | BLOCK（首次/分類）：編輯 Auto-Repair 邏輯路徑前強制 4 pre-checks |
| `rules/config-protection.js` | Write\|Edit | BLOCK：禁止修改 linter/formatter config |
| `rules/suggest-compact.js` | Write\|Edit | WARN：每 ~50 次 tool call 建議 /compact |
| `rules/file-path-router.js` | Write\|Edit | BLOCK（首次/分類）：路由到正確 agent（auth/db/supabase/n8n/nginx/wp/trigger）|
| `rules/mcp-health.js` | mcp__.\* | 執行前檢查 MCP server 健康（backoff 斷路器）|
| `rules/large-file-warner.js` | Read | WARN 500KB / BLOCK 2MB：保護 context window |

### PostToolUse（工具呼叫後）

| Rule | 攔截對象 | 作用 |
|------|---------|------|
| `rules/log-error.js` | .\* | 記錄 tool 錯誤到 ~/.claude/error-log.md（JS 化，不再依賴 jq）|
| `rules/audit-log.js` | Bash | 記錄所有 bash 指令（自動 redact secrets）|
| `rules/accumulator.js` | Write\|Edit | 累積修改的 JS/TS 檔，供 Stop 時 batch format |
| `rules/design-quality.js` | Write\|Edit | 偵測 generic template-like 前端 UI，發出警告 |
| `rules/test-runner.js` | Write\|Edit | 自動跑相鄰 test 檔並回報失敗 |
| `rules/code-change-tracker.js` | Write\|Edit | 記錄修改的 code 檔到 tracker；.ps1 額外提醒跑 audit-encoding |
| `rules/agent-dispatch-log.js` | Agent | 記錄 agent 召喚到 reports/agent-dispatch/ |
| `rules/mcp-health.js` | mcp__.\*（PostToolUseFailure）| 追蹤 MCP 失敗，exponential backoff |

### Stop（Claude 完成一次回應後）

| Rule | 作用 |
|------|------|
| `rules/batch-format.js` | Prettier format + tsc --noEmit 跑所有累積的 JS/TS 改動 |
| `rules/check-console.js` | 偵測修改檔案中的 stray console.log |
| `rules/cost-tracker.js` | 記錄 token 使用量與估算成本 |
| `rules/session-summary.js` | 寫 session summary 到 ~/.claude/sessions/ |
| `rules/verify-gate-stop.js` | 顯示本 session 未驗證的 code 檔清單 + 提醒跑 /verify-recent |

### SessionStart / UserPromptSubmit（機器層）

| Hook | 作用 |
|------|------|
| `rules/session-banner.js` | SessionStart：報告治理狀態（規則/事件數由 manifest 推導，不手寫）|
| `rules/vbc-reminder.js` | UserPromptSubmit：偵測「他方已完成」語境 → 注入 VBC 協議提醒（2026-07-02 Phase 4，非阻擋）|
| `ao-resume-on-prompt.ps1` | UserPromptSubmit（僅工作站）：偵測開工關鍵字 → 觸發 AO-RESUME（300 秒去重）|
| `post-push-trigger-deploy.ps1` | git push 後（僅工作站）：自動觸發 Trigger.dev deploy（若設定）|

### 環境覆蓋

| 環境 | 接線 | 狀態 |
|------|------|------|
| Windows 工作站 ×2 | `settings.template.json` → sync 到 `~/.claude/settings.json` | `sync-claude-userlevel.ps1` 後生效 |
| 遠端 container（Claude Code web）| `scripts/wire-remote-hooks.sh` 產生 `.claude/settings.local.json`（gitignored）| 2026-07-02 前遠端**零機械閘**（稽核發現）；建議設為環境 setup script |

閘健康驗證：`bash scripts/test-hooks.sh`（runner 保證 + 全規則裁決矩陣）。

## 觸發統計

| 觸發類型 | 數量 | 說明 |
|---------|------|------|
| 🔴 Hook 機械強制 | rules.manifest.json 全清單（27 規則）| 依 runner 結構保證；閘壞 = 大聲 fail-open 非靜默 |
| 🟠 File-path-router | 7 類別（db/supabase/n8n/auth/nginx/wp/trigger）| 100% 可靠，編輯路徑時自動 |
| 🟡 AO 生命週期 | 2（ao-resume / ao-close）| 100% 可靠 |
| 🟢 AGENTS.md 自判 | ~59 個工具（含 2026-08-24 補的跨模型 oracle + 2 runbook）| 中等可靠，靠我的情境判斷 |
| ⚪ 需你發動 | ~20 個工具 | High-risk 等 go-ahead / 純 user intent 類 |

## Related Documents (Auto-Synced)
- `docs/operations/AGENTS_APPENDIX.md`

_Last synced: 2026-09-23 03:45:07 UTC_

