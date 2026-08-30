---
proposal_id: "010"
slug: "tenant-domain-model-object-mp"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L330-357"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "b5856186c"
---

## PROPOSED_CHANGE

Master Plan §3「產品核心物件」的 Domain Model 清單（現有 22 個物件）新增 `Tenant` 作為第 23 個物件，附加一行 `Tenant 1:N Workspace` cardinality 註記（一個 Workspace 恰屬於一個 Tenant，不存在跨 Tenant 共用的 Workspace）。

## RATIONALE

`docs/adr/ADR-003-tenant-model-and-cas-isolation.md`（ACCEPTED 2026-08-29）Sub-decision (a)（L34-55）裁決：「Add `Tenant` as domain object #23 in Master Plan §3, with `Tenant 1:N Workspace` as the binding cardinality」。ADR Context 段（L15-17）已驗證：Master Plan §3（L330-357）目前逐字列舉恰好 22 個物件，`Tenant` 不在其中——這正是 P1-DUP-3（severity: high）指出的問題之一：`Tenant` 全語料庫只出現 3 次（MP L269、Atlas L4140、EC L1265），且沒有任何一處給出 schema 或 cardinality。本提案是該裁決在 §3 這個站點的具體落地：只新增清單第 23 項與一行 cardinality 註記，不新增完整欄位定義——完整欄位定義已由 Phase 3 落在 `specs/domain/tenant.schema.yaml`（機讀正本），母文件本身向來只列物件名稱、不重複維護欄位細節（§3 現有 22 個物件亦無任何一個在此清單內展開欄位），故新增 Tenant 沿用相同慣例。

編號選擇「第 23 項」而非插入清單開頭：ADR-003 原文明確用語是「domain object **#23**」（L36），且現有 22 項清單本身無階層排序（非依 Tenant→Workspace→Project 的爆炸半徑順序排列，純粹是平面物件目錄），故忠實轉錄為附加在清單尾端，不重新排序既有 22 項。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§3 產品核心物件（L330-357）

## DEPENDENCIES

- 依賴 `specs/domain/tenant.schema.yaml` 已存在（已建，2026-08-29／30，ADR-003 Sub-decision (a) 的機讀編譯正本，8 欄位 `tenant_id/legal_name/status/home_jurisdiction/data_residency_region/encryption_root_key_ref/created_at/deleted_at` 逐字轉錄自 ADR-003）——本提案只在母文件加入物件名稱與 cardinality 一行，欄位細節不重複貼在此處，讀者查完整 schema 請見該檔。
- 與 `011-cas-path-tenant-scoped-mp`、`012-blast-radius-chain-reconciliation-mp` 同源自 ADR-003，但三者修改的行區間互不重疊，各自獨立可套用，無強制同批次要求。

## COMPATIBILITY

不影響任何既有 schema、policy 或 recipe 檔案——`specs/domain/tenant.schema.yaml` 已獨立存在且未對 MP §3 這段清單文字有任何機讀依賴（該 schema 的 `verification.note` 明載「No mother document or ADR was modified to produce this file」）。純新增一個清單項目與一行說明，不修改既有 22 個物件的任何文字。

## MIGRATION

`Edit` 工具精確字串替換；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 22 物件清單原文。Phase 3 尚無程式碼直接解析 §3 這段文字清單本身（消費的是 `specs/domain/tenant.schema.yaml`），回滾零下游風險。

## EVIDENCE

- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:15-17`（P1-DUP-3 Context，22 物件清單、Tenant 缺席的驗證）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:34-55`（Sub-decision (a) 決策文字與最小 schema）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:102`（Recommendation item (a)）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:124`（Evidence 段對 MP §3 L330-357 的行號引用）
- `specs/domain/tenant.schema.yaml:26-39`（該檔自述「MP §3 currently enumerates exactly 22 objects with Tenant absent; this file is the schema that MP §3 needs to reference once a documentation PROPOSAL... adds Tenant as the 23rd entry」）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:330-357`（本次任務實讀，確認現況為 22 物件、無 Tenant）

## Diff

### Original

Master Plan §3（L330-357，逐字）：

````text
# 3. 產品核心物件

整個 Domain Model 以以下物件為核心：

```text
Workspace
Project
Source
Evidence
Claim
Knowledge
Artifact
Capability
Workflow
Execution
Policy
Identity
Decision
HumanContribution
Annotation
Idea
Dataset
AnalysisPlan
AnalysisRun
Simulation
Experiment
Outcome
```
````

### Proposed

````text
# 3. 產品核心物件

整個 Domain Model 以以下物件為核心：

```text
Workspace
Project
Source
Evidence
Claim
Knowledge
Artifact
Capability
Workflow
Execution
Policy
Identity
Decision
HumanContribution
Annotation
Idea
Dataset
AnalysisPlan
AnalysisRun
Simulation
Experiment
Outcome
Tenant
```

`Tenant 1:N Workspace`：一個 Workspace 恰屬於一個 Tenant，不存在跨 Tenant 共用的 Workspace（ADR-003 Sub-decision (a)）。完整欄位定義見 `specs/domain/tenant.schema.yaml`。
````

### Reason

新增第 23 個 Domain Model 物件 `Tenant`，並在清單後補一行 cardinality 註記——這是 `ADR-003` Sub-decision (a) 已批准之裁決（`Tenant` domain object #23、`Tenant 1:N Workspace`）的逐字落地，不是本提案的新裁決。欄位細節不在母文件展開，指向已建成的 `specs/domain/tenant.schema.yaml` 作為機讀正本，避免母文件與 schema 檔案各自維護一份可能漂移的欄位清單。
