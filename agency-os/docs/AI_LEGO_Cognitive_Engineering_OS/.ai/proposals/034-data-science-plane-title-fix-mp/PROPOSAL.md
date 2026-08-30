---
proposal_id: "034"
slug: "data-science-plane-title-fix-mp"
status: HUMAN_REVIEW
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L1688-1690"]
related_open_questions: []
change_class: "semantic correction"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

將 Master Plan §27 標題（`L1688`）從「27. Data Science Plane」改為「27. Data Science 執行流程（對應 §4 COMPUTATION PLANE）」，並在標題下方新增一句回指 §4 與跨層對照表（§80.1）的指標句，消除「看起來像第 13 個 Plane」的誤導。

## RATIONALE

`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md`（ACCEPTED，2026-08-29）逐字核對後發現：`MP:1688` 的標題「Data Science Plane」**不在 §4 的 12 個正式 Plane 清單裡**，內容（`MP:1690-1706`）也不是重列一次 COMPUTATION PLANE 的定義，而是一段 AI→Analysis Planner→Trusted Compute Engine 的流程圖。它看起來像第 13 個 Plane，實際上不是，是命名層級混淆的直接證據（ADR-009:42）。這也是「六個站點四種拼法描述同一件事」drift 表的其中一站（ADR-009:37-48）。ADR Recommendation 第 3 項明確指定修正方向與範例標題：「修正 `MP:1688` 標題，從『27. Data Science Plane』改為不再暗示第 13 個 Plane 的名稱（例如『27. Data Science 執行流程（對應 §4 COMPUTATION PLANE）』），並在標題下加一句回指 §4」（ADR-009:172）。本提案逐字採用該範例標題，不自行另擬新名，避免產生第五種拼法。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §27（原標題「Data Science Plane」，`L1688-1690`）

## DEPENDENCIES

- 依賴 `ADR-009` 已 ACCEPTED（已確認：`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3`）。
- 新增的回指指標句提及「§80.1」，該小節由 `033-plane-workspace-module-crosswalk-table-mp` 建立。若 `033` 尚未套用，本提案的指標句會指向一個暫時不存在的小節——**建議先套用或同批次套用 `033`**，否則指標句雖不影響其他機制，但會造成讀者短暫找不到 §80.1 的體驗落差。本提案本身不依賴 `REPOSITORY_ARCHITECTURE.md`（不引用該文件內容），故不受其 `Status: PROPOSED` 現況影響。
- 與 `032`/`035`/`036` 互不重疊，可獨立套用。

## COMPATIBILITY

不影響任何 schema、policy、recipe 檔案——純標題文字與新增一句說明，不改動 §27 本身既有的 AI→Analysis Planner→Trusted Compute Engine 流程圖內容（`L1692-1706` 不變）。

## MIGRATION

套用時使用 `Edit` 工具做精確字串替換；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`（若該登記檔存在）。建議與 `033` 同批次或其後套用（見 DEPENDENCIES）。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成「27. Data Science Plane」原標題。純文字變更、無 runtime 副作用，回滾風險 Low，與 ADR-009 Migration/Rollback 段落一致（ADR-009:196）。

## EVIDENCE

- `docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:29,42,172`（§27 標題非正式 Plane 的發現、Recommendation 第 3 項原文）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:1686-1706`（§27 現況全文，2026-08-30 直接 Read 核對）

## Diff

### Original

`L1686-1690` 逐字：

```text
---

# 27. Data Science Plane

AI 不直接編造數學結果。
```

### Proposed

```text
---

# 27. Data Science 執行流程（對應 §4 COMPUTATION PLANE）

本節為 §4 COMPUTATION PLANE 的執行流程說明，非獨立 Plane；跨層命名對照見 §80.1。

AI 不直接編造數學結果。
```

### Reason

消除「§27 看起來像第 13 個 Plane」的命名層級混淆（ADR-009 P1-DUP-2 具體例證之一），逐字採用 ADR-009 Recommendation 第 3 項已定案的範例標題，不新創命名；新增的回指句同時滿足 ADR 要求的「回指 §4」與方便讀者定位跨層對照表兩個目的。
