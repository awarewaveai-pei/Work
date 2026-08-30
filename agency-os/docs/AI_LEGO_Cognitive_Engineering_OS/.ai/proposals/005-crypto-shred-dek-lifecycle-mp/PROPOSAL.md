---
proposal_id: "005"
slug: "crypto-shred-dek-lifecycle-mp"
status: HUMAN_REVIEW
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L5637-5657"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §148 Encryption & Key Sovereignty 之下新增子小節 `## 148.1 Per-Subject DEK Lifecycle`，描述 ADR-002 Option A（crypto-shredding）的 per-subject DEK 生命週期：發行 → 以 tenant KEK 包住 → 加密欄位 → （刪除請求）銷毀 DEK 全部物理副本 → 寫 Key Destruction Record，並註明銷毀後 projection 填入 `REDACTED` sentinel、不中斷 Replay。

## RATIONALE

ADR-002 Consequences「需要新增的規格缺口」第 1 項明文要求：「MP §148 之下新增『Per-Subject DEK 生命週期』小節」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:126`）。這是 ADR 已 ACCEPTED 的 Recommendation（Option A，`docs/adr/ADR-002-...md:61`）在母文件層級唯一缺的落地——§148 現況只定義金鑰主權模式（Platform-managed/BYOK/HYOK/Customer HSM/Local-only/Region-bound），未往下擴一層到 per-subject 粒度（同檔 Context 段落鄰接積木表，`docs/adr/ADR-002-...md:21`）。DEK 銷毀「必須涵蓋該金鑰的所有物理副本（live + 備援/災復快照）」一句直接逐字引自 Codex 對抗式覆審後的不變量修正（`docs/adr/ADR-002-...md:113`）。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§148 Encryption & Key Sovereignty（L5637-5656，插入點在 L5657 的 `---` 分隔線之前）

## DEPENDENCIES

依賴 `specs/security/key-vault-lifecycle.schema.yaml`（已存在，ACTIVE，定義 `key_record`/`key_destruction_record`/`vault_restore_event` 機器可讀結構）與 `specs/security/personal-data-envelope.schema.yaml`（已存在，定義本小節提及的加密欄位 envelope，格式細節由 `009-crypto-shred-envelope-format-ec` 掛在 EC §27）。不要求與 `006`/`007`/`008`/`009` 同批次套用——四份分別對應 ADR-002 Consequences 六項規格缺口中互不重疊的四項，各自獨立可套用，但四者合起來才是完整閉環。

## COMPATIBILITY

純母文件散文新增（append 一個子小節在既有 `---` 分隔線之前），不修改 §148 既有任何一行文字，不影響任何現有 schema/policy/code——兩份既存 schema 檔（`key-vault-lifecycle.schema.yaml`、`personal-data-envelope.schema.yaml`）本就以「MP §148 尚未定義 per-subject 層級，此為缺口」為前提撰寫，此提案套用後這些 schema 檔的既有引用（如 `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5637-5656 (§148 ...)`）維持精確，無需連動修改。

## MIGRATION

`Edit` 工具精確字串替換（在 L5656 空行與 L5657 `---` 之間插入新子小節）；套用後重算 Master Plan sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原原始文字；Phase 3 尚無任何程式碼消費此段母文件散文，零 downstream 風險。

## EVIDENCE

- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:59-67`（Option A 完整機制描述）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:113`（Codex 覆審後不變量修正：所有物理副本）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:126`（Consequences 規格缺口第 1 項，逐字要求本提案）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5637-5657`（本提案讀取的 §148 現況全文）
- `specs/security/key-vault-lifecycle.schema.yaml:1-30`（已存在的機器可讀對應結構，description 段引用 MP §148）

## Diff

### Original

Master Plan §148（L5637-5657，逐字）：

````text
# 148. Encryption & Key Sovereignty

支援：

```text
Platform-managed Keys
BYOK
HYOK
Customer HSM
Local-only Keys
Region-bound Keys
```

高主權環境：

```text
Customer controls key
Provider cannot decrypt independently
```

---
````

### Proposed

````text
# 148. Encryption & Key Sovereignty

支援：

```text
Platform-managed Keys
BYOK
HYOK
Customer HSM
Local-only Keys
Region-bound Keys
```

高主權環境：

```text
Customer controls key
Provider cannot decrypt independently
```

## 148.1 Per-Subject DEK Lifecycle

個資欄位（依 §61 分級為 Confidential/Restricted 者）寫入 Event Ledger 前，以該 data subject 專屬的 Data Encryption Key（DEK, AES-256-GCM）加密；DEK 本身用 tenant 級 Key-Encryption-Key（KEK）包住（envelope encryption，格式見 §27.1），KEK 依本節既有主權模型存放於獨立 Key Vault，不進 Event Ledger（key record 機器可讀結構見 `specs/security/key-vault-lifecycle.schema.yaml`）。

```text
Issue per-subject DEK
↓
Wrap DEK by tenant KEK
↓
Encrypt Confidential/Restricted field with DEK
↓
[DEK Active — 可解密]
↓（資料主體提出刪除請求）
Destroy DEK 的所有物理副本（live + 備援／災復快照）
↓
寫入 Key Destruction Record 至獨立稽核日誌
↓
[DEK Destroyed — 不可逆]
```

刪除請求 = 銷毀該 subject 的 DEK 記錄；Event 結構本身不動。projection 讀到已銷毀 DEK 的欄位時 decrypt 失敗，依 policy 填入 `REDACTED` sentinel，不中斷 Replay（§112）。

---
````

### Reason

這是 ADR-002（ACCEPTED）Recommendation 採用之 Option A 機制在母文件的直接落地，非新架構決策。逐字轉錄 ADR-002 Option A 段落（`docs/adr/ADR-002-...md:61`：「個資欄位...以該 data subject 專屬的 DEK（AES-256-GCM）加密；DEK 本身用 tenant 級 KEK...包住...刪除請求 = 銷毀該 subject 的 DEK 記錄...decrypt 失敗依 policy 填入 REDACTED sentinel，不中斷 replay」）與 Codex 覆審後修正的不變量（`docs/adr/ADR-002-...md:113`：「DEK 的銷毀承諾必須涵蓋該金鑰的所有物理副本」），對應 ADR Consequences 規格缺口第 1 項的明文要求。子小節編號 `148.1` 與插入位置（既有內容之後、`---` 分隔線之前）均比照 Master Plan 既有 `# N. Title` + `## N.M Subsection` 慣例（如 §5「部署模式」下轄 §5.1–§5.4）。
