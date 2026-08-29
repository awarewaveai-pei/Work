# ADR-005: DB Migration Recipe 與 Method ID Grammar 統一

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 APPROVED 僅操作者可推進）
Date: 2026-08-29

## Context

Phase 1 Duplication Register（P1-DUP-1）與 Phase 0 Open Questions（OQ-12）各自標記了一個「同一件事被多處重複定義且已產生分歧」的問題，兩者屬性不同但都阻塞 Phase 2 收斂：

(a) **DB Migration Recipe**：三母文件各自畫了一份「Database Change / Expand-Contract Migration」步驟序列，且順序互相矛盾——包括 Atlas 自己內部都不一致。這不是措辭潔癖，是資料安全問題：Dual Read/Write 該在 Backfill 之前還是之後，選錯會讓 backfill 期間寫入的新資料在 cutover 後消失。

(b) **Method 機器可讀 ID 文法**：三套文法（`method.<family>.<name>` / `<family>.<name>` / `method.<name>.v<N>`）並存於 Atlas 與 Master Plan，任何單一文法都無法把全部既有 ID resolve 成功，registry 實作前必須先有唯一文法。

兩者的裁決方式不同：(a) 是有客觀正確答案的工程事實問題（可用業界標準驗證對錯），(b) 是命名空間設計取捨問題（沒有絕對對錯，但有「與既有用法一致 / 不一致」的證據可比較）。

## Decision Drivers

- **Correctness 優先於一致性**：DB migration 選項的第一篩選條件是「會不會導致資料遺失」，不是「哪份文件比較權威」。
- **最小爆炸半徑**：兩個決定都不應該引發三母文件的大改版；優先選「需要改動最少既有內容」且「不犧牲正確性」的方案。
- **單一事實來源（SSOT）而非逐處微調**：這裡的不變量是「同一段可執行步驟/同一個 ID 的機讀規則，只能有一個地方定義為準，其餘只能引用」。
- **不能停留在描述層**：兩個決定最終都要進 `/specs/`、`/methods/registry/` 等機器可讀規格。

## Sub-decision (a): DB Migration Recipe SSOT — Options Considered

### 已核對的完整證據（逐字，非三處而是五處）

任務原始描述只列了三處，經 grep 核對，Atlas 內部實際有**四處**畫了序列圖（比原始問題陳述多一處），EC 一處完全省略此節點：

| 來源 | 檔案:行號 | 序列（逐字節點） | Dual R/W 位置 |
|---|---|---|---|
| EC §28 Database Change Contract | Execution Contract:1135-1157 | Baseline → Backup/Restore Validation → Compatibility Analysis → Expand → Deploy Compatible Code → Backfill → Reconciliation → Traffic Migration → Observe → Contract Old Schema → Close Rollback Window（11 步） | **完全沒有這個節點** |
| Atlas F21 DB/Data Pack mermaid | Atlas:907-919 | Schema Baseline → Data Contract → Compatibility Analysis → Backup+Restore Test → Expand → **Dual Read/Write** → Backfill → Reconciliation → Canary → Contract → Rollback Window Close（11 節點） | Backfill **之前**（正確） |
| Atlas F21 表格列 | Atlas:900 | expand → **dual read/write** → backfill → verify → contract（5 節點，同表格內第二份序列） | Backfill **之前**（正確） |
| Atlas §11.50 Expand-Contract Migration | Atlas:2367-2376 | Old Schema → Expand Compatible Schema → Deploy Compatible App → Backfill → **Dual Read/Write** → Verify → Switch → Contract Old Schema（8 節點） | Backfill **之後**（有問題） |
| Atlas §13.10 Database Migration Recipe | Atlas:3486-3500 | Schema Baseline → Data Contract → Compatibility Analysis → Backup+Restore Drill → Expand → Compatible App → Backfill → Reconciliation → **Dual Read/Write** → Canary → Switch → Contract → Rollback Window Close（13 節點） | Backfill **之後**（有問題） |

順序票數是 2 比 2（F21 兩處 vs §11.50/§13.10 兩處），EC 的問題其實更嚴重：不是順序錯，是整個安全機制被省略。另外核對時發現**第四個分歧點**：Backup/Restore Validation 與 Compatibility Analysis 的先後順序，EC 與 Atlas 也不一致——EC 是 Backup 在前、Compatibility Analysis 在後；Atlas 兩處都是 Compatibility Analysis 在前、Backup 在後（緊接在 Expand 之前）。

### 業界標準查證（WebSearch，2026-08-29）

Martin Fowler 命名的 Parallel Change / Expand-Contract pattern，及多篇 2025-2026 年工程部落格（pgroll/xata、Laravel 生態、CI/CD for Data 系列文章）一致描述的順序：

> Expand → **Dual Write（在 Backfill 之前啟用，兩邊都寫）** → Backfill（批次、可恢復地搬歷史資料）→ 驗證/Dual Read → Cutover → Contract

**理由**（不是慣例，是資料完整性的必然邏輯）：Backfill 只搬「啟動當下已存在」的資料。若 Dual Write 在 Backfill 之後才啟用，Backfill 執行期間（可能長達數小時到數天，批次限流）發生在舊 schema 上的新寫入，永遠不會被這次 Backfill 涵蓋，也不會被之後的 Dual Write 追上——這就是 DUPLICATION_REGISTER.yaml 已經寫對的後果描述：「backfill 完才開始雙寫，會造成 backfill 期間寫入的新資料遺失」。

結論：**Atlas F21（含表格列）的順序是對的；Atlas §11.50 與 §13.10 的順序是錯的；EC 完全省略此節點是比「順序錯」更嚴重的缺口**。

進一步顯示：「Dual Write」與「Dual Read」在語意上其實是兩個不同的控制點，三份文件全部把它們合併成一個「Dual Read/Write」節點：
- **Dual Write**：從 Expand 完成、相容 App 部署後就應立刻啟用，貫穿 Backfill、Reconciliation，直到 Contract 之前都要保持雙寫。
- **Dual Read（驗證用）**：應該在 Backfill + Reconciliation 都確認資料一致「之後」才開始，用來在真正切流量之前，用影子讀取比對新舊結果，屬於 Canary 前的最後驗證。

### Option A — 以其中一份文件為 SSOT，其餘改純引用

**問題**：三個候選版本沒有一個是可以直接拿來當正本的——EC 缺 Dual R/W 節點（安全缺口），F21 缺 Canary/Switch/Observe 的完整分野，§13.10 順序本身有資料遺失風險。選其中任一個當正本，等於把一個未修正的錯誤複製成唯一權威。Option A 不成立，除非先修正被選中的那份，但那樣就變成 Option B 了。

### Option B — 合併五處成單一正確版本（推薦）

取各版本優點、修正已驗證的順序錯誤，指定**唯一存放位置**。

**SSOT 位置選擇**：放在 **Execution Contract §28**，不是 Atlas。理由：
- EC 定位是「Normative Execution Contract / AI Boot Contract」，每個 AI 在開機時必讀（EC §3），且明文「DB Migration 是高風險工程，不是 SQL patch」——這是可執行的強制規範，不是工具型錄。
- Atlas 的定位是方法/工具型錄——本質上是參考資料，不是強制執行的 gate。
- 高風險、資料安全攸關的強制步驟序列，理應由「會被機械閘/AI 開機契約強制讀取」的文件當正本。

Atlas 的三處（F21 mermaid、§11.50、§13.10）改寫為：保留各自的「這是什麼 pattern / 適用情境」說明文字，但刪除各自的序列圖，改成一句「精確步驟序列見 Execution Contract §28（唯一正本），本節僅說明概念與適用場景」。

### Status Quo（不作為對照組）

風險：下一個依文件實作 migration tooling 的人（人類或 AI）三選一時有 50% 機率選到「Dual Write 在 Backfill 之後」的錯誤版本，真實發生 data loss；且 EC 完全沒有這個安全機制，若有人只讀 EC（它是開機必讀文件）就會完全不知道 Dual Write 這回事。不列入比較矩陣評分。

### 比較矩陣

| 面向 | Option A（挑一份當正本） | Option B（合併修正，推薦） | Status Quo |
|---|---|---|---|
| **Correctness** | 差——三個候選沒有一個是對的 | **佳**——用查證過的業界標準修正順序 + 補回缺失的 Dual Write/Dual Read 分野 | 極差 |
| **Maintainability** | 中——單一正本但帶病 | **佳**——單一正本 + 內容已修正 | 極差——五處各自漂移 |
| **Migration 成本** | 低（只改指標） | 中——需改 EC §28 一段內容 + Atlas 三處刪圖換引用（4 個編輯點） | 零（但風險留著） |
| **Complexity** | 低 | 低——最終只有一份序列圖存在於整個系統 | 高——讀者要自己比對五份、猜哪份對 |

### 最終建議序列（供寫入 EC §28，取代現有 L1135-1157 的 mermaid 區塊）

```text
Schema Baseline
↓
Data Contract
↓
Compatibility Analysis
↓
Backup / Restore Validation
↓
Expand
↓
Deploy Compatible Code
↓
Enable Dual Write（新舊 schema 同時寫，此刻啟動，持續到 Contract 之前）
↓
Backfill（resumable / idempotent / checkpointed / throttled / observable —— EC §29 既有要求原樣保留）
↓
Reconciliation（counts / checksums / business invariants —— EC §30 既有要求原樣保留）
↓
Dual Read Verification（新 schema 影子讀取，比對舊 schema 結果，尚未對外服務）
↓
Canary（真實流量小比例改為由新 schema 服務讀取）
↓
Traffic Migration / Switch（讀寫權威全面切至新 schema）
↓
Observe
↓
Contract Old Schema
↓
Close Rollback Window
```

（15 步。相對 EC 現有 11 步，新增 Data Contract、拆分並補回 Enable Dual Write + Dual Read Verification 兩個獨立節點、補回 Canary，並將 Backup/Restore Validation 移到 Expand 前緊鄰位置——backup 的價值在於「離變更動作越近越有效」，隔著 Compatibility Analysis 這段不確定時長的分析期，backup 的新鮮度會被稀釋，Atlas 兩處都把它放在 Expand 前並非巧合。）

## Sub-decision (b): Method ID Grammar — Options Considered

### 已核對的完整證據

| 來源 | 檔案:行號 | 型態 | 性質 |
|---|---|---|---|
| Atlas §Data Contract 範例 | Atlas:50 | `method.association.mind_map` | 敘述性範例（人類可讀對照，非 schema 定義） |
| Atlas §9 LEGO Contract | Atlas:989-991 | `id: root_cause.fishbone` / `version: 1.0.0`（獨立欄位）/ `family: root_cause`（獨立欄位） | **這是唯一的正式機讀 schema 定義** |
| Atlas §24.1 30 年演進策略 | Atlas:4256-4258 | `method.swot.v1` / `method.swot.v2` / `method.swot.v3` | 敘述性範例，且**遺漏 family 段**（連 family 都沒寫，是三套文法之外的第四種寫法） |
| Master Plan §8.4 | MP:742, 745 | `execute_method(root_cause.fishbone)` / `execute_method(strategy.swot)` | 函式呼叫範例，bare 形式 |
| Master Plan §9 Workflow IR | MP:825, 833 | `method_id: research.thematic_analysis` / `method_id: evidence.triangulation` | Workflow node 定義，bare 形式，且外層已有 `type: method` 欄位 |

**關鍵發現**：7 處出現中，5 處（Atlas:989 + MP:742/745/825/833）已經是 `<family>.<name>` bare 形式；只有 2 處（Atlas:50、Atlas:4256-58）用了 `method.` 前綴，且這 2 處都是敘述性/教學範例，不是任何一份文件裡真正拿來當 schema 用的定義——Atlas §9 才是真正的機讀契約，它自己用的就是 bare 形式。MP 的 Workflow IR 在每個 method node 外層本來就有 `type: method` 這個欄位在做型別區分，`method_id` 這個 ID 本身要不要再重複帶「method.」前綴，屬於重複標記型別。

### Option A — 統一為 `method.<family>.<name>`，版本另用獨立欄位

需要改動：Atlas:989（加前綴）、MP:742/745（加前綴）、MP:825/833（加前綴）、Atlas:4256-58（補回遺漏的 family 段，改寫全部三行）——**6 個既有正確使用點裡有 5 個要改**，且每個 method node 外層已有 `type: method` 欄位的情況下，ID 內再帶一次「method.」是重複資訊。

### Option B — 統一為 `<family>.<name>`（無前綴），推薦

需要改動：只有 Atlas:50（拿掉前綴）與 Atlas:4256-58（拿掉前綴、補回遺漏的 family 段）——**2 處都是敘述性範例，且本來就有錯（L4256 遺漏 family 段）要修**，不動任何一處已經在真正 schema/IR 裡使用的正確寫法。與現況（Atlas §9 機讀契約 + MP 全部 Workflow IR 用法）完全一致。

### Option C — 兩層命名空間（系統內建無前綴，第三方擴充需 `method.` 前綴）

已查證全部三份母文件與 Phase 0/1 研究產出：**沒有任何一處提到第三方方法貢獻、外掛市集、或方法命名空間衝突**這類需求。Option C 是在為一個文件裡完全不存在的未來需求先做設計，違反「最小爆炸半徑」。若未來真的出現第三方方法貢獻需求，屆時可用**新增欄位**（例如 `namespace: <vendor>`，比照 Atlas §9 現有 `family` 欄位的模式）非破壞性擴充，不需要現在就在 ID 文法裡預埋前綴保留位。

### Status Quo（不作為對照組）

三套文法並存，任何 registry 實作都無法用單一 parser 正確 resolve 全部既有 ID（Codex cross-review CDX-4 已驗證此結論）。不列入比較矩陣評分。

### 比較矩陣

| 面向 | Option A（強制 method. 前綴） | Option B（bare 形式，推薦） | Option C（雙層命名空間） |
|---|---|---|---|
| **Correctness** | 中——語意上型別重複標記 | **佳**——與已存在的機讀契約及全部 Workflow IR 用法一致 | 中——解決一個未被證實存在的問題 |
| **Maintainability** | 中 | **佳**——唯一文法，`family` 欄位已存在可供查詢 | 差——多一條規則要人記住 |
| **Migration 成本** | 高——5 個既有正確用法要全改 | **低**——只改 2 個本來就有錯的敘述性範例 | 高——需另外定義第三方註冊/驗證流程 |
| **Complexity** | 中 | **低** | 高——多一層命名空間規則 |

## Method Used

- **Root Cause Analysis（Fishbone，呼應 Atlas §9 自己的範例 `root_cause.fishbone`）**：DB Migration 分歧的根因是「兩種語意（Dual Write 保寫入不遺失、Dual Read 保讀取正確）被壓成一個節點」+「沒人拿業界標準核對過順序」。
- **Evidence Triangulation（呼應 `evidence.triangulation`）**：內部證據（五處序列圖逐字核對）與外部證據（WebSearch 業界 expand-contract pattern 標準）交叉驗證後才下結論。
- **Decision Matrix / Options Comparison**：兩個子決定都用 Correctness/Maintainability/Migration/Complexity 四軸比較。

## Recommendation

1. **DB Migration Recipe**：採 Option B（合併修正版）。SSOT 位置 = **Execution Contract §28**。用上方「最終建議序列」（15 步）取代 EC §28 現有 mermaid 區塊；EC §29/§30 內容不變。Atlas F21、§11.50、§13.10 三處刪除各自序列圖，改為一句話指向 EC §28。

2. **Method ID Grammar**：採 Option B（bare `<family>.<name>` 形式）。SSOT 位置 = **Atlas §9 LEGO Contract**（維持現狀不搬家）。修正 Atlas:50 範例拿掉「method.」前綴；修正 Atlas:4256-58 拿掉前綴並補回遺漏的 family 段（改為 `id: strategy.swot` + `version:` 欄位遞增，取代原本把版本號塞進 ID 字串尾巴的寫法）。Master Plan 全部既有用法不需改動。

## Consequences

**正面**：DB migration 序列現在只有一處會被改動內容、一處是唯一正本；拆出 Enable Dual Write / Dual Read Verification 兩個獨立節點後，每個節點可以獨立掛 owner / 完成判準 / rollback 動作；Method ID 文法統一後，`/methods/registry/` 可以用單一 parser 規則驗證全部既有 ID。

**負面 / 需注意**：EC §28 變得比原本長（15 步 vs 原本 11 步），若之後需要給非工程角色看，需要額外準備一份摘要版；Atlas 三處被拿掉序列圖後，讀者必須知道要跳去 EC §28 才能看到完整步驟——需要在 Atlas 那三處的引用句寫清楚「見 EC §28」。

## Migration / Rollback

**執行順序建議**：
1. 先改 EC §28（DB Migration 內容修正）。
2. 再改 Atlas 三處（F21/§11.50/§13.10）刪圖換引用。
3. 再改 Atlas:50 與 Atlas:4256-58（Method ID 範例修正）——與步驟 1/2 互相獨立。
4. 全部完成後，依 OQ-12 / P1-DUP-1 更新為 RESOLVED_BY_HUMAN，附本 ADR 編號與生效日期。

**Rollback**：三母文件在 git 有 hash-anchored baseline，`git revert` 對應 commit 即可完整還原，風險等級 Low（純文件變更，無 runtime 副作用）。

## Evidence

**DB Migration Recipe（五處，非三處）**：
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1135-1157`
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:907-919`（F21 mermaid）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:900`（F21 表格列）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2367-2376`（§11.50）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3486-3500`（§13.10）
- 既有 Phase 1 登記：`.ai/research/phase-1/DUPLICATION_REGISTER.yaml` P1-DUP-1（僅記錄三處，本 ADR 補上遺漏的 §11.50 與 F21 表格列）
- 外部業界證據（WebSearch 2026-08-29）：Schema changes and expand-contract with pgroll；Zero-Downtime Migrations in Laravel（Expand/Contract, Dual-Writes, Safe Backfills）；Parallel Change pattern；Expand-Contract Migrations field guide

**Method ID Grammar**：
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:50`
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:989-991`
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4256-4258`
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:742,745`
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:825,833`
- 既有登記：`.ai/research/phase-0/open-questions.yaml` OQ-12；`.ai/research/cross-review/CODEX_REVIEW.md` CDX-4（獨立交叉驗證，與本 ADR 核對結果一致）

**邊界確認**：本次任務全程僅執行 Read/Grep/WebSearch（唯讀），未對三母文件做任何修改。
