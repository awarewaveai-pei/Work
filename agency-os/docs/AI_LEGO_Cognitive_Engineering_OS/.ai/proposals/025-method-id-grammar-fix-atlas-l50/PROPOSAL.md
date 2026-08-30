---
proposal_id: "025"
slug: "method-id-grammar-fix-atlas-l50"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L50"]
related_open_questions: ["OQ-12"]
change_class: "semantic correction"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Method Atlas「必要設定維持英文」規範的範例區塊中，Machine-facing identifier 範例（L50）從 `method.association.mind_map` 改為 `association.mind_map`，拿掉 `method.` 前綴。

## RATIONALE

`docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (b) 逐一核對 Method 機器可讀 ID 在三母文件出現的 7 處後發現：`method.<family>.<name>` / `<family>.<name>` / `method.<name>.v<N>` 三套文法並存，任一單一文法都無法把全部既有 ID resolve 成功，registry 實作前必須先有唯一文法（Codex cross-review CDX-4 獨立驗證同一結論）。

關鍵發現：7 處出現中，5 處（Atlas §9 LEGO Contract `id: root_cause.fishbone`、Master Plan §8.4 `execute_method(root_cause.fishbone)` / `execute_method(strategy.swot)`、Master Plan §9 Workflow IR `method_id: research.thematic_analysis` / `method_id: evidence.triangulation`）已經是 `<family>.<name>` bare 形式；只有 2 處（本提案的 L50，與另一份提案處理的 Atlas L4256-4258）用了 `method.` 前綴，且這 2 處都是敘述性/教學範例，不是任何一份文件裡真正拿來當 schema 用的定義——Atlas §9 LEGO Contract 才是真正的機讀契約，它自己用的就是 bare 形式（`id: root_cause.fishbone` / `family: root_cause` 為兩個獨立欄位）。Master Plan 的 Workflow IR 在每個 method node 外層本來就有 `type: method` 欄位在做型別區分，ID 本身若再重複帶「method.」前綴，屬於重複標記型別。

ADR-005 因此選擇 **Option B（統一為 `<family>.<name>` 無前綴形式）**：只需改動 L50 與 L4256-58 這兩處本來就有誤的敘述性範例，不動任何一處已經在真正 schema/IR 裡使用的正確寫法（Migration 成本最低），且與現況（Atlas §9 機讀契約 + Master Plan 全部 Workflow IR 用法）完全一致（Correctness 最佳）。本提案是該裁決在 L50 這一個站點的具體落地。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

「中文優先與必要設定英文保留規範」→「必要設定維持英文」範例區塊（L43-59 的 `text` fenced block 內，本提案僅動 L50 一行）

## DEPENDENCIES

與 `026-method-id-grammar-fix-atlas-l4256`（同一份 ADR Sub-decision (b) 的另一個站點）修改不同行區間，互不重疊，可獨立套用，無先後順序要求。與 `023`/`024`（DB Migration Recipe 提案）分屬 ADR-005 兩個獨立子決定，互不依賴。

## COMPATIBILITY

純敘述性教學範例文字替換，不影響 Atlas §9 LEGO Contract 既有的機讀 schema 定義（`id: root_cause.fishbone` 等不動），也不影響 Master Plan 任何既有用法（ADR-005 Recommendation 第 2 條明文：「Master Plan 全部既有用法不需改動」）。此範例本身用途是展示「Machine-facing identifier」長相，改為 bare 形式後與其緊接在後的另一組範例（L52-59，`reversal_conditions` schema 片段）風格一致，不影響本節其餘規則說明文字。

## MIGRATION

`Edit` 工具以 L50 現有逐字內容 `method.association.mind_map` 為錨定字串，搭配 L49 的 `Machine-facing identifier:` 上下文做精確字串替換，避免誤配文件內其他相同字串；套用後重算 Atlas sha256。

## ROLLBACK

三母文件在 git 有 hash-anchored baseline，`git revert` 對應 commit 即可完整還原，風險等級 Low（純文件變更，無 runtime 副作用）。

## EVIDENCE

- `docs/adr/ADR-005-db-migration-recipe-and-method-id-grammar.md` Sub-decision (b)（L119-154 完整證據表、Option A/B/C 比較矩陣）與 Recommendation 第 2 條（L166）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:50`（本提案修改對象，現況逐字已於下方 Diff 引用）
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:989-991`（Atlas §9 LEGO Contract，唯一的正式機讀 schema 定義，已是 bare 形式，佐證本提案不需改動此處）
- `.ai/research/phase-0/open-questions.yaml` OQ-12（status: RESOLVED_BY_HUMAN，`proposed_adr` 指向 ADR-005）
- `.ai/research/cross-review/CODEX_REVIEW.md` CDX-4（獨立交叉驗證，與 ADR-005 核對結果一致）

## Diff

### Original

Method Atlas L50（逐字）：

```text
method.association.mind_map
```

### Proposed

```text
association.mind_map
```

### Reason

拿掉 `method.` 前綴，改為 ADR-005 Sub-decision (b) 選定的 `<family>.<name>` bare 形式（family=`association`，name=`mind_map`）。此範例緊接在 L46-47「Human-facing display: 心智圖（Mind Map）」之後，作為對照展示「同一個概念的機器可讀識別碼長相」——修正後與 Atlas §9 LEGO Contract 唯一的正式機讀 schema 定義（`id: root_cause.fishbone`）用法一致，消除三套文法並存的歧義來源之一。
