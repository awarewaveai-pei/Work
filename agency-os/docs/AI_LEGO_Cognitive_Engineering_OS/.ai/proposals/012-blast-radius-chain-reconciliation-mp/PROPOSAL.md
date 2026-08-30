---
proposal_id: "012"
slug: "blast-radius-chain-reconciliation-mp"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L262-275"]
related_open_questions: []
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §1.5「最小爆炸半徑」現有的 6 層隔離清單（無 Branch）整段改為指向 Method Atlas §21 的 3 行 pointer——Atlas §21 的 7 層鏈（含 Branch）成為唯一正本，母文件不再重複維護一份可能漂移的副本。

## RATIONALE

`docs/adr/ADR-003-tenant-model-and-cas-isolation.md`（ACCEPTED 2026-08-29）Context 段 P1-DUP-3（L18）逐字驗證：Master Plan §1.5（L268-274）是 6 層鏈（`Tenant Isolation → Workspace Isolation → Project Isolation → Workflow Isolation → Execution Isolation → Capability Isolation`，無 Branch），Method Atlas §21 mermaid（L4136-4146）是 7 層鏈（`Tenant → Workspace → Project → Workflow → Branch → Execution → Capability`，含 Branch）——兩份文件對同一個「爆炸半徑鏈」各自維護一份節點數不一致的副本，且 `Branch` 作為爆炸半徑節點在全語料庫零定義（ADR-003 L19，全文 grep 驗證）。

Sub-decision (c)（L87-94）裁決：「Method Atlas §21's 7-layer chain (with Branch) becomes canonical. Master Plan §1.5 is updated to either match it exactly or become an explicit pointer to Atlas §21 as SSOT.」原文字面給出兩個選項（逐字複製 vs 指標），但緊接的 Reasoning（L92）明確表態方向：「This follows a precedent the corpus already sets for itself... Treating Method Atlas as the single source of truth for architectural/topological detail is the corpus's own established pattern.」——即裁決本身傾向「不重複維護，改指標」，而非兩處各自逐字保留一份 7 層鏈。

本提案採「指標」而非「逐字複製」，除了 ADR-003 自身的 Reasoning 傾向外，還有兩點獨立佐證：(1) Master Plan §0.0.1「文件職責分離」表（L51-58）本身已明載 Master Plan「不負責」完整 Method semantics，Atlas 才是 Cognitive Primitive / Method / Lens 相關細節的 Authoritative Scope——爆炸半徑鏈的拓撲細節與 Atlas §21 的 `強制規則`（rule 3/4/8 等）緊密綁定，屬於同一個機制的一部分，硬拆成兩處逐字維護會製造新的漂移風險，與本 ADR 想解決的 P1-DUP-3 根因相同；(2) 本 repo 已有兩個先例（`001-architecture-constitution-mp-pointer`、`002-architecture-constitution-ec-pointer`）對另一個雙重維護問題（Scoped Authority 裁決鏈）採用完全相同的「單一正本 + 指標」處置，本提案延續同一慣例，確保治理層決策模式在整個 repo 內一致，不因議題不同而忽指標忽逐字複製。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§1.5 最小爆炸半徑（L262-275）

## DEPENDENCIES

- 依賴 `specs/execution/blast-radius-chain.schema.yaml` 已存在（已建，ADR-003 Sub-decision (c) 的機讀編譯正本，7 節點鏈 + `branch_node` 最小定義 + `containment_semantics` 逐一標注哪些是 ADR 明確裁決、哪些是 Phase 3 編譯延伸）。
- 依賴 Method Atlas §21（L4136-4159）維持現況（7 層鏈 + 9 條強制規則）不變——本提案不修改 Atlas，只讓 MP 指向它。若 `013-branch-definition-atlas` 同時套用（在 Atlas §21 補上 Branch 的敘事級定義），兩者互不衝突：本提案的 pointer 文字本來就沒有重複展開 Branch 定義本身，只指向 Atlas §21 整節。
- 與 `010-tenant-domain-model-object-mp`、`011-cas-path-tenant-scoped-mp` 同源自 ADR-003（分別是 Sub-decision (a)/(b)/(c) 的落地），修改行區間互不重疊，可各自獨立套用，無強制同批次要求。

## COMPATIBILITY

不影響任何既有 schema、policy 或 recipe 檔案——`specs/execution/blast-radius-chain.schema.yaml` 的 `verification.note` 明載「No mother document or ADR was modified to produce this file」，即該 schema 從一開始就以「MP §1.5 為待整併的 6 層副本、Atlas §21 為 CANONICAL」為前提設計（見該檔 `source_of_truth_for` 明確標注 Atlas §21 為 CANONICAL、MP §1.5 為 SUPERSEDED）。Phase 3 尚無任何程式碼直接解析 §1.5 這段敘事文字本身，本提案純粹是讓母文件敘事追上已編譯完成的機讀正本。

## MIGRATION

`Edit` 工具精確字串替換；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 6 層鏈原文。Phase 3 尚無程式碼直接解析 §1.5 這段文字（實際驗證邏輯在 `specs/execution/blast-radius-chain.schema.yaml`，不因母文件敘事回滾而改變），回滾零下游風險。

## EVIDENCE

- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:18`（P1-DUP-3 Context，6 層 vs 7 層節點數不一致的驗證）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:19`（Branch 作為爆炸半徑節點全語料庫零定義的驗證）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:87-94`（Sub-decision (c) 完整裁決文字與 Reasoning）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:104`（Recommendation item (c)）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:123`（Evidence 段對 MP §1.5 L262-275 的行號引用）
- `docs/adr/ADR-003-tenant-model-and-cas-isolation.md:128`（Evidence 段對 Atlas §21 L4136-4159 的行號引用，標注含 Branch 的 7 層鏈）
- `specs/execution/blast-radius-chain.schema.yaml:9-21`（該檔 description 逐字重述 P1-DUP-3 並標注 Atlas §21 為 CANONICAL、MP §1.5 為 SUPERSEDED）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:51-58`（§0.0.1 文件職責分離表，佐證 Atlas 為 Method/拓撲細節 Authoritative Scope 的既有慣例，本次任務實讀獨立確認）
- `.ai/proposals/001-architecture-constitution-mp-pointer/PROPOSAL.md`（同一 repo 內「單一正本 + 指標」處置慣例的先例）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:262-275`（本次任務實讀，確認現況為 6 層鏈，無 Branch）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:4136-4159`（本次任務實讀，確認 Atlas §21 現況為 7 層鏈 + 9 條強制規則，維持不變）

## Diff

### Original

Master Plan §1.5（L262-275，逐字）：

````text
## 1.5 最小爆炸半徑

故障只允許影響最小區域。

隔離層級：

```text
Tenant Isolation
→ Workspace Isolation
→ Project Isolation
→ Workflow Isolation
→ Execution Isolation
→ Capability Isolation
```
````

### Proposed

```
## 1.5 最小爆炸半徑

故障只允許影響最小區域。

隔離層級的唯一正本見 Method Atlas §21 最小爆炸半徑（7 層，含 Branch：`Tenant → Workspace → Project → Workflow → Branch → Execution → Capability`），禁止在本文件重複定義以避免節點數漂移（ADR-003 Sub-decision (c)）。機讀正本：`specs/execution/blast-radius-chain.schema.yaml`。
```

### Reason

把 Master Plan §1.5 的 6 層鏈整段改為指向 Atlas §21 的 3 行 pointer，是 `ADR-003` Sub-decision (c) 已批准的 Recommendation item (c)（採 Atlas §21 7 層鏈為 canonical）的逐字落地，不是本提案的新裁決；選擇「指標」而非「逐字複製」是依 ADR-003 自身 Reasoning 段的明確傾向與本 repo 既有慣例（proposals 001/002）做出的工程判斷，非隨意詮釋。
