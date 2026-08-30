---
proposal_id: "008"
slug: "event-pii-annotation-and-redacted-event-mp"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L2546-2568"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §57 Event-native Architecture 的 event 範例清單新增第 10 筆 `PersonalDataRedacted`，並在其下新增子小節 `## 57.1 個資分級標註（Confidential/Restricted Event Types）`，標註既有 `DocumentUploaded`/`ClaimCreated` 兩個 event type 含 Confidential/Restricted 分級欄位，且說明 `PersonalDataRedacted` 僅為稽核輔助角色、非獨立刪除機制。

## RATIONALE

本提案一次閉環 ADR-002 Consequences「需要新增的規格缺口」第 4 項與第 5 項兩條——任務指派本就要求兩者合併成單一提案：

- 第 4 項：「MP §57 event 清單旁需標註哪些既有 event type（`DocumentUploaded`/`ClaimCreated` 等）含 Confidential/Restricted 分級欄位——現況零標註」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:129`）。
- 第 5 項：「新增 `PersonalDataRedacted` 事件到 §57 清單（僅稽核輔助角色）」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:130`）。

`specs/domain/personal-data-redacted-event.schema.yaml` 已於 Phase 3 建好機器可讀正本，其自身 description 明文將自己定位為「這是 MP §57 既有 9 項範例清單缺的第 10 項」（`specs/domain/personal-data-redacted-event.schema.yaml:8-13`），並在 `source_of_truth_for` 段落點名 MP §57 為待補目標（同檔 L45）。依任務指示「檢查 schema 是否已存在，若有則引用其精確欄位形狀而非重新發明」，本提案的事件定義與角色邊界措辭直接沿用該 schema 檔案已定稿的 ROLE BOUNDARY 段落（同檔 L18-34），不重新推導。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§57 Event-native Architecture（L2546-2566，插入點在 L2568 的 `---` 分隔線之前；event 清單本身在 L2552-2562 內新增第 10 行）

## DEPENDENCIES

依賴 `specs/domain/personal-data-redacted-event.schema.yaml`（已存在，ACTIVE，`PersonalDataRedacted` 事件四必填欄位 `subject_id/redacted_fields/redacted_at/authorization_ref` 的機器可讀正本）。與 `007-crypto-shred-vs-general-deletion-branch-ec` 語意鄰接（該提案 EC §31.1 的 crypto-shred 分支 Deletion Evidence 步驟引用本提案新增的事件）但修改檔案不同、行區間不重疊，可獨立套用，建議與 `007` 同批次審閱。

## COMPATIBILITY

對 event 範例清單是純增量（新增第 10 行 `PersonalDataRedacted`），不刪除、不修改既有 9 個 event type 名稱本身；分級標註以獨立子小節呈現，不在原始 `DocumentUploaded`/`ClaimCreated` 字面行內插入註解，故不影響任何對該 code block 做逐行字面比對的既有讀取邏輯。不影響任何現有 schema/policy/code。

## MIGRATION

`Edit` 工具精確字串替換（在既有 9 項清單末端新增 `PersonalDataRedacted` 一行，並在 L2566 之後、L2568 `---` 之前插入新子小節）；套用後重算 Master Plan sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原原始文字；Phase 3 尚無任何程式碼消費此段母文件散文，零 downstream 風險。

## EVIDENCE

- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:75-85`（Option C 事件定義、FMEA、角色邊界原文）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:129-130`（Consequences 規格缺口第 4/5 項，逐字要求本提案）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2546-2568`（本提案讀取的 §57 現況全文）
- `specs/domain/personal-data-redacted-event.schema.yaml:8-52`（事件四欄位、ROLE BOUNDARY、READ-PATH BEHAVIOR 機器可讀正本，本提案沿用其措辭）
- `specs/domain/personal-data-redacted-event.schema.yaml:230-250`（open_questions `MRSP-pdr-2`，明文記載「MP §57 事件 PII 標註」仍待一份 PROPOSAL 補上——即本提案）

## Diff

### Original

Master Plan §57（L2546-2568，逐字）：

````text
# 57. Event-native Architecture

核心狀態用 Event Ledger，而非只靠 CRUD。

例如：

```text
DocumentUploaded
TranscriptGenerated
TranscriptCorrected
ClaimCreated
ClaimVerified
ClaimRejected
StrategyGenerated
StrategyApproved
ArtifactPublished
```

Current State = Events 的 Projection。

可以 Replay 到任意歷史狀態。

---
````

### Proposed

````text
# 57. Event-native Architecture

核心狀態用 Event Ledger，而非只靠 CRUD。

例如：

```text
DocumentUploaded
TranscriptGenerated
TranscriptCorrected
ClaimCreated
ClaimVerified
ClaimRejected
StrategyGenerated
StrategyApproved
ArtifactPublished
PersonalDataRedacted
```

Current State = Events 的 Projection。

可以 Replay 到任意歷史狀態。

## 57.1 個資分級標註（Confidential/Restricted Event Types）

依 §61 資料分級，下列既有 event type 含 Confidential/Restricted 分級欄位，寫入前必須套用 §27.1 Encrypted Field Envelope：

```text
DocumentUploaded  — 可能含身分文件等 Restricted 欄位
ClaimCreated      — 可能含理賠人個資（如身分證號）等 Confidential/Restricted 欄位
```

`PersonalDataRedacted` 為稽核輔助角色事件（機器可讀正本：`specs/domain/personal-data-redacted-event.schema.yaml`），記錄「何時、依哪個 Authorization、對哪個 subject 的哪些欄位執行了 crypto-shred」。此事件本身不是刪除機制——原始事件（如 `ClaimCreated`）在 crypto-shred 後仍完整保留（含密文，見 §27.1），僅供 projection read path 疊加 `REDACTED` 呈現與稽核之用（對應 §31.1 Deletion Evidence 步驟）。單獨依賴此事件存在本身，不構成合規刪除的充分證明。

---
````

### Reason

這是 ADR-002（ACCEPTED）Consequences 規格缺口第 4 項與第 5 項在母文件的直接落地，非新架構決策。`PersonalDataRedacted` 加入清單逐字對應 ADR 原文「新增 PersonalDataRedacted 事件到 §57 清單（僅稽核輔助角色）」；角色邊界措辭「此事件本身不是刪除機制...單獨依賴此事件存在本身，不構成合規刪除的充分證明」逐字呼應 ADR-002 Option C 段落 FMEA 發現（「Option C 若單獨採用，等於重新製造 P1-CONFLICT-1 本身，只是換了個名字」，`docs/adr/ADR-002-...md:85`）與 §61 分級標註要求（同檔 Consequences 第 4 項原文「現況零標註」）。標註以獨立子小節呈現而非改寫原始清單逐行文字，是為了不破壞既有 9 個 event type 名稱的字面穩定性——這與 ADR 本身「Event 結構本身 100% 不動」的不變量陳述一致（`docs/adr/ADR-002-...md:97`）。
