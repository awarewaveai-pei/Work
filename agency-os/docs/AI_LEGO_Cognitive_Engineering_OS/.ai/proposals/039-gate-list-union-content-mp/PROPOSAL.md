---
proposal_id: "039"
slug: "gate-list-union-content-mp"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L5903-5927"]
related_open_questions: ["OQ-10"]
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "15324ee2f"
---

## PROPOSED_CHANGE

Amend Master Plan §158 Global Definition of Done（L5903-5927）的兩個條列清單：Global 必須項目從 11 項擴充為 14 項（新增 Evidence PASS、Reasoning PASS、Capacity PASS），高風險另加項目從 1 項擴充為 6 項（新增 Counterevidence PASS、Red Team PASS、Independent Judge PASS、Reversal Criteria PASS、Recovery / Rollback Rehearsal PASS）。同時，14 項 Global 清單的**排列順序**改採 `docs/adr/ADR-011-platform-gate-ownership-and-unification.md` Sub-decision (c) 裁定的聯集清單順序（與 Method Atlas §22.1 原順序一致），而非 MP 原本自己的順序——MP 原順序把「Data PASS」排在「Observability PASS」之後，Atlas／已裁決的聯集清單則把「Data PASS」排在「Privacy PASS」之後、「Jurisdiction PASS」之前；ADR-011 裁定的是聯集清單本身（含順序），不是「MP 原順序 + 插入新項目」。原有 11+1 項目**一個都不刪除、不改名**，純粹擴充。

## RATIONALE

`docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（ACCEPTED 2026-08-30）Sub-decision (b) 逐項核對確認：MP §158 原本的 11 個 Global 項目「逐字全部存在」於 Atlas §22.1 的 14 項清單中，MP 原本唯一的高風險項目「Human Specialist Review PASS」也逐字存在於 Atlas §22.2 的 6 項清單中——三份候選清單之間是嚴格子集/超集關係，不是互斥的價值判斷分歧（Decision Driver #3「fail-closed over fail-open」因此直接適用：既然沒有任何一項要求互相矛盾，採用聯集不是「Atlas/EC 贏了、MP 輸了」，而是單純補齊 MP 自己文件裡原本就存在的完整性缺口）。Sub-decision (c) 進一步裁定：3 個命名漂移項目採 Atlas 的寫法（「Human Specialist Review PASS」「Independent Judge PASS」「Recovery / Rollback Rehearsal PASS」），因為 MP 對其中「Human Specialist Review PASS」一項本來就已經是這個寫法（與 Atlas 逐字相同，EC 的「Human Specialist」才是相對兩方的離群值），另外兩項 MP 原本沒有自己的版本（純新增），比照 MP 現有 11 項全部採「`<Name> PASS`」字尾的既有慣例（`MP:5910-5920`），採用與這個慣例一致的 Atlas 寫法而非 EC 的無字尾寫法（`EC:2246-2276`）。ADR-011 Recommendation 第 2 項明確指示：「Master Plan §158's content, once amended, is the union: 14 Global items + 6 High-risk add-on items ... No existing MP requirement is weakened or removed」——本提案即是該項 Recommendation 的具體落地，不是新裁決。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

§158 Global Definition of Done（L5903-5927，含標題、兩段中文引言、兩個 code fence 條列清單）

## DEPENDENCIES

- **本提案是 `037-gate-list-pointer-atlas` 與 `038-gate-list-pointer-ec` 依賴的內容前提**：那兩份提案把 Atlas §22.1/§22.2 與 EC §68 收斂成「見 Master Plan §158 — SSOT」的指標句，若本提案（真正把 MP §158 的內容擴充成聯集）沒有先套用或同批次套用，會出現一段真空期——Atlas/EC 讀者被導向的 SSOT 內容還停留在原本 11+1 項，比 Atlas/EC 各自原本提供的內容少了 8 項要求。**建議套用順序：本提案先於或與 `037`/`038` 同一 commit 批次套用**，三者理想上落在同一次治理套用批次，避免任一時間點三份文件對「平台級 Definition of Done 到底有幾項」給出不一致答案。
- 不依賴任何尚未完成的其他工作——`specs/execution/gate.schema.yaml` 的 `gate_catalog`（本提案內容的機器可讀比對基準）已在 2026-08-30 完成，`docs/adr/ADR-011-...md` 已 ACCEPTED，兩者皆已就緒。
- 與 `.ai/proposals/` 資料夾內其他既有提案（001-004、030-036 等）修改對象/行區間互不重疊，可獨立套用。

## COMPATIBILITY

`specs/execution/gate.schema.yaml` 的 `gate_catalog`（`status: RESOLVED_2026-08-30`）已經是本提案即將寫入 MP §158 的這 20 項（14 Global + 6 High-risk）內容的機器可讀正本——本提案下方 Diff 的 Proposed 內容逐項比對 `gate_catalog.global.items`（14 項）與 `gate_catalog.high_risk.items`（6 項），id/display_name/順序三者皆對齊，零差異（見下方 EVIDENCE 的逐項核對表）。本提案是讓母文件的**敘述文字**追上 schema 已經有的內容，方向是「文字補齊 schema」，不是「schema 追文字」——套用本提案不需要對 `gate.schema.yaml`、`policies/ai-execution/mandatory-gates.yaml` 或任何其他機讀 spec 做任何修改。不影響任何已批准 ADR 的結論（本身就是 ADR-011 Recommendation 的落地，不是另一個裁決）。

## MIGRATION

套用時使用 `Edit` 工具做精確字串替換（禁止 `sed`/裸 patch）。套用後重新計算 MP sha256，更新 `.ai/research/phase-0/document-hashes.yaml`。因新增 8 行條列項目，套用後 §159 起（`MP:5931` 起）到檔案結尾的絕對行號會整體下移 8 行，套用前建議先 grep 盤點所有以絕對行號引用 MP §159 之後內容的既有文件（例如任何引用「MP:59xx」或更後方行號的 spec/policy/ADR 檔案），套用後同步刷新——此為套用時的配套動作，不在本 DRAFT 提案的 diff 範圍內。建議與 `037`/`038` 同一 commit 套用（見 DEPENDENCIES）。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成 §158 原始 11+1 項條列文字。因 `gate.schema.yaml` 的 `gate_catalog` 才是實際被機器消費的內容來源、且本身已經是聯集內容，回退本提案（純文件層級的敘述文字擴充）零下游程式碼風險，只是讓母文件敘述重新落後於 schema。

## EVIDENCE

- `docs/adr/ADR-011-platform-gate-ownership-and-unification.md`（全文，尤其 Sub-decision (b) 逐項子集/超集核對、Sub-decision (c) 20 項聯集登記表、Recommendation 第 2 項、Evidence 段列出的 MP L5900-5926 全文重讀紀錄）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5900-5931`（本次 session 直接重讀確認逐字內容，含 §158 與前後章節邊界）
- `specs/execution/gate.schema.yaml`（`gate_catalog`，本次 session 重讀確認 RESOLVED_2026-08-30 狀態）
- `.ai/research/phase-0/open-questions.yaml:68-72`（OQ-10，`status: RESOLVED_BY_HUMAN`，本次 session 重讀確認）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源，本次 session 直接跑 `sha256sum` 重算確認與快照一致）

**逐項核對表（本提案 Proposed 內容 vs `gate.schema.yaml#/gate_catalog`，20 項全比對，零差異）：**

| # | Tier | `gate_catalog.id` | `gate_catalog.display_name` | 本提案 Proposed 文字 | 一致？ |
|---|---|---|---|---|---|
| 1 | Global | `functional` | Functional PASS | Functional PASS | ✅ |
| 2 | Global | `evidence` | Evidence PASS | Evidence PASS | ✅ |
| 3 | Global | `reasoning` | Reasoning PASS | Reasoning PASS | ✅ |
| 4 | Global | `security` | Security PASS | Security PASS | ✅ |
| 5 | Global | `privacy` | Privacy PASS | Privacy PASS | ✅ |
| 6 | Global | `data` | Data PASS | Data PASS | ✅ |
| 7 | Global | `jurisdiction` | Jurisdiction PASS | Jurisdiction PASS | ✅ |
| 8 | Global | `localization` | Localization PASS | Localization PASS | ✅ |
| 9 | Global | `accessibility` | Accessibility PASS | Accessibility PASS | ✅ |
| 10 | Global | `observability` | Observability PASS | Observability PASS | ✅ |
| 11 | Global | `capacity` | Capacity PASS | Capacity PASS | ✅ |
| 12 | Global | `rollback` | Rollback PASS | Rollback PASS | ✅ |
| 13 | Global | `documentation` | Documentation PASS | Documentation PASS | ✅ |
| 14 | Global | `golden_test` | Golden Test PASS | Golden Test PASS | ✅ |
| 15 | High-risk | `human_specialist_review` | Human Specialist Review PASS | Human Specialist Review PASS | ✅ |
| 16 | High-risk | `counterevidence` | Counterevidence PASS | Counterevidence PASS | ✅ |
| 17 | High-risk | `red_team` | Red Team PASS | Red Team PASS | ✅ |
| 18 | High-risk | `independent_judge` | Independent Judge PASS | Independent Judge PASS | ✅ |
| 19 | High-risk | `reversal_criteria` | Reversal Criteria PASS | Reversal Criteria PASS | ✅ |
| 20 | High-risk | `recovery_rollback_rehearsal` | Recovery / Rollback Rehearsal PASS | Recovery / Rollback Rehearsal PASS | ✅ |

順序亦逐一核對一致（Global 14 項與 High-risk 6 項皆採 `gate_catalog` 陣列順序 = Atlas §22.1/§22.2 原順序，非 MP 原本的順序——見 PROPOSED_CHANGE 段落說明兩者順序差異之處，即「Data PASS」在 MP 原文排第 7、聯集清單排第 6）。

## Diff

### Original

Master Plan §158（L5903-5927，逐字）：

````text
# 158. Global Definition of Done

一個功能不能因為「程式可跑」就完成。

必須：

```text
Functional PASS
Security PASS
Privacy PASS
Jurisdiction PASS
Localization PASS
Accessibility PASS
Data PASS
Observability PASS
Rollback PASS
Documentation PASS
Golden Test PASS
```

高風險另加：

```text
Human Specialist Review PASS
```
````

### Proposed

Master Plan §158 改為：

````text
# 158. Global Definition of Done

一個功能不能因為「程式可跑」就完成。

必須：

```text
Functional PASS
Evidence PASS
Reasoning PASS
Security PASS
Privacy PASS
Data PASS
Jurisdiction PASS
Localization PASS
Accessibility PASS
Observability PASS
Capacity PASS
Rollback PASS
Documentation PASS
Golden Test PASS
```

高風險另加：

```text
Human Specialist Review PASS
Counterevidence PASS
Red Team PASS
Independent Judge PASS
Reversal Criteria PASS
Recovery / Rollback Rehearsal PASS
```
````

### Reason

依 `ADR-011` Sub-decision (b) 的子集/超集核對結果：MP 原本 11+1 項全部逐字保留（無刪除、無改名），純粹擴充為 Atlas/EC 三方候選清單的聯集（14 Global + 6 High-risk），因為子集/超集關係代表這不是三方互斥的價值判斷分歧，而是 MP 自己文件裡本來就存在、Atlas/EC 兩份更詳細的文件已各自獨立指出的完整性缺口（Decision Driver #3 fail-closed）。Global 清單順序改採聯集清單（= Atlas §22.1 原順序）而非「MP 原順序 + 插入新項」，因為 ADR-011 裁定的是聯集清單本身（`gate.schema.yaml#/gate_catalog` 已收錄的確切順序），維持 MP 原順序插入新項會製造第 4 份彼此不一致的排列方式，違背 ADR-011 Sub-decision (c) 建立單一權威登記表的目的。
