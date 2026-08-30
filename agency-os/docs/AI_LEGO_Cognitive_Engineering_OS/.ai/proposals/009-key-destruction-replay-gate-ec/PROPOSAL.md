---
proposal_id: "009"
slug: "key-destruction-replay-gate-ec"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L3041-3053"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "a911d1d69"
---

## PROPOSED_CHANGE

Execution Contract §105 Backups / Restore 之下新增子小節 `## 105.1 Key Vault Restore Gate：Key Destruction Record Replay`，規定任何 Key Vault 從備份還原後，必須先重放所有時間戳晚於該備份快照的 Key Destruction Record（對其 DEK 執行等效銷毀）才能將還原後的 Vault 標記為 live、允許服務 decrypt 請求，並指向已存在的機器可讀正本 `specs/security/key-vault-lifecycle.schema.yaml` 的 `vault_restore_event`/`replay_gate`。

## RATIONALE

**修正 §編號**：任務指派原文未給出此提案的確切 EC 章節/行區間，要求「讀 ADR-002 本身找出它引用的確切章節」。讀完 ADR-002 全文後確認：ADR-002 Consequences「需要新增的規格缺口」第 6 項逐字寫明「EC §105 Backups/Restore（`DEVOPS_SRE_PLAN.md` §3.2 已標記無演練週期）需新增『Key Vault 還原前必須重放 Key Destruction Record』的強制關卡」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:131`）。EC §105 現況（L3041-3053，逐字讀取確認）標題正是「Backups / Restore」，故本提案目標章節與任務假設的「backup/restore 段落」一致，僅確切編號需由 ADR 原文補上（EC §105，非任務簡報未指定的猜測值）。

強制關卡本身的措辭逐字取自 ADR-002 Codex 對抗式覆審後「修正 2」：「任何從 Key Vault 備份還原（disaster recovery restore）的操作，在還原後的 Vault 被允許服務任何 decrypt 請求之前，必須先重放所有時間戳晚於該備份快照的 Key Destruction Record，對其中每一筆記錄的 DEK 執行等效銷毀，才能將還原後的 Vault 標記為 live」（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:117`）。`specs/security/key-vault-lifecycle.schema.yaml` 已於 Phase 3 將此機制編碼為機器可驗證的 `vault_restore_event`（`decrypt_serviceable` 閘門布林 + `replay_gate` 狀態機，`specs/security/key-vault-lifecycle.schema.yaml:362-440`），本提案沿用該檔案已定稿的機制敘述與欄位名稱，不重新推導。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§105 Backups / Restore（L3041-3051，插入點在 L3053 的 `---` 分隔線之前）

## DEPENDENCIES

依賴 `specs/security/key-vault-lifecycle.schema.yaml`（已存在，ACTIVE，`vault_restore_event`/`replay_gate`/`decrypt_serviceable` 機器可讀正本）。與 `005-crypto-shred-dek-lifecycle-mp`（MP §148.1 DEK 生命週期，本提案的銷毀對象）語意鄰接但修改檔案不同、行區間不重疊，可獨立套用。另與 `docs/architecture/DEVOPS_SRE_PLAN.md` §3.2（WORM 35 天 immutability window）交互——該檔案本身不因本提案而修改，僅為引用來源。

## COMPATIBILITY

純母文件散文新增，不修改 §105 既有任何一行文字，不影響任何現有 schema/policy/code。

## MIGRATION

`Edit` 工具精確字串替換（在 L3051 之後、L3053 `---` 之前插入新子小節）；套用後重算 Execution Contract sha256 並更新 `document-hashes.yaml`。

## ROLLBACK

`git revert` 完整還原原始文字；Phase 3 尚無任何程式碼消費此段母文件散文，零 downstream 風險。

## EVIDENCE

- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:103-117`（Codex Oracle 對抗式覆審段落，「修正 2」完整原文）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:131`（Consequences 規格缺口第 6 項，逐字指出 EC §105 為目標章節）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:3041-3053`（本提案讀取的 §105 現況全文）
- `specs/security/key-vault-lifecycle.schema.yaml:362-440`（`vault_restore_event`/`replay_gate` 機器可讀正本，本提案沿用其機制敘述）
- `docs/architecture/DEVOPS_SRE_PLAN.md`（§3.2，WORM 35 天 immutability window，ADR-002 修正 2 引用其與本關卡風險視窗的交互）

## Diff

### Original

Execution Contract §105（L3041-3053，逐字）：

````text
# 105. Backups / Restore

有 backup 不等於能 restore。

高風險 data change 前：

```text
restore drill evidence
```

或至少確認最近可接受 restore test 符合 policy。

---
````

### Proposed

````text
# 105. Backups / Restore

有 backup 不等於能 restore。

高風險 data change 前：

```text
restore drill evidence
```

或至少確認最近可接受 restore test 符合 policy。

## 105.1 Key Vault Restore Gate：Key Destruction Record Replay

任何從 Key Vault 備份還原（disaster recovery restore）的操作，在還原後的 Vault 被允許服務任何 decrypt 請求之前，必須先重放所有時間戳晚於該備份快照的 Key Destruction Record，對其中每一筆記錄的 DEK 執行等效銷毀，才能將還原後的 Vault 標記為 live（機器可驗證定義：`specs/security/key-vault-lifecycle.schema.yaml` 的 `vault_restore_event`／`replay_gate`）。

```text
Vault Restored From Backup
↓
decrypt_serviceable = false（強制預設）
↓
從獨立稽核日誌（非還原中的 Vault 本身）查出所有 destroyed_at 晚於備份快照時間 的 Key Destruction Record
↓
逐筆對還原後 Vault 重放銷毀（re-destroy）
↓
全部重放完成且驗證通過 → decrypt_serviceable = true
```

此關卡為強制步驟，非選配清理作業——與既有 WORM 35 天 immutability window（`docs/architecture/DEVOPS_SRE_PLAN.md` §3.2）交互：備份本身在該窗口內不可手動刪改，「備份含已銷毀 DEK」的風險視窗至少與 WORM 窗口等長，故此步驟必須是還原流程的強制關卡，否則整個 WORM 保護期都是潛在的假刪除視窗。

---
````

### Reason

這是 ADR-002（ACCEPTED）Codex 對抗式覆審後「修正 2」在母文件的直接落地，非新架構決策。整段強制關卡描述逐字轉錄自 ADR-002 Recommendation 段落（`docs/adr/ADR-002-...md:117`），WORM 交互推論同樣逐字轉錄（同檔同行：「因備份本身在 35 天 immutability window 內不可手動刪改，『備份含已銷毀 DEK』這個風險視窗至少與 WORM 窗口等長——這進一步確認此步驟不能是選配的清理作業，必須是還原流程的強制關卡」）。本提案存在的直接理由是修補 Codex 覆審 CONFIRMED/PLAUSIBLE 發現所指出的「銷毀只涵蓋 live 副本、未涵蓋備援快照」缺口（同檔:111），若不補上此關卡，ADR-002 整個 Recommendation 的「不可逆刪除」承諾在災難復原情境下會失效。子小節編號 `105.1` 與插入位置比照 Execution Contract 既有 `# N. Title` + `## N.M Subsection` 慣例。
