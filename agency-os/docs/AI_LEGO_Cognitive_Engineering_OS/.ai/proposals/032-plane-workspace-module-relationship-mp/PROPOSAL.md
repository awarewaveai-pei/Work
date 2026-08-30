---
proposal_id: "032"
slug: "plane-workspace-module-relationship-mp"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L419-420"]
related_open_questions: []
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

在 Master Plan §4 總體架構結尾（`L419` Trust Fabric 句之後、`L420` 分隔線 `---` 之前）插入一段新文字，明確定義 Plane（§4）／Workspace（§77）／Module（§80）是三個不同抽象層，不是同一分解的三種別名。目前 §4/§77/§80 三處從未有一句話說明彼此關係，讀者只能自行拼湊。

## RATIONALE

`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md`（ACCEPTED，2026-08-29）Sub-decision (a) 逐字核對 §4（12 個 Plane）、§77（6 個正式 Workspace）、§80（22 個 `/modules/*` 目錄）後發現：同一個「用可信任計算做資料科學」的能力，六個站點出現四種拼法（`COMPUTATION PLANE` / `Data Science Plane` / `Data Lab` / `analytics` / 未來的 `data-science`），且沒有一處寫「這些是同一件事」（ADR-009:48）。ADR 拒絕 Option (i)「挑一詞統一」，因為三層是三個變動頻率、讀者都不同的真實抽象層（架構宣告 / UI-IA / 程式碼 bounded-context），硬壓成一詞會製造假耦合或拉回未驗證的敘事層（ADR-009:52-58）。採用的 Option (ii) 要求三層各自維持正本並補一句定義（ADR-009:60-66,170）。本提案即是套用 Recommendation 第 1 項的最小編輯集，純新增不刪除既有內容。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §4 總體架構，結尾（`L419-420`）

## DEPENDENCIES

- 依賴 `ADR-009` 已 ACCEPTED（已確認：`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3` `Status: ACCEPTED，2026-08-29`）。
- 插入段落中 Module 一項提及 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 為「程式碼層現行目標正本」。**該文件目前 `Status: PROPOSED`，尚未 ACCEPTED**（已核對：`docs/architecture/REPOSITORY_ARCHITECTURE.md:2`，2026-08-30 讀取）。ADR-009 本身已多處明文承認這個前提（ADR-009:3,66,192）：Module 落點建議「待其 ACCEPTED 後生效」，在此之前 MP §80 仍是唯一可執行的程式碼層描述（ADR-009:187）。本提案插入的句子已刻意寫成「一旦該文件被 ACCEPTED 即生效」的條件句，故不因 `REPOSITORY_ARCHITECTURE.md` 尚未 ACCEPTED 而失真；操作者核准本提案前應知悉此依賴狀態，不代表本提案本身需要等待。
- 建議與 `033-plane-workspace-module-crosswalk-table-mp` 同批次或先於其套用：`033` 會在同一個插入點（§4 結尾、`---` 之前）追加一句「跨層命名對照見 §80.1」指標句，該句在語意上緊接本提案新增的定義段落之後。若操作者只套用 `033` 而不套用本提案，`033` 的指標句仍可獨立插在 `L419` 之後、`L420` 之前，不會出錯，但閱讀順序會少一段定義先行。

## COMPATIBILITY

不影響任何 schema、policy、recipe 檔案——這段文字是給人類/AI 閱讀的架構說明，非機讀資料。不影響任何已批准 ADR 的結論，純新增段落，不刪除或改寫 §4 既有的 Plane 圖與 Trust Fabric 清單。

## MIGRATION

套用時使用 `Edit` 工具做精確字串插入（在 `L419` 句尾與 `L420` 分隔線之間插入新段落），不使用 `sed` 等可能誤傷周邊內容的工具；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`（若該登記檔存在）。建議與 `033` 同批次套用（見 DEPENDENCIES）。

## ROLLBACK

`git revert` 對應 commit 即可完整移除插入段落，還原成 §4 原始結尾（`L419` 句子直接接 `L420` 分隔線）。純新增文字、無 runtime 副作用，回滾風險 Low，與 ADR-009 Migration/Rollback 段落一致（ADR-009:196）。

## EVIDENCE

- `docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3,25-98,166-173,187`（Sub-decision (a) 全段、Option (ii) 定義、Recommendation 第 1 項、Consequences 對 REPOSITORY_ARCHITECTURE.md 尚未 ACCEPTED 的明文承認）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:361-420`（§4 現況全文，2026-08-30 直接 Read 核對）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:1-2`（現況 `Status: PROPOSED`，2026-08-30 直接 Read 核對）

## Diff

### Original

N/A — this is an insertion, not a replacement. 現有 `L416-420` 逐字現況（插入點在 `L419` 空行之後、`L420` 分隔線之前；`L406-416` 的 Trust Fabric code fence 全文已列於本檔 EVIDENCE 引用範圍，此處僅取插入點鄰近的 `L416-420` 供比對，逐字含 code fence 收尾符號）：

````text
```
(L416，Trust Fabric code fence 收尾)

任何 Capability 在執行前都必須先通過 Trust Fabric。
(L418)

(L419，空行)
---
(L420，分隔線)
````

### Proposed

在 `L419` 空行與 `L420` 分隔線之間插入以下新段落（`L418` 句子與 `L420` 分隔線本身不變）：

````text
```
(L416，Trust Fabric code fence 收尾，不變)

任何 Capability 在執行前都必須先通過 Trust Fabric。
(L418，不變)

（新增段落開始）
**Plane / Workspace / Module 三層關係**（ADR-009 Sub-decision (a)，2026-08-29 ACCEPTED）：本文件用三個不同抽象層描述同一套系統，三者不是同義詞，不可互相取代：

- **Plane**（本節 §4 為唯一正本，內容不需要改）＝架構／信任邊界宣告層，變動頻率最低，不隨 UI 文案或程式碼重構變動。
- **Workspace**（§77 為唯一正本）＝ Experience Plane 內部對「人類可見功能」的二次分解，是 Plane 的子集（只有 6 個 Plane 有對應 Workspace），不是與 Plane 平行的另一套系統分解。
- **Module**（§80 為 v1 歷史快照；`docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 Proposed Directory Tree 為程式碼層現行目標正本，一旦該文件被 ACCEPTED 即生效）＝程式碼 bounded-context 層，變動頻率最高。
（新增段落結束）

---
(L420，分隔線，不變，套用後行號順移)
````

### Reason

補齊 §4/§77/§80 三處從未說明彼此關係的缺口（ADR-009 P1-DUP-2 根因），逐字採用 ADR-009 Option (ii) 已定案的三層定義（ADR-009:64-66），不是本提案的新裁決；純新增段落，不改動既有 Plane 圖內容。
