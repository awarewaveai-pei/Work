---
proposal_id: "029"
slug: "pseudonymization-v1-baseline-split-mp"
status: HUMAN_REVIEW
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L5659-5672"]
related_open_questions: []
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §149 Privacy-preserving Computation（L5659-5672）目前把 8 項隱私保護運算技術列在同一份未分級的「未來高階能力」清單中。本提案依 ADR-007 Recommendation point 4，把清單拆成兩層：`v1_baseline`（Pseudonymization、Tokenization —— Must，本次即可用，已是法規承認的基準安全措施）與 `future_advanced`（其餘 6 項 —— Won't，需個案通過成本/維護/威脅模型驗證後才排入 roadmap）。8 個項目全部保留，僅重新分組加分類標籤，不刪除任何一項、不改變任一項目的文字內容。

## RATIONALE

ADR-007（`docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`，ACCEPTED 2026-08-29）Context 段確認：Execution Contract §102 Logging Contract 要求 log 從 v1 起同時滿足 `redacted` 與 `correlatable`（L2980-2981），而滿足這兩項要求的既有技術（Pseudonymization/Tokenization）卻被 MP §149 與貨真價實仍在成熟中的 Homomorphic Encryption / SMPC / Federated Learning 並列貼上同一個「未來」標籤，未做任何成熟度分級——這違反 §149 自己接下來那句驗證原則（L5672）。ADR-007 外部查證（WebSearch，2026-08-29）確認：GDPR Art.4(5)/Art.32 已將 Pseudonymisation 列為十年以上的基準安全措施（與加密同級），Tokenization 是同一原理的成熟業界實作；相對地 Homomorphic Encryption 即使到 2026 年 CPU-only 場景仍可能比明文運算慢達 10,000 倍。ADR-007 Recommendation 因此裁定 Sub-decision (b) 採 Option A：依成熟度拆成兩層清單，並給出可重複套用的不變量判準（見 ADR-007 §Recommendation「不變量陳述」）——不是只解「Pseudonymization」這一個字眼的個案修法。本提案是把該裁決逐字轉錄進母文件。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§149 Privacy-preserving Computation（L5659-5672）

## DEPENDENCIES

依賴 `policies/privacy/pii-redaction.policy.yaml`（status: ACTIVE，已建）的 `mp_149_reclassification` 區塊——該區塊**已經是**本提案要轉錄進母文件的內容（同一份 `v1_baseline`/`future_advanced` 分組、同一組 8 個項目，逐字一致），該檔案本身在其 `description` 中明講自己是「interim authoritative source, kept here until the `.ai/proposals/` flow promotes this into MP §149 itself」——本提案正是那個尚未存在、被該檔案點名等待的提案。套用本提案後，`pii-redaction.policy.yaml` 的 `mp_149_reclassification.not_yet_applied_to_mother_document: true` 欄位與其 `open_questions.OQ-PII-2`（「`.ai/proposals/` 不存在於本 repo 中，尚未有任何 ADR 建立提案」）需要一併更新為已建立提案的現況，但這是套用本提案後的後續小任務，不在本 DRAFT 提案的 diff 範圍內。與 `030-pii-formal-definition-ec` 同屬 ADR-007 母文件套用批次，兩者行區間互不重疊（本提案僅動 MP，030 僅動 EC），可各自獨立套用。

## COMPATIBILITY

純文字重排：8 個項目全部保留（`Differential Privacy`/`Secure Enclaves`/`Federated Analysis`/`Federated Learning`/`Secure Multi-party Computation`/`Homomorphic Encryption（只在適用成本與成熟度下）` 逐字不動），僅新增兩層分類標籤與對應說明句。Grep 確認（見下方 BUGHUNT 範疇）repo 內目前沒有任何其他檔案以「清單順序」或「清單為單一未分級陣列」的假設解析 MP §149（`specs/execution/handoff.schema.yaml`、`docs/adr/ADR-002-*.md` 等既有引用只點名章節號與行號範圍，不依賴清單內部結構），故本次重排對既有 consumer 是非破壞性變更。

## MIGRATION

`Edit` 工具精確字串替換套用 diff；套用後（若操作者核准）需重算 MP baseline hash 並更新 `document-hashes.yaml`（若存在）或等效 hash 登記處。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成套用前的單一清單版本——ADR-007 Migration/Rollback 段已明確定性此為「純文字重排，同 ADR-004 §12.1 CALCULATED RESULT 移除的風險等級」。

## EVIDENCE

- `docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`（Recommendation point 4、Sub-decision (b) Options Considered、Migration/Rollback 段）
- `policies/privacy/pii-redaction.policy.yaml:203-217`（`mp_149_reclassification` 區塊，本提案轉錄的機器可讀正本）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5659-5672`（現況逐字讀取確認）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:330`（MRSP-2 列：確認 ADR-007 裁決已定案，母文件套用為剩餘工作，此為治理流程步驟非未決架構問題）

## Diff

### Original

```text
# 149. Privacy-preserving Computation

未來高階能力可支援：

- Pseudonymization
- Tokenization
- Differential Privacy
- Secure Enclaves
- Federated Analysis
- Federated Learning
- Secure Multi-party Computation
- Homomorphic Encryption（只在適用成本與成熟度下）

不得為了「先進」而無條件採用高複雜技術；需通過成本、維護、威脅模型驗證。
```

### Proposed

```text
# 149. Privacy-preserving Computation

隱私保護運算技術依成熟度分為兩層（ADR-007 裁決，2026-08-29 ACCEPTED）：

v1_baseline（Must，本次即可用，已是法規承認的基準安全措施）：

- Pseudonymization
- Tokenization

future_advanced（Won't，需個案通過成本、維護、威脅模型驗證後才排入 roadmap）：

- Differential Privacy
- Secure Enclaves
- Federated Analysis
- Federated Learning
- Secure Multi-party Computation
- Homomorphic Encryption（只在適用成本與成熟度下）

不得為了「先進」而無條件採用 future_advanced 清單中的高複雜技術；需通過成本、維護、威脅模型驗證後才可排入 roadmap。v1_baseline 兩項為現行可用之基準安全措施，其 v1 去識別化機制見 `policies/privacy/pii-redaction.policy.yaml`。
```

### Reason

依 ADR-007 Recommendation point 4 逐字轉錄：把 8 項清單依成熟度拆成 `v1_baseline`（Must）與 `future_advanced`（Won't）兩層，沿用 Method Atlas MoSCoW（F16）現成詞彙而非發明第四套分級名稱（ADR-007 §Method Used）。6 項 future_advanced 內容與順序完全保留、零語意流失。新增結尾句把 v1_baseline 的實際落地機制（keyed-HMAC tokenization policy）與清單本身建立可追溯連結，同時保留原句「不得為了先進而無條件採用高複雜技術」的驗證原則，僅限定其適用範圍為 future_advanced 清單（因為 v1_baseline 兩項已通過驗證，不應被原句字面義誤讀為連 v1_baseline 都要重新驗證）。
