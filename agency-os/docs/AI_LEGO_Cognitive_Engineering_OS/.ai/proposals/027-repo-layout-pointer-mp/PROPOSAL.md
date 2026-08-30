---
proposal_id: "027"
slug: "repo-layout-pointer-mp"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L610-620", "L764-783", "L842-851", "L1004-1014"]
related_open_questions: ["OQ-11"]
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Replace the four "確切路徑" (exact-path) fenced code blocks in the Master Plan — §7 AI Gateway (L610-620), §8.5 Method-definition dedup rule (L764-783), §9 Workflow IR & Recipe Engine (L842-851), and §12.2 Authorship tracking files (L1004-1014) — with a narrative-only principle statement plus a pointer to `docs/architecture/REPOSITORY_ARCHITECTURE.md`. No literal repo directory paths remain in any of the four sites after this change; the capability/responsibility narrative around each site is preserved unchanged.

## RATIONALE

`docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md`（ACCEPTED 2026-08-29）Sub-decision (b) 裁決「折衷方案」：母規格只保留「有一個 machine-readable 分層」的敘事級原則，具體路徑字串（含逐檔名列表）全部移到 Phase-4-owned 的獨立 `repo-layout` spec。ADR 原文 Context 段落的站點表格列了四個 Master Plan 站點（L611-616 / L766-773 / L845 附近 / L1002-1008），但這些是 Codex/Claude grep 逐條驗證時的**近似行號**（抓到路徑字串所在行，非完整區塊邊界）。本提案直接 Read 四個站點確認實際完整區塊：

- §7 站點的完整區塊是 L610-620（含「確切路徑：」標籤行與完整 fence），比 ADR 引用的 L611-616 多出 `/budgets/`、`/evaluation/` 兩行。
- §8.5 站點的完整區塊是 L764-783，比 ADR 引用的 L766-773 多出 `/methods/`（registry/contracts/versions）與 `/compiler/`（method-selector/compatibility/mandatory-gates）兩個子樹——ADR 引用只抓到 `/specs/cognitive/` 那一段。
- §9 站點的完整區塊是 L842-851，與 ADR「~L845 附近」一致，僅補足完整邊界。
- §12.2 站點的完整區塊是 L1004-1014（標題行「## 12.2 確切路徑」到 fence 結尾），比 ADR 引用的 L1002-1008 更完整——L1002 實際上是**前一個不相關區塊**（§12.1 記錄內容來源）的 fence 結尾，不屬於本站點；且 ADR 引用的 L1008 只到 `contribution-map.json`，漏了 `human-edits.json`／`ai-assistance.json`／`source-provenance.json`／`citation-validation.json`／`version-history.json` 六筆中的後五筆。

四個站點的共同問題與 ADR §(b) 判斷一致：實作級目錄名稱（如 `/ai/providers/`、`/specs/cognitive/method.schema.yaml`、`/authorship/human-edits.json`）的變化速率遠快於 30 年壽命的憲法文件，鎖在 Master Plan 裡會導致「改一個目錄名 = 改憲法文件三份之一」的高成本，且與 directive §X「machine-readable 內容逐步移至 /specs/ /policies/ /methods/ /recipes/」的既有原則本就衝突（路徑字串本身也是該原則所指的「machine-readable 內容」）。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §7 AI Gateway（L610-620，「確切路徑：」區塊）
- §8.5 Method 定義禁止在 Master Plan 雙重維護（L764-783，「確切路徑：」區塊）
- §9 Workflow IR 與 Recipe Engine（L842-851，「確切路徑：」區塊）
- §12.2 確切路徑（L1004-1014，含標題行）

## DEPENDENCIES

- 依賴 ADR-006（ACCEPTED 2026-08-29）Sub-decision (b) 的折衷方案裁決；本提案是該裁決 Migration 段「逐一針對各站點開 proposal，`change_class: boundary_clarification`，對照原文字換成『見 repo-layout spec』的引用句」的具體實作（本提案將 Master Plan 的四個站點合併為一份提案，非逐站各開一份——與 ADR Migration 段字面上「逐一各開一個 proposal」不同；此為任務指派時的明確安排，理由是四站點同屬一份文件、同一種修改樣式，合併審閱成本更低，且仍保留「一站點一 Original/Proposed/Reason 子區塊」的可回溯粒度）。
- **`docs/architecture/REPOSITORY_ARCHITECTURE.md`（本提案的指標目標）目前 `Status: PROPOSED`，尚未被 ratify 為正式 SSOT**——該檔案自己的標頭也明確聲明：三母文件現有路徑「一律視為草稿訊號」，其內容本身仍待驗證，且下一步（落地為 `.ai/research/phase-2/repo-layout-draft.yaml`）尚未執行。操作者核准本提案前應知悉：核准後 Master Plan 會指向一份**尚未定案**的規格文件，這是 ADR-006 §(b) 已預期且接受的過渡狀態（「不留空白，先落地草稿，供 Phase 4 引用/修正/推翻」），但仍是一個懸而未決的依賴，不是「指向一份已批准的正本」。
- 應與 `028-repo-layout-pointer-ec` 同批次審閱（兩者是同一 ADR-006 §(b) 裁決在 Master Plan 與 Execution Contract 兩份文件上的對應實作），但兩者改動的是不同檔案，互不重疊，可獨立套用。

## COMPATIBILITY

不影響任何既有 schema、policy、recipe 或程式碼——四個站點列出的路徑目前均未被任何 Phase 2/3 程式碼實際引用（Phase 4 才是 repo-layout 的正式擁有者，尚未開始）。移除後不產生 dangling reference：四段敘事原本描述的「這裡有一組職責/檔案分類」保留不變，只是不再用具體路徑字串鎖定，改用指標句。

## MIGRATION

套用時對四個站點分別使用 `Edit` 工具做精確字串替換（禁止 `sed`/裸 patch），逐站替換、逐站確認周邊文字未被誤傷；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml` 的 `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md` 條目。

## ROLLBACK

`git revert` 對應 commit 即可完整還原四個站點的原始逐字路徑列表。因 Phase 4 尚未建立、無程式碼消費這些路徑字串，回滾零下游風險；四站合併於同一 commit，回滾為單一動作即可還原全部四處（若操作者僅想回滾其中一站，需手動局部還原，本提案不提供逐站獨立 commit 顆粒度——已在 DEPENDENCIES 段說明此為任務指派的明確安排）。

## EVIDENCE

- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md`（全文，尤其 Context (b) 站點表格、Sub-decision (b) 折衷方案、Recommendation 第 2 點、Migration (b) 段）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md`（L1-9，確認 `Status: PROPOSED` 與過渡處置敘述）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源）
- 本次調查直接 Read 四站點確認的實際行號邊界（見 RATIONALE 段逐站說明），比 ADR 原表格的 grep 近似行號更完整。

## Diff

### Original — 站點 1：§7 AI Gateway（L610-620）

```
確切路徑：

```text
/ai/
    /gateway/
    /providers/
    /models/
    /routing/
    /budgets/
    /evaluation/
```
```

### Proposed — 站點 1

```
AI Gateway 的實作子模組（Provider Abstraction、Model Routing、Budget、Evaluation 等，見上方職責清單）的實際目錄切分方式由 repo-layout spec 決定，本文件不鎖定路徑字串。目錄結構見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（Phase-4-owned repo-layout spec；過渡期草稿落點 `.ai/research/phase-2/repo-layout-draft.yaml`，標記 `status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 1

AI Gateway 應具備的職責（Model Routing / Provider Abstraction / Fallback / Cost Routing 等 12 項，本節上文已列）是架構層敘事，屬於 Master Plan 應保留的內容；其後方逐目錄列出的「確切路徑」則是實作細節，依 ADR-006 §(b) 折衷方案應移出，改用指標句。

---

### Original — 站點 2：§8.5 Method 定義禁止在 Master Plan 雙重維護（L764-783）

```
確切路徑：

```text
/specs/cognitive/
    primitive.schema.yaml
    method.schema.yaml
    lens.schema.yaml
    representation.schema.yaml
    recipe.schema.yaml

/methods/
    registry/
    contracts/
    versions/

/compiler/
    method-selector/
    compatibility/
    mandatory-gates/
```
```

### Proposed — 站點 2

```
Method 的機讀規格（primitive/method/lens/representation/recipe schema）、registry/contracts/versions 的版本化登記、以及 method-selector/compatibility/mandatory-gates 的編譯邏輯，三者的實際目錄佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 2

本節主旨本身就是「Method 定義禁止在 Master Plan 雙重維護，AI 必須到 Atlas / machine-readable method specs 讀取」——緊接著卻列出這些 spec 檔案的逐字檔名與目錄，等於在同一節內自我違反其主旨（把本該只活在別處的實作細節又鎖進 Master Plan）。移除後與本節既有原則內部一致，且與 ADR-006 §(b)「這不是外加規則，而是 directive §X 本來就已經寫的原則的自我套用」的論證一致。

---

### Original — 站點 3：§9 Workflow IR 與 Recipe Engine（L842-851）

```
確切路徑：

```text
/workflows/
    /ir/
    /compiler/
    /recipes/
    /validation/
    /runtime/
```
```

### Proposed — 站點 3

```
Workflow Intermediate Representation、Compiler、Recipe、Validation、Runtime 五個子系統彼此邊界清楚、可獨立替換（見上方「UI 可換 / Workflow Engine 可換 / AI 模型可換」預期結果），實際目錄佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。
```

### Reason — 站點 3

Workflow IR 的分層原則（IR/Compiler/Recipe/Validation/Runtime 五個關注點分離）是有效的架構敘事，值得保留；逐目錄路徑字串則是實作細節，依 ADR-006 §(b) 移出。

---

### Original — 站點 4：§12.2 確切路徑（L1004-1014）

```
## 12.2 確切路徑

```text
/authorship/
    contribution-map.json
    human-edits.json
    ai-assistance.json
    source-provenance.json
    citation-validation.json
    version-history.json
```
```

### Proposed — 站點 4

```
## 12.2 追蹤檔案分類

Authorship & Integrity Plane 須維護六類追蹤資料：貢獻地圖（contribution map）、人工編輯紀錄、AI 輔助紀錄、來源溯源、引用驗證、版本歷史。實際檔案佈局由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 4

六類追蹤資料本身（貢獻地圖/人工編輯/AI輔助/來源溯源/引用驗證/版本歷史）是 Authorship & Integrity Plane 的核心不變量，必須保留在 Master Plan；但六個檔名（`contribution-map.json` 等）與副檔名慣例是實作細節，依 ADR-006 §(b) 移出改用指標句，同時把小節標題從「確切路徑」改為「追蹤檔案分類」以反映內容性質的轉變（敘事原則，非路徑列表）。
