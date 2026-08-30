---
proposal_id: "023"
slug: "db-migration-15-step-sequence-ec"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L1135-1157"]
related_open_questions: []
change_class: "semantic correction"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "9d587c082"
---

## PROPOSED_CHANGE

Execution Contract §28 Database Change Contract 現有 11 步驟純文字箭頭序列（L1135-1157）整段以 `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (a) 訂正過的 15 步序列取代。EC §29（DB Migration Requirements）與 §30（Data Integrity Contract）內容不變，僅 §28 本身的步驟序列區塊被替換。

## RATIONALE

ADR-005 逐字核對了三母文件裡實際畫出這條序列的五處（EC §28 本身、Atlas F21 mermaid、Atlas F21 表格列、Atlas §11.50、Atlas §13.10），發現：

1. EC §28（本提案的修改對象）**完全省略 Dual Write/Dual Read 這個節點**——這不是措辭潔癖，是安全機制整個不存在：只讀 EC（AI 開機必讀文件）的人完全不會知道要做雙寫。
2. 五處序列裡，Dual Write 相對 Backfill 的先後順序 2 比 2 打平（Atlas F21 兩處是對的，Atlas §11.50/§13.10 兩處是錯的），EC 則是兩者都沒有。
3. WebSearch 查證 Martin Fowler 命名的 Expand-Contract / Parallel Change pattern 及多篇 2025-2026 工程部落格（pgroll/xata、Laravel 生態、CI/CD for Data 系列）後確認業界標準順序是 **Dual Write 必須在 Backfill 之前啟用**——因為 Backfill 只搬「啟動當下已存在」的資料，若 Dual Write 在 Backfill 之後才開始，Backfill 執行期間（可能長達數小時到數天）寫入舊 schema 的新資料永遠不會被追上，等於資料遺失。
4. ADR-005 進一步指出 Dual Write（保寫入不遺失）與 Dual Read（驗證用，保讀取正確，應在 Backfill+Reconciliation 都確認一致「之後」才開始）在語意上是兩個不同的控制點，三份文件全部把它們壓成一個節點，本次修正將其拆開為獨立的 `Enable Dual Write` 與 `Dual Read Verification` 兩步。

ADR-005 的 Sub-decision (a) 選擇 **Option B（合併五處成單一正確版本）**，並指定 **Execution Contract §28 為 SSOT 位置**（理由：EC 是「AI 開機必讀」的 Normative Execution Contract，Atlas 定位是方法/工具型錄、非強制執行的 gate；高風險、資料安全攸關的強制步驟序列，理應由「會被機械閘/AI 開機契約強制讀取」的文件當正本）。本提案是該裁決在 EC §28 這一個站點的具體落地。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§28 Database Change Contract（L1129 標題起，序列區塊本身在 L1135-1157）

## DEPENDENCIES

與 `024-db-migration-atlas-pointer-batch` 修改不同檔案的不同區間，互不重疊，可獨立套用。但 ADR-005 Migration 段明確建議「先改 EC §28（本提案），再改 Atlas 三處刪圖換引用（024 提案）」——因為 Atlas 三處新增的指標句「精確步驟序列見 Execution Contract §28」在 EC §28 尚未修正前雖仍可讀，但讀者跳過去看到的會是舊的、有資料遺失風險的 11 步版本，語意上先後順序仍建議依 ADR 給的執行順序套用。

不依賴 `.ai/research/phase-1/DUPLICATION_REGISTER.yaml` P1-DUP-1（`resolved_by` 欄位已指向 ADR-005，但該登記本身的 status 更新是後續獨立動作，不阻塞本提案）。

## COMPATIBILITY

新增 4 個節點（11 步 → 15 步：新增 `Data Contract`；原本合併的 `Dual Read/Write` 拆分為 `Enable Dual Write` + `Dual Read Verification`；新增 `Canary`），格式仍是純文字 `text` fenced block + `↓` 箭頭，與現有排版慣例一致。`recipes/validated/db-migration-expand-contract.recipe.yaml`（機器可讀版本，已存在）的 `steps[]` 已經是這 15 步且 label 完全對應，本提案套用後 EC 散文版與該機讀 recipe 首次達成一致（該 recipe 檔案本身的 `description` 欄位已明文記載「EC §28 目前尚未編輯以符合 ADR-005a，正等待本提案」）。不影響任何其他消費 EC §28 純文字內容的既有邏輯（純文件變更，無 runtime 依賴此區塊的機器解析）。

## MIGRATION

`Edit` 工具以 L1135-1157 現有逐字內容為 `old_string` 做精確字串替換；套用後重算 EC sha256 並更新本提案與其餘引用 EC baseline hash 的提案 `target_baseline_hash`（若尚未套用則不受影響）。

## ROLLBACK

三母文件在 git 有 hash-anchored baseline，`git revert` 對應 commit 即可完整還原，風險等級 Low（純文件變更，無 runtime 副作用）。

## EVIDENCE

- `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (a)（L23-115，含五處逐字核對表、WebSearch 業界證據、比較矩陣、最終建議序列）與 Recommendation 第 1 條（L164）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1129-1157`（本提案修改對象，現況逐字已於下方 Diff 引用）
- `recipes/validated/db-migration-expand-contract.recipe.yaml`（已存在的機器可讀 15 步版本，label/順序與本提案 Proposed 內容逐一對應，交叉核對無出入）
- `.ai/research/phase-1/DUPLICATION_REGISTER.yaml` P1-DUP-1（`resolved_by: docs/adr/ADR-005-...md`）

## Diff

### Original

Execution Contract §28（L1135-1157，逐字）：

```text
Baseline
↓
Backup / Restore Validation
↓
Compatibility Analysis
↓
Expand
↓
Deploy Compatible Code
↓
Backfill
↓
Reconciliation
↓
Traffic Migration
↓
Observe
↓
Contract Old Schema
↓
Close Rollback Window
```

### Proposed

ADR-005 Sub-decision (a)「最終建議序列」原文逐字轉錄：

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

### Reason

15 步相對原 11 步的三處差異，逐一對應 ADR-005 已核對的證據：

1. **新增 `Data Contract`**（Compatibility Analysis 之前）——五處證據裡有 3 處（Atlas F21 mermaid、Atlas F21 表格列邏輯上隱含、Atlas §13.10）都有這個節點，EC 原本沒有，屬遺漏補回。
2. **`Backup / Restore Validation` 移到 `Expand` 前緊鄰位置**（原本在 `Baseline` 之後、`Compatibility Analysis` 之前）——ADR-005 指出 backup 的價值在於「離變更動作越近越有效」，隔著 Compatibility Analysis 這段不確定時長的分析期，backup 的新鮮度會被稀釋；Atlas 兩處（F21、§13.10）都把它放在 Expand 前並非巧合。
3. **拆出 `Enable Dual Write`（Backfill 之前）與 `Dual Read Verification`（Reconciliation 之後）兩個獨立節點，並新增 `Canary`**——這是本次修正的核心：原 11 步完全沒有任何 Dual R/W 節點，是比「順序錯」更嚴重的安全缺口；Dual Write 必須先於 Backfill 啟動（業界標準查證），Dual Read 則是 Canary 前的最後影子驗證，兩者語意不同不可合併。

三處差異合計讓 11 步變成 15 步，逐一節點名稱與順序已與 `recipes/validated/db-migration-expand-contract.recipe.yaml` 既有 `steps[]` 交叉核對一致（該檔案早於本提案完成，其 `description` 已明文預告本提案會是它與 EC 散文版對齊的動作）。
