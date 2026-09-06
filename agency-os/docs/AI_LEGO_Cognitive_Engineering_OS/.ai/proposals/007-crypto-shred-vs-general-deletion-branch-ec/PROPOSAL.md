---
proposal_id: "007"
slug: "crypto-shred-vs-general-deletion-branch-ec"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L1225-1253"]
related_open_questions: []
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "2f9ff3434"
---

## PROPOSED_CHANGE

Execution Contract §31 Data Deletion Contract 之下新增子小節 `## 31.1 個資刪除（Crypto-shred）vs 一般 Production Row 刪除`，說明既有十步驟流程對兩種刪除類型皆適用，但 Dependency Check / Deletion / Verification / Deletion Evidence 四步驟的定義依類型不同，並指向已存在的機器可讀正本 `specs/execution/data-deletion.schema.yaml`。

## RATIONALE

ADR-002 Consequences「需要新增的規格缺口」第 3 項明文要求：「EC §31 需新增分支：『個資刪除（crypto-shred）』與『一般 production row 刪除』是兩種不同的 Verification 定義」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:128`）。`specs/execution/data-deletion.schema.yaml` 已於 Phase 3 建好機器可讀正本，其自身 description 段落明文將此列為要補的母文件缺口：「EC §31's own prose remains the source of truth for the 10-step sequence itself (unchanged, cited verbatim below)」，而分支定義才是本檔案新增的部分（`specs/execution/data-deletion.schema.yaml:7-25`）。依任務指示「檢查 `specs/execution/data-deletion.schema.yaml` 是否已形式化此區分，若有則引用而非重新推導」，本提案直接沿用該檔案已定義好的兩分支步驟定義，逐字轉錄而非重新發明。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§31 Data Deletion Contract（現行行號 L1181-1230；提案套用當下原始十步驟+Soft delete 句為 L1225-1251，插入點在 L1253 的 `---` 分隔線之前——此為套用當下行號，後續其他提案編輯上游內容造成行號漂移，2026-09-06 訂正上方 current 引用，此歷史行號原樣保留）

## DEPENDENCIES

依賴 `specs/execution/data-deletion.schema.yaml`（已存在，ACTIVE，`branches.personal_data_crypto_shred`/`branches.production_row` 兩分支定義）與其自身依賴的 `specs/security/key-vault-lifecycle.schema.yaml`、`specs/domain/personal-data-redacted-event.schema.yaml`（皆已存在）。與 `008-event-pii-annotation-and-redacted-event-mp` 語意鄰接（本提案 Deletion Evidence 分支提及 `PersonalDataRedacted` 事件，該事件由 `008` 加入 MP §57）但修改檔案不同、行區間不重疊，可獨立套用。

## COMPATIBILITY

純母文件散文新增，不修改 §31 既有任何一行文字（十步驟序列與「Soft delete 不等於合規刪除」原句完全保留），不影響任何現有 schema/policy/code。

## MIGRATION

`Edit` 工具精確字串替換（在 L1251 之後、L1253 `---` 之前插入新子小節）；套用後重算 Execution Contract sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原原始文字；Phase 3 尚無任何程式碼消費此段母文件散文，零 downstream 風險。

## EVIDENCE

- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:65`（Option A 對應 EC §31 步驟的原始映射）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:128`（Consequences 規格缺口第 3 項，逐字要求本提案）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1225-1253`（本提案套用當下讀取的 §31 現況全文；現行行號已漂移為 L1181-1230，見上方 affected_line_ranges 訂正註記）
- `specs/execution/data-deletion.schema.yaml:148-247`（兩分支 `step_overrides` 機器可讀定義，本提案逐字轉錄其 Dependency Check/Deletion/Verification/Deletion Evidence 措辭）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2161-2195`（§65 Content-addressed Evidence、§66 Audit Event，`production_row` 分支 Deletion Evidence 步驟引用；原引用 L2185-2216 已訂正）

## Diff

### Original

Execution Contract §31（L1225-1253，逐字）：

````text
# 31. Data Deletion Contract

Production deletion：

```text
Authorization
↓
Legal Hold Check
↓
Retention Check
↓
Dependency Check
↓
Dry Run
↓
Count / Scope Preview
↓
Approval
↓
Deletion
↓
Verification
↓
Deletion Evidence
```

Soft delete 不等於合規刪除。

---
````

### Proposed

````text
# 31. Data Deletion Contract

Production deletion：

```text
Authorization
↓
Legal Hold Check
↓
Retention Check
↓
Dependency Check
↓
Dry Run
↓
Count / Scope Preview
↓
Approval
↓
Deletion
↓
Verification
↓
Deletion Evidence
```

Soft delete 不等於合規刪除。

## 31.1 個資刪除（Crypto-shred）vs 一般 Production Row 刪除

上述十步驟流程對兩種刪除類型皆適用，但「個資刪除（crypto-shred）」與「一般 production row 刪除」在 Dependency Check / Deletion / Verification / Deletion Evidence 四步驟上定義不同（完整分支定義：`specs/execution/data-deletion.schema.yaml`）：

```text
個資刪除（personal_data_crypto_shred）— 目標是 subject 的 DEK，不是資料列本身
  Dependency Check   — 找出所有引用此 DEK 的 event / projection / derived artifact
  Deletion           — 銷毀 DEK 並寫一筆 Key Destruction Record 到獨立稽核日誌；不刪除、不修改任何 event
  Verification       — 對所有已知引用嘗試 decrypt，確認全部失敗（反面證明）
  Deletion Evidence  — PersonalDataRedacted 事件（見 §57.1）+ Key Destruction Record 兩者皆備，缺一不可

一般 production row 刪除（production_row）
  Dependency Check   — 一般 foreign-key / cascading 依賴檢查
  Deletion           — 實體刪除該筆 row／record（非 status flag，Soft delete 不算數）
  Verification       — 事後查詢確認該筆 row 已physical不存在（正面證明，與 crypto-shred 分支互為鏡像）
  Deletion Evidence  — §65 Content-addressed Evidence 或 §66 Audit Event
```

其餘六步驟（Authorization / Legal Hold Check / Retention Check / Dry Run / Count-Scope Preview / Approval）兩種類型共用本節既有定義，不重複分支。

---
````

### Reason

這是 ADR-002（ACCEPTED）Consequences 規格缺口第 3 項在母文件的直接落地，非新架構決策。兩分支的步驟定義逐字取自 ADR-002 Option A 段落（`docs/adr/ADR-002-...md:65`：「Dependency Check = 找出所有引用此 DEK 的 event/projection/derived artifact；Deletion = 銷毀 DEK 並寫一筆 Key Destruction Record 到獨立稽核日誌；Verification = 對所有已知引用嘗試 decrypt，確認全部失敗」）與已存在、已通過驗證的 `data-deletion.schema.yaml` 分支定義（該檔案已將 `production_row` 分支的定義補齊，因 ADR-002 本身未對此分支給出比 EC §31 更細的定義，本提案照實沿用其一般性措辭，不臆測）。EC §31 原始十步驟序列與「Soft delete 不等於合規刪除」原句完全保留不動，僅在其下新增分支說明——這正是 ADR Consequences 措辭「新增分支」而非「取代原文」的字面意思。
