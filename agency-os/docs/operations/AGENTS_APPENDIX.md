# AGENTS.md 附錄（2026-09-04 瘦身搬出的機制細節與歷史）

> `agency-os/AGENTS.md` 每一輪對話都整份注入 prompt（透過 `CLAUDE.md` 的 `@agency-os/AGENTS.md`），所以它只留每輪都用得到的規則；下面這些是「遇到情境才查」的機制細節、判讀規則與歷史教訓，2026-09-04 逐字搬到這裡（含當時日期與措辭），**仍是強制內容**。查表類（觸發語／路由）在 `TOOL_TRIGGER_MAP.md`，不在這裡。

來源與回鏈：每一節標題註明它在 AGENTS.md 原本所屬的段落；AGENTS.md 對應位置留有一行指標。

## AO-RESUME 判讀規則（smoke／client_mail／月度檢查）

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

`ao-resume.ps1` 同時自動執行 `scripts/check-smoke-tests.ps1`（application-layer smoke：n8n MCP + Repair Center health + 客戶網站健康 + n8n workflow 失敗 + **客戶站外寄信失敗**）→ 寫 `reports/status/smoke-LATEST.json` → Claude 在 §1 系統快照回報。使用者不需要記得跑 `/smoke-test`。  
`client_mail` 檢查的存在理由：soulful 的 FluentSMTP 曾指向不接受連線的 `pop.hostinger.com:587`，`wp_mail()` 從 2026-08-03 到 2026-08-16 全部靜默失敗無人察覺。**外掛自帶的失敗通知本身也走 `wp_mail`，警報與被監控的通道一起死**，故監控必須來自站外。  
**判讀 smoke 結果（2026-08-17 起）**：`smoke-LATEST.json` 自帶 `overall` 與 `blind_spots` 兩個欄位，**直接讀，不要自己心算**。`blind_spots` 非空 = 某個關鍵偵測器這輪「什麼都沒量到」（SSH 掛了 / 金鑰不見 / 解析失敗），此時 `overall` 一律 WARN —— 因為「偵測器啞了」不可以長得像「一切正常」，那正是 2026-08-03 事故的形狀。`client_mail` 除了近 7 天失敗數，另查**距上次成功寄信天數**（門檻 `-MailQuietDayLimit`，預設 10）：只數失敗無法分辨「健康」與「已壞但還沒人用到」。門檻**必須低於 14** —— FluentSMTP 的 `log_saved_interval_days=14` 每日清舊日誌，設 14 以上該分支永遠觸發不到。  
每 30 天自動執行月度五項檢查（warn-only，2026-08-24 訂正：原文寫「三項」但 `ao-resume.ps1` 早就是四項，今天再加第五項）：`monthly-system-review.ps1` / `check-supabase-memory-monthly.ps1` / `check-governance-docs-drift.ps1`（4 份核心治理文件一致性）/ `refresh-cf-origin-ips.ps1` / `check-change-impact-matrix-drift.ps1`（`docs/CHANGE_IMPACT_MATRIX.md` 全部 ~85 條關係的 mtime 漂移，不只 4 份核心文件）。結果寫 `reports/`，Claude 在 §1 回報。

## 新部署路徑強制清單（SOP）

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

**新部署路徑強制清單（SOP）** — 每次新增可部署服務時，必須同時完成以下 6 項：

| # | 項目 | 說明 |
|---|------|------|
| 1 | **Unit test gate** | 在 `sg-deploy.sh` 加入 `npm test`；失敗 → abort |
| 2 | **Docker healthcheck** | `docker-compose.yml` 必須有 `healthcheck:`；sg-deploy Step 6 等待 healthy |
| 3 | **HTTP smoke check** | sg-deploy Step 7 `_smoke_check` 加入新端點 curl 驗證 |
| 4 | **Rollback 指令** | `DEPLOY_ROLLBACK_RUNBOOK.md` 補充對應回滾步驟 |
| 5 | **Notification** | Slack/Telegram 通知涵蓋 SUCCESS/FAIL/SMOKE_WARN |
| 6 | **Typecheck gate** | `package.json` 加 `"typecheck": "tsc --noEmit"` + sg-deploy 加 `npm run typecheck` + `.github/workflows/<service>-typecheck.yml` |


## Agent 扇出治理 — 版本教訓（v1→v3）

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

⚠️ **版本教訓（不要重複犯）**：
- v1 掛在 `SubagentStart`——被外部 critic 覆審用真實 spawn 證實完全無效。
- v2 改掛 `PreToolUse` 但只覆蓋 Agent tool，完全沒管 Workflow；matcher 未錨定誤擋真實存在的 `ListAgents`；per-turn 歸零可被多送一句話繞過。
- v3 修完 v2 全部四條，但**只驗證了 Agent tool 路徑是真實 spawn，Workflow 路徑仍是合成 payload**——第三輪 critic 掃真實 transcript 找到 `Workflow` 有 3 種輸入形狀，`scriptPath+resumeFromRunId`（31% 真實用量）完全沒被 v3 的程式碼處理過，會變成無法滿足的永久 block；同時 v3 為了「檔案不要無限長」加的壓縮邏輯，**重新引入了 append-only 設計本來要消滅的 race**（20 並行實測掉 33-45%）。
- 第三輪（現況）修完上述，且回歸測試套件本身也被 mutation test 驗證過（拔掉 guard 後測試真的會失敗，不是空測試）。
- **這條教訓本身也適用於治理紀律，且套用了兩層**：① 同一份程式碼被同一個 reviewer 連續抓到兩輪問題時，第三次修正前必須先做不變量分析（R0「補丁判準」）；② **驗證程序本身也要接受同一套紀律**——「每項都用真實 spawn 驗證」這句話在 v3 寫下時是對 Agent 路徑講的真話，套用到 Workflow 路徑就是自我宣稱未經檢驗；發現即改寫，不維持錯的宣稱。


## Agent 扇出治理 — 真實案例（2026-09-03）

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

**真實案例（2026-09-03，另一 session，Cognitive Engineering OS Phase 5 覆審）**：5 個 reviewer 產出 47 個 finding，設計成每個 finding 配 2 個 refuter 驗證 → 總數衝到 99 個 agent，94 個因 session limit 全部失敗，5 小時額度燒光。閘本身沒壞，是**腳本設計違反這條規則**。

## Agent 扇出治理 — 讀資料階段規則原文（2026-09-04 第一版）

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

**讀資料／理解問題階段：硬性上限 1 個 agent（操作者明訂，2026-09-04，比上面 ≤5/≤10 更嚴）**：正面模板把「理解問題」列為一個角色，這裡曾被誤讀成「可以按子系統拆成多個平行reader」——真實事故：一個 Workflow 派 9 個 agent、每個讀一個子系統，去理解一份 ~300 檔的文件樹，雖然是「按角色」不是「按項目」、也沒超過 ≤10 上限，操作者仍判定不合理，明訂**讀/理解/研究類任務，不管資料量多大，永遠只能 1 個 agent（或自己親自讀 Read/Glob/Grep），不准派多個平行reader**。理由：讀資料是取得資訊，不是需要多個獨立判斷視角，多個reader各自讀一部分再合併，本質上是重複的context載入，不是真平行；真正大型的讀取交給 Codex（`§跨模型oracle`既有路由，非額外開多個Claude agent）或自己讀，不開多顆Claude agent分攤。**這條蓋掉「理解」這個角色的例外**——4-5個角色模板裡的「理解」永遠是1個，不可再拆；「執行」階段（理解完、分派工作後）才適用≤5個agent的上限。**機械閘管不到這條**：`subagent-budget.js`只按數量擋，擋不到「這9個agent各自是不是在做同一件讀取工作」，此規則純靠紀律，如實記錄不誇大。


## 跨模型 oracle — ORACLE gate 機械閘細節

> 原屬 `AGENTS.md`；2026-09-04 逐字搬入。

**機械閘（2026-08-20 起，ORACLE gate）**：上面那條路由表本身**不是自動化** —— 它是文字規則，靠代理自覺。閘補的就是這個缺口：

| 環節 | 機制 |
|------|------|
| 產證據 | `codex-oracle.ps1` 每次跑完把答案寫進 `agency-os/reports/oracle/YYYY-MM-DD-<mode>-<stamp>.md`（進 git，不刪）|
| 驗證據（修改） | `verify-closeout-completeness.ps1` §ORACLE gate：staged 含 source 檔時，該目錄必須有**當日**且**時間戳晚於最後一次改檔**的 review artifact |
| 驗證據（刪除） | 2026-08-24 改版：刪除的檔案沒有 mtime 可比對時間戳，改綁**內容**——artifact 記錄 `- deletions-reviewed: <path>@<blob-hash>`（git diff header 的 `index <hash>..0000000`），gate 對「目前真正 staged 的刪除」算出同一顆 hash，要求路徑+hash 精確相符才算確認；純路徑比對（舊格式 artifact）只在雙方都算不出 hash 時才當備援，避免同日「刪除→復原→改內容→再刪除」被舊記錄誤證（8 輪修正細節見 `WORKLOG.md` 2026-08-24 各 round 條目） |
| 豁免 | 當日 WORKLOG 加 `- ORACLE_WAIVED: <理由>`（看得見，不可靜默省略）|
| 涵蓋副檔名 | `$codeExts` + `.sql .yml .yaml .php .tf .tfvars` —— **刻意不共用 `$codeExts`**，因為那份清單同時驅動 REALTEST/DEBUG-TAG，放寬會靜默擴大三個不相干的閘。SSOT 在 `verify-closeout-completeness.ps1` `$oracleExts` |

修改的時間戳比對是刻意選的：oracle 讀的是**尚未 stage 的工作樹**，所以無法用 staged diff 內容直接綁定；「artifact 必須晚於它宣稱審過的檔案」是唯一可機器驗證的順序關係。它擋的是「早上審完、下午改了才 commit」（codex FINDING 1）。刪除則相反——檔案內容本身（git blob）在被刪前就已定案，反而可以做到比時間戳更精確的內容綁定，2026-08-24 那輪才改用 hash。

**閘擋不到的**：artifact 存在 ≠ findings 被處理。這仍是操作紀律（見 §已知信任邊界）。閘關掉的只有「忘記跑」這個洞。


## 舊 Runbooks 觸發表（TOOL_TRIGGER_MAP.md 2026-08-24 版，2026-09-04 併入症狀表後留存對照）

## Runbooks（12 個）

| Runbook | 查閱時機 | 觸發 |
|---------|---------|------|
| `HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md` | 502 / site down / OOM / container restart loop | 🟢 看到這類症狀立即讀 |
| `HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md` | 可疑 process / 不明高 CPU / crypto miner | 🟢 看到異常 process 立即讀 |
| `SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` | 未授權存取 / credentials 外洩 / 安全事件 | 🟢 任何安全事件立即讀 |
| `COMMAND_PLANE_TELEGRAM_SILENCE_RUNBOOK.md` | Telegram bot 沉默 / command plane 無回應 | 🟢 bot 沉默 > 30 分鐘 |
| `UPTIME-KUMA-MONITOR-FIX.md` | Uptime Kuma 誤報 / 監控設定錯誤 | 🟢 Uptime Kuma 行為異常 |
| `TRIGGER-DEPLOY-CLOUDFLARE-BFM.md` | Trigger.dev deploy 失敗 / Cloudflare BFM | 🟢 Trigger.dev deploy 有問題 |
| `CODEX-CONFIG-ERRORS-FIXES.md` | Codex 設定錯誤 / MCP 連不上 | 🟢 Codex / MCP 設定問題 |
| `ADD-PERIODIC-HEALTH-CHECK.md` | 新增週期性健康檢查的 SOP | ⚪ 需要新增健康檢查時 |
| `CLOUDFLARE-WAF-SETUP.md` | WAF 規則 / scanner 攻擊 / DDoS | 🟢 WAF/掃描攻擊事件 |
| `VPS-AUTO-REBOOT-RUNBOOK.md` | VPS reboot 訊號 escalation | 🟢 reboot 訊號 + 距現在 ≥ 16h |
| `自動排程監控與手機Telegram警報-維護手冊.md` | 雲端排程報告沒更新 / routine source 漂移 / 週報月報 stale | 🟢 排程異常訊號 |
| `HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md` | EU/SG 搬機 / 上 dedicated / 備份策略 / RAID / 災難還原 | 🟢 動機器前必讀 §7 checklist |

---

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/operations/TOOL_TRIGGER_MAP.md`

_Last synced: 2026-09-04 02:19:06 UTC_

