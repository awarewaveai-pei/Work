---
proposal_id: "006"
slug: "crypto-shred-envelope-format-ec"
status: HUMAN_REVIEW
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L1099-1127"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Execution Contract §27 Event / Messaging Contract 之下新增子小節 `## 27.1 Encrypted Field Envelope`，定義 Confidential/Restricted 欄位寫入 Event Ledger 前必須套用的加密 envelope 格式七欄位（`cipher_alg / kek_ref / dek_key_id / dek_wrapped / iv / ciphertext / classification_tag`），並指向已存在的機器可讀正本 `specs/security/personal-data-envelope.schema.yaml`。

## RATIONALE

ADR-002 Consequences「需要新增的規格缺口」第 2 項明文要求：「EC §27 需定義加密欄位的 envelope 格式（`cipher_alg / kek_ref / dek_wrapped / iv / ciphertext / classification_tag`）」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:127`）。`specs/security/personal-data-envelope.schema.yaml` 已於 Phase 3 建好機器可讀正本，其自身 `open_questions` 明文記載這正是待補的母文件缺口：「EC §27（Event/Messaging Contract）has not yet been amended to reference this schema...Until that PROPOSAL lands, EC §27 itself is silent on the envelope format this file defines」（`specs/security/personal-data-envelope.schema.yaml:262-270`，id `MRSP-envelope-2`）——本提案即是該 schema 檔案自己點名等待的那份 PROPOSAL。

欄位比 ADR 原文多一個 `dek_key_id`：這是 schema 檔案的既有 additive 決策（非本提案新發明），理由是「沒有穩定的 per-envelope 金鑰識別碼，ADR-002 自己描述的 Vault-mediated unwrap/lookup 機制就無法定址」（`specs/security/personal-data-envelope.schema.yaml:34-61` compilation_decisions 第一條）。依任務指示「grep 確認欄位已存在則沿用 schema 精確欄位名，不重新發明」，本提案直接沿用該七欄位順序與命名，不重新推導。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§27 Event / Messaging Contract（L1099-1126，插入點在 L1127 的 `---` 分隔線之前）

## DEPENDENCIES

依賴 `specs/security/personal-data-envelope.schema.yaml`（已存在，ACTIVE，本提案七欄位定義的機器可讀正本，含 `required: [cipher_alg, kek_ref, dek_key_id, dek_wrapped, iv, ciphertext, classification_tag]`）與 `specs/security/key-vault-lifecycle.schema.yaml`（已存在，`kek_ref`/`dek_key_id` 所指向的 key record 定義）。與 `005-crypto-shred-dek-lifecycle-mp` 語意鄰接（MP §148.1 提及「格式見 §27.1」）但修改檔案不同、行區間不重疊，可獨立套用；建議與 `005` 同批次審閱以避免交叉引用暫時失效。

## COMPATIBILITY

純母文件散文新增，不修改 §27 既有任何一行文字，不影響任何現有 schema/policy/code。套用後 `personal-data-envelope.schema.yaml` 的 `open_questions` 項 `MRSP-envelope-2`（「EC §27 尚未修訂」）可視為關閉，但該項關閉屬該 schema 檔案自身的後續維護，不在本提案套用範圍內。

## MIGRATION

`Edit` 工具精確字串替換（在 L1126 空行與 L1127 `---` 之間插入新子小節）；套用後重算 Execution Contract sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原原始文字；Phase 3 尚無任何程式碼消費此段母文件散文，零 downstream 風險。

## EVIDENCE

- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:61-65`（Option A envelope 機制敘述）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:127`（Consequences 規格缺口第 2 項，逐字六欄位清單）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:1099-1127`（本提案讀取的 §27 現況全文）
- `specs/security/personal-data-envelope.schema.yaml:124-197`（七欄位機器可讀定義，本提案沿用其精確命名與順序）
- `specs/security/personal-data-envelope.schema.yaml:262-270`（open_questions `MRSP-envelope-2`，明文點名等待本提案）

## Diff

### Original

Execution Contract §27（L1099-1127，逐字）：

````text
# 27. Event / Messaging Contract

分散式系統不得假設 exactly-once magically exists。

基本原則：

```text
At-least-once compatible
+
Idempotent Consumer
+
Idempotency Key
+
Replay-safe
+
Versioned Event Schema
```

需要一致性時考慮：

- Outbox
- Inbox
- Deduplication
- Sequence / Causality
- Compensation

Event ID 不得重用。

---
````

### Proposed

````text
# 27. Event / Messaging Contract

分散式系統不得假設 exactly-once magically exists。

基本原則：

```text
At-least-once compatible
+
Idempotent Consumer
+
Idempotency Key
+
Replay-safe
+
Versioned Event Schema
```

需要一致性時考慮：

- Outbox
- Inbox
- Deduplication
- Sequence / Causality
- Compensation

Event ID 不得重用。

## 27.1 Encrypted Field Envelope

依 §101 分級為 Confidential/Restricted 的欄位，寫入 Event Ledger 前必須以下列 envelope 格式加密（機器可讀正本：`specs/security/personal-data-envelope.schema.yaml`）：

```text
cipher_alg          — 固定 "AES-256-GCM"
kek_ref             — 該欄位所屬 tenant 的 KEK 識別碼
dek_key_id          — 該欄位所屬 data subject 的 DEK 識別碼
dek_wrapped         — 以 KEK 包裹（wrap）後的 DEK 密文
iv                  — AES-256-GCM 加密使用的 initialization vector
ciphertext          — 原始欄位值以 DEK 加密後的密文
classification_tag  — Public / Internal / Confidential / Restricted（此 envelope 僅用於 Confidential/Restricted 兩值）
```

Envelope 實例本身不可變——刪除個資 = 銷毀 `dek_key_id` 對應的 DEK（見 §148.1 Per-Subject DEK Lifecycle），不編輯或刪除 envelope 本身。DEK 銷毀後 decrypt 失敗，projection 填入 `REDACTED` sentinel，不中斷 Replay。

---
````

### Reason

這是 ADR-002（ACCEPTED）Consequences 規格缺口第 2 項在母文件的直接落地，非新架構決策。六個核心欄位（`cipher_alg/kek_ref/dek_wrapped/iv/ciphertext/classification_tag`）逐字取自 ADR-002 原文（`docs/adr/ADR-002-...md:127`）；`dek_key_id` 一欄取自已存在、已通過驗證的 `personal-data-envelope.schema.yaml` 的既有 additive 決策，理由是使 ADR-002 自己描述的「decrypt 失敗/成功」驗證機制在有多個 subject 共用同一 tenant KEK 時仍可定址到正確的 DEK——這是沿用既有 schema 的既定結論，不是本提案新增的架構要求。子小節編號 `27.1` 與插入位置比照 Execution Contract 既有 `# N. Title` + `## N.M Subsection` 慣例（如 §1「命名規則」下轄 §1.1）。
