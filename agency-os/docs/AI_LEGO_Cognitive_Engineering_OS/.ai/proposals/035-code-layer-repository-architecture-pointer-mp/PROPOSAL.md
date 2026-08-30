---
proposal_id: "035"
slug: "code-layer-repository-architecture-pointer-mp"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L3175-3177"]
related_open_questions: []
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "583725234"
---

## PROPOSED_CHANGE

在 Master Plan §80 程式碼目錄開頭（標題 `L3175` 之後、目錄樹 code fence `L3177` 之前）新增一句指標句：「程式碼層現行正本見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`；本清單為 v1 歷史快照。」既有 22 項 `/modules/*` 目錄樹本身不刪除、不改寫，僅降級標註為歷史快照。

## RATIONALE

`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md`（ACCEPTED，2026-08-29）Sub-decision (a) 判定：Module 層（程式碼 bounded-context）目前有兩份不一致的描述——MP §80 的 v1 清單（22 個 `/modules/*` 目錄）與 `REPOSITORY_ARCHITECTURE.md` 已獨立驗證過的 Proposed Directory Tree（9 個合規類目錄移出 `/modules` 改列 `/platform/trust-fabric/*`、`decision`/`artifact` 併入 `/core/domain`、`analytics`+`simulation` 合併為 `data-science` 等，ADR-009:56,75-83）。ADR 拒絕「大改 §80 內容」（成本高、且會與尚未定案的 `REPOSITORY_ARCHITECTURE.md` 產生二次分歧風險），改採 ADR-006(b) 已定案的「路徑移出母規格、母文件只留一句話指標」模式（ADR-009:173）。本提案即是套用 Recommendation 第 4 項的最小編輯集：新增一句指標句，不改動既有 22 項清單本身。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §80 程式碼目錄，開頭（`L3175-3177`）

## DEPENDENCIES

- 依賴 `ADR-009` 已 ACCEPTED（已確認：`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3`）。
- **本提案的全部內容就是把 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 稱為「程式碼層現行正本」。該文件目前 `Status: PROPOSED`，尚未 ACCEPTED**（已核對：`docs/architecture/REPOSITORY_ARCHITECTURE.md:2`，2026-08-30 讀取）。這是本提案五者中對此依賴最敏感的一個：不同於 `032`（該提案的 Module 子句刻意寫成「一旦 ACCEPTED 即生效」的條件句），本提案插入的句子本身是陳述句「現行正本見...」，若 `REPOSITORY_ARCHITECTURE.md` 最終未被採用或內容有重大修改，這句指標句會需要跟著修訂或撤回。ADR-009 已明文承認同一風險：「`REPOSITORY_ARCHITECTURE.md` 本身仍是 PROPOSED 狀態，本 ADR 的 Module 層建議要等它被 ACCEPTED 才真正生效，在那之前 MP §80 仍是唯一可執行的程式碼層描述」（ADR-009:187）。**操作者核准本提案前應明確決定**：是否要等 `REPOSITORY_ARCHITECTURE.md` 先轉為 ACCEPTED 再套用本提案，或接受「指標句先行、目標文件狀態隨後追上」的順序（ADR-009 Migration 段落建議前者：「先確認 `REPOSITORY_ARCHITECTURE.md` 是否/何時轉為 ACCEPTED」，ADR-009:192）。
- 與 `033`（編輯點在 §80 結尾／§81 之前）不重疊、可任意順序套用。

## COMPATIBILITY

不影響任何 schema、policy、recipe 檔案。§80 既有 22 項 `/modules/*` 目錄樹本身不刪除、不改寫，僅在其上方新增一句指標句降級標註——與 Phase 3 之前尚未有任何程式碼消費此清單的現況一致（ADR-009:49，該清單本就是敘事層文件，非機讀 spec）。

## MIGRATION

套用時使用 `Edit` 工具做精確字串插入；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`（若該登記檔存在）。**建議套用前先確認 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 `Status:` 欄位現況**（見 DEPENDENCIES），必要時與操作者確認是否等待其轉為 ACCEPTED。

## ROLLBACK

`git revert` 對應 commit 即可完整移除指標句，還原 §80 標題直接接目錄樹 code fence 的原始結構。純新增文字、無 runtime 副作用，回滾風險 Low，與 ADR-009 Migration/Rollback 段落一致（ADR-009:196）。

## EVIDENCE

- `docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:56,66,173,187,192`（Module 層落點判定、Recommendation 第 4 項原文、REPOSITORY_ARCHITECTURE.md 未 ACCEPTED 的明文承認、Migration 建議順序）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:3173-3178`（§80 現況全文，2026-08-30 直接 Read 核對）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:1-2`（現況 `Status: PROPOSED`，2026-08-30 直接 Read 核對）

## Diff

### Original

`L3173-3178` 逐字：

````text
---

# 80. 程式碼目錄

```text
/apps
````

### Proposed

````text
---

# 80. 程式碼目錄

程式碼層現行正本見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`；本清單為 v1 歷史快照。

```text
/apps
````

### Reason

沿用 ADR-006(b) 已定案的「路徑移出母規格、母文件只留一句話指標」模式（ADR-009:173 明確引用不重新設計），把 §80 的 22 項清單從「唯一敘事」降級為「v1 歷史快照 + 指向現行正本」，避免未來 `REPOSITORY_ARCHITECTURE.md` 被 ACCEPTED 後，兩份文件同時宣稱自己是程式碼層正本。
