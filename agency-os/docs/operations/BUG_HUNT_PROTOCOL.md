# Bug Hunt Protocol — 30 年運轉模型

> 本檔是**方法論 SSOT**（HOW we hunt bugs）。
> 對照：[AUDIT_REGISTRY.md](AUDIT_REGISTRY.md) 是**狀態 SSOT**（WHAT we've audited）。
> AGENTS.md `## 代理自動工具使用規則` 是**觸發規則 SSOT**（WHEN audit fires）。
> 三檔各司其職，零內容重疊。

## 為什麼這份協定存在

2026-05-22 經一日 audit 證實：**半年 vibe coding 累積 ~600-1500 個潛在 bug**——其中只有 ~50-100 個會傷人，其他多數是 latent 永遠不爆。

「修所有蟲」是無底洞。但「每出現一類事故就把那一類永久工具化」是可行的 30 年策略。

本檔記錄這個策略的 **方法、觸發、節奏、KPI**。

---

## 核心原則（每個決策都要過）

1. **不可能掃完所有蟲**（數學上）→ 不要嘗試
2. **每一類蟲只工具化一次**（class-by-class，不重複手工 audit）
3. **Incident-driven 優先，schedule-driven 補強**（真實爆過的最值得工具化）
4. **工具累積 > 手工努力**（30 年複利）
5. **Cap 節奏 1-2 個 class / 月**（避免疲勞 & 主線停擺）

## 5-Tier 觸發模型

### 🆘 Tier 0：外部證據（WAF / CVE / 安全掃描 / vendor advisory）
**觸發**：外部來源指出某類風險（Cloudflare WAF 命中新攻擊模式、CVE 公告影響我們的 dep、pen-test 報告、vendor security advisory）
**動作**：與 Tier 1 同 SLA（當日 MVP / 當週完整 toolchain）
**範例**：未來 CVE 涉及 PowerShell ConsoleHost decoder → 立即建 audit class

### 🔴 Tier 1：真實 production incident
**觸發**：某個 bug 在 production 爆了（資料損毀 / 服務中斷 / 安全洩漏 / 操作者親眼看到 `??` 亂碼）
**動作**：立即啟動 [Build Playbook](#build-playbook-每個-audit-class-的永久化步驟)，把該類爆點工具化
**SLA**：當日完成 audit tool MVP；當週完成完整 toolchain（tool + slash + registry + AGENTS rule）
**範例**：2026-05-22 backfill-missed-daily.ps1 CP950 newline-eating → 全套 CP950 audit toolchain

### 🟠 Tier 2：Critic 反覆抓同類
**觸發**：3 個以上不同 commit / PR / session，critic agent 抓到同一類問題
**動作**：抽象成 audit class，下個月排程處理
**範例**：Empty `catch {}` silent fail（critic round 1/2/3 每輪都抓到）

### 🟡 Tier 3：月度 schedule-driven
**觸發**：每月最後一個週日（或操作者擇期）從 [AUDIT_REGISTRY](AUDIT_REGISTRY.md) ⏳ PENDING 隊列挑 1-2 個
**優先公式**：`blast_radius × likelihood × scope`
- **blast_radius** (1-5)：1=單一腳本、2=同模組、3=跨模組、4=跨服務、5=跨 tenant / prod 影響
- **likelihood** (1-5)：1=理論可能、2=曾觀察 1 次、3=多 session 抓到、4=每週觸發、5=日常觸發
- **scope** (整數)：grep 該 trap pattern 的命中數
- 範例：CP950（blast=3、likelihood=5（已踩）、scope=123）→ 1845 → Tier 1 急
**節奏**：2-4 hr / class

### 🟢 Tier 4：機會主義 + 技術棧變動
**觸發**：
- (4a) verify-gate 在 Edit 某舊檔時，已部署的 audit tool 自動抓到 drift
- (4b) **技術棧變動** —— 引入新 runtime / framework / dependency major version 升級 / 新 OS locale 出現（會 reset bug class 計數）
**動作**：
- 4a：操作者決定當下修，或加進 🟡 TRACKED 等下次
- 4b：在 protocol 此處留 stack-change 紀錄；舊 audit class 重新驗證仍適用、新 audit class 評估是否要建
**範例**：未來如引入 Bun / Deno / 把 PowerShell 7 換成別的 → reset CP950-class 假設，重審

---

## Build Playbook（每個 audit class 的永久化步驟）

每個 class 套以下 9 步，全套 2-4 hr：

```
1. 真實 incident 浮現 / pattern 被 critic 反覆抓
       ↓
2. R0 [現況分析]：盤點全專案 trap sites
       ↓
3. 建 scripts/audit-<CLASS>.ps1
   - AST/grep detector
   - 預設掃描路徑（不含 node_modules/Backups）
   - JSON / human / single-file 多模式
   - Exit 0/1/2
   - 自食其食（dogfood）
       ↓
4. 建 .claude/commands/audit-<class>.md slash command
   - wrap 工具
   - 文件化 trigger 條件
   - Fix template
       ↓
5. AUDIT_REGISTRY.md 新章節
   - 🔴 FIXED / 🟢 CLEAN / 🟡 TRACKED / 🛠 TOOL / ⏳ PENDING
   - Statistics
   - 連結到 commits
       ↓
6. AGENTS.md `## 代理自動工具使用規則` 加 1 條
   - 觸發：某種 Edit/Write 條件
   - 動作：`/audit-<class> --file <path>`
   - 用 tool 當 oracle（exit 0=放行；exit 1=按 fix template）
       ↓
7. Critic deep review 自己的 audit tool（**FP-rate exit gate**）
   - 抓 false-positive / false-negative
   - 抓 AST traversal edge cases
   - 抓 regex 漏字
   - **必須過閘才能宣告 DEPLOYED**：
     (a) 對 dogfood corpus 跑，FP rate < 10%（人工抽 20 個確認）**OR**
     (b) AUDIT_REGISTRY 該 class 章節**明文列舉** accepted-FP 類型 + 理由
   - 為什麼此閘存在：critic 觀察「FP > 10% 的 tool ship → operator 每次 dismiss → tool
     在 month 2-3 死亡 → protocol 變 theater」。30 年最大失敗模式
       ↓
8. 跨機 sync verify + WORKLOG entry
   - git commit + push（自動跨機同步）
   - WORKLOG R0 [驗證計畫] 4 動作完整紀錄
       ↓
9. (Optional) 接入 scripts/system-health-check.ps1 週檢
   - exit 1 在週檢中變 health warning
   - 累積偵測 drift
```

### Step 9.5 — Operator triggerability check（**強制**，2026-05-23 加入）

**規則**：宣告「DEPLOYED + 30 年穩定」前，必須通過此檢核：

> 操作者**不需要記住任何指令名稱、檔案路徑、關鍵字**就能在日常流程中看到 fix 結果或 audit verdict 嗎？

3 個合法答案（其一即可）：

a. **AO-RESUME 自動 surface**：fix / audit 寫 `agency-os/reports/status/<X>-LATEST.md`，`scripts/ao-resume.ps1` auto-call，AGENTS.md 代理自動工具使用規則 table 有對應「AO-RESUME 時讀 X-LATEST.md」row → 七段式自動點名。詳見 [`runbooks/ADD-PERIODIC-HEALTH-CHECK.md`](../../../runbooks/ADD-PERIODIC-HEALTH-CHECK.md)。
b. **AO-CLOSE health gate 失敗會擋**：fix 確保某 invariant，違反時 `system-health-check.ps1` 對應 check FAIL，AO-CLOSE 100% gate 自動擋，操作者必看。
c. **Telegram / Slack alert 主動推**：fix 確保某種異常觸發 webhook → 操作者手機立刻收。

**3 個不合法答案**（觸發 R0 違反，必須補上 a/b/c 才能宣告 DEPLOYED）：

- ❌ 「我做了 `/cmd-name` slash command」→ 操作者不會記指令名
- ❌ 「AGENTS.md trigger rule 寫了，下次 Claude 對話會自動跑」→ 需要操作者先開 IDE + 提到關鍵字 = 不是自動化
- ❌ 「Runbook 寫了完整步驟」→ runbook 是查詢用，不是 surfacing 機制

**為什麼此檢核存在**：2026-05-23 B-Minimal auto-reboot session 操作者明確 push back「我不會知道要問這個」。30 年最大失敗模式是「fix shipped 但 operator never sees」— 跟 §Step 7 FP-rate exit gate 同 spirit（noisy tool dies / invisible fix wasted）。詳見 memory slug `feedback_operator_zero_memory_automation`（路徑因機器而異：`~/.claude/projects/<machine-key>/memory/feedback_operator_zero_memory_automation.md`）。

---

## 兩種 audit shape（決定走 Step 3 還是 /apply-audit）

Build Playbook 預設 **Pattern audit** 形：可機械化偵測（CP950 regex、BOM byte check、sync state diff），產出 `scripts/audit-*.ps1` 工具 + `/audit-<class>` slash command。

但 2026-05-23 Auto-Repair Tier 3 audit 是 **Logic audit** 形：state machine / signature / secret leak / rollback path 等系統邏輯議題，發現的是**具體 patch**（diff + tests），不是 detector rule。

| Shape | Step 3 產物 | Step 5 AUDIT_REGISTRY 段 | Step 8 apply 動作 |
|-------|------------|--------------------------|-----------------|
| **Pattern audit** | `scripts/audit-<class>.ps1` (detector) + slash command | 🛠 TOOL + 🟡 TRACKED list | 自動 — 每次 Edit 跑工具當 oracle |
| **Logic audit** | `agency-os/reports/audit/<class>-YYYY-MM-DD.md` (findings + ready-to-apply patches + Patch Errata) | 🔴 FIXED / 🔴 TRACKED (Critical) list + Plan SSOT 違反映射 | **`/apply-audit <report-path>`**（折回 Errata + cross-file 抓蟲 + 4-action verify per patch + 升級 FIXED + WORKLOG）|

**Logic audit 的 Step 8 強制流程**詳見 [`.claude/commands/apply-audit.md`](../../../.claude/commands/apply-audit.md)。設計動機：2026-05-23 Auto-Repair audit 三次 operator push-back 才把 5 個 Critical apply 完整 — 工序沒永久化下次會重蹈。

---

## 已執行的 class（永久部署）

詳見 [AUDIT_REGISTRY.md](AUDIT_REGISTRY.md)，這裡只列 class 名稱：

| Class | Shape | Status | 工具 |
|-------|-------|--------|------|
| **CP950 / encoding-trap audit** (2026-05-22; class 3 unencoded-raw-read added 2026-08-29) | Pattern | ✅ DEPLOYED | `/audit-encoding`、`scripts/audit-cp950-traps.ps1`（3 classes: capture-trap / parse-break / unencoded-raw-read，各有獨立 gate 開關）、`scripts/_console-encoding-helpers.ps1` |
| **Cross-machine .md BOM audit** (2026-05-22) | Pattern | ✅ DEPLOYED | `/audit-cross-machine-bom`、`scripts/audit-cross-machine-bom.ps1` |
| **Cross-machine sync verifier** (2026-05-22) | Pattern | ✅ DEPLOYED | `/sync-check`、`scripts/check-claude-sync.ps1` |
| **Auto-Repair logic audit** (2026-05-23) | Logic | ✅ DEPLOYED + APPLIED | `/apply-audit`、`scripts/audit-tools/dogfood-auto-repair.ps1`、[`reports/audit/auto-repair-2026-05-23.md`](../../reports/audit/auto-repair-2026-05-23.md)。5 🔴 Critical (C1-C5) 全 FIXED 同日；10 Major + 9 Minor 留下次 iteration |
| **Repo-hygiene audit：case-collision + oversized-file** (2026-09-05) | Pattern | ✅ DEPLOYED（case-collision 為硬閘；oversized-file 資訊性） | `/audit-repo-hygiene`、`scripts/audit-repo-hygiene.ps1`。上線前 critic 對抗審查用 3 個真實 fixture 端到端重現 3 Critical + 4 Major（CP950 主控台亂碼誤判 collision、unmerged index 自撞誤判、git 失敗 fail-open 假乾淨、只比對同深度漏掉本案起源的目錄層級 collision 等），全數修復並重跑三個 fixture 驗證通過才接線。`case-collision` 已接入 `system-health-check.ps1` check 7d 硬閘（dogfood 0/4715 hits）；`oversized-file` 17 個 🟡 TRACKED backlog，不擋。一般重複程式碼／naming drift 偵測**刻意不做**——需要判斷力，已由 critic/`/code-review`/`/simplify` 覆蓋，見腳本檔頭註解與 AUDIT_REGISTRY.md 完整審查報告 |

---

## Backlog（下一個 class 候選）

**優先順序原則**：`blast_radius × likelihood × scope`

| 優先 | Class | 觸發理由 | 預期命中 | 工時 |
|------|-------|---------|---------|------|
| 🔴 **NEXT** | Date/time local-vs-UTC | AO-CLOSE 跨日邊界已踩過；多腳本同類；單元測試難覆蓋 | 5-10 | 2 hr |
| 🔴 | CP950 class 4：unencoded-file-write（`Set-Content`/`Add-Content`/`Out-File` 缺 `-Encoding`）| Codex×critic 雙輪覆審發現（2026-08-29，class 3 critic review S2）：write 端與已修的 class 3（unencoded-raw-read）是同一不變量的另一半，且量體更大——同一 167 檔掃描找到 10 處，9 處集中在 `mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1`（9 個 `Add-Content`）| 10 | 2-3 hr |
| 🔴 | Empty `catch {}` silent fail | Critic 每輪都抓；1 個爆會藏多時；high latent rate | 30-50 | 3 hr |
| 🟠 | Atomic file write race | ao-close-last.txt bug 本質；所有 state file 都有此風險 | 10-20 | 2 hr |
| 🟠 | TypeScript strict null / unknown | next-admin 整 app 沒掃；hot path | 50-100+ | 4 hr |
| 🟡 | Path with spaces / quoting | Windows 經典 | 20-30 | 2 hr |
| 🟡 | PowerShell 5.1 vs 7 incompat | 已踩過幾次（array unwrap、`??`、if-expr）| 10-15 | 2 hr |
| 🟡 | Secret leak in logs / WORKLOG | 一旦發生很嚴重 | 1-5 個（但每個 critical）| 3 hr |
| 🟢 | Resource leak（SSH conn / file handle）| 長 session 才爆 | < 10 | 2 hr |

---

## KPI（避免「工具長了沒用」）

| 指標 | 目標 | 量測 |
|------|------|------|
| `AUDIT_REGISTRY.md` class 數 | +1-2 / 月 | grep 新章節 |
| `🔴 FIXED` 累積數 | 隨 incident + audit 累積 | grep `🔴 FIXED` |
| `🟡 TRACKED` 數 | 緩慢下降（修一個 / 不會爆才轉 CLEAN）| grep `🟡 TRACKED` |
| **真實 production breaks（不在已 audit 的 class）** | **應該逐月下降** | 看 WORKLOG `## YYYY-MM-DD` incident 段 |
| Critic round 抓到的 Critical 數 / session | < 1 是健康 | review 結果 |
| AGENTS.md `## 代理自動工具使用規則` 條數 | 累積增長（每 audit class +1）| grep table 行數 |
| `scripts/audit-*.ps1` 工具數 | 累積增長 | `ls scripts/audit-*.ps1` |
| **操作者實際 audit minutes / 月** | **< 30 min / 月** | WORKLOG marker `[AUDIT-OPS-MIN] <N>`；每月底操作者寫一次該行；`scripts/check-governance-docs-drift.ps1` 月檢可 grep |

## 操作者每月承擔（你的部分）

| 動作 | 頻率 | 工 |
|------|------|---|
| 月底回顧 `AUDIT_REGISTRY.md` | 1 次 | 10 min |
| 從 backlog 挑下個 class | 1 次 | 5 min |
| 真實 incident 時告訴 Claude「這是新 audit class」 | 不定 | 30 sec |
| Audit tool 跑出 drift 時，decide fix vs TRACK | 偶爾 | 1-5 min |

**累計 < 30 min / 月**——其他都是 Claude 在做。

## Claude 每月承擔

| 動作 | 觸發 |
|------|------|
| Incident 時建工具 | 自動回應 incident 描述 |
| 排程 audit 時挑 backlog 跑 playbook | 操作者說「跑這個月的 audit」 |
| AGENTS.md 觸發自動 audit | Edit `.ps1` / `.ts` 等時自動跑 |
| WORKLOG 寫每個 audit 結果 | 每個 audit 結束 |
| Critic review 自己的 audit tool | 9 步 playbook 第 7 步 |

---

## 30 年預測曲線

```
Month 1 (2026-05): CP950 + cross-machine BOM + sync-check ✅
Month 2-12:        再 6-12 個 class（date/time、empty-catch、atomic-write……）
Year 2-3:          剩餘主要 class 全工具化
Year 3+:           新 class 只在新 tech stack 引入時才出現
Year 30:           系統幾乎自我審查，operator 介入近零

累積曲線:
  audit class 數量:  ●○ → ●●●○ → ●●●●●●○ → ●●●●●●●●●●○
  真實 incident 數: ●●●●○ → ●●○ → ●○ → · · ·
  Claude 自審 caught%: 20% → 60% → 85% → 99%
```

---

## 觸發詞（Claude 自動參考本檔的條件）

當使用者訊息**或** Claude session 中出現以下任一情境，**自動讀本檔再答**：

| 觸發 | Claude 應該做的事 |
|------|----------------|
| 訊息含「audit」「抓蟲」「bug class」「我有蟲」「掃描漏洞」 | 讀本檔 → 看 backlog → 提觸發 tier 建議 |
| 真實 production incident 描述 | 讀本檔 §4-Tier 觸發模型 → 啟動 Tier 1 流程 |
| Critic 在 review 中第 3+ 次抓到同類 | 觸發 Tier 2 → 提議下個月排程 |
| 月底（YYYY-MM-28 之後）/ 操作者問「該抓哪個」 | 讀本檔 backlog → 排序建議 |
| 工具 audit-*.ps1 exit code 1 | 讀本檔 Build Playbook 第 6 步 → 看 fix template |

---

## Related Documents

- [AUDIT_REGISTRY.md](AUDIT_REGISTRY.md) — 結果 SSOT（FIXED/CLEAN/TRACKED/TOOL 狀態 + statistics）
- [agency-os/AGENTS.md](../../AGENTS.md) — 觸發規則 SSOT（`## 代理自動工具使用規則`）
- [scripts/audit-cp950-traps.ps1](../../../scripts/audit-cp950-traps.ps1) — 第一個範例 audit tool
- [scripts/_console-encoding-helpers.ps1](../../../scripts/_console-encoding-helpers.ps1) — 第一個範例 helper library
- [.claude/commands/audit-encoding.md](../../../.claude/commands/audit-encoding.md) — 第一個範例 slash command

## Rollback / Disable

如某個 audit class 過度誤報或負擔大於價值：

1. AGENTS.md 移除對應 trigger row → Claude 不再自動跑
2. 刪除 `scripts/audit-<class>.ps1` + `.claude/commands/audit-<class>.md`
3. AUDIT_REGISTRY.md 把該章節改 `🟢 RETIRED` 狀態 + 留下原因
4. WORKLOG 補 entry 紀錄退役

**永遠不要刪 AUDIT_REGISTRY 已存在的章節**（歷史紀錄不可逆），只標記狀態。

---

_Initial deployment: 2026-05-22, after CP950 toolchain proved the model._
_Maintainer: Claude + operator joint, updates via incident or monthly review trigger._

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/operations/AUDIT_REGISTRY.md`

_Last synced: 2026-10-25 21:42:01 UTC_

