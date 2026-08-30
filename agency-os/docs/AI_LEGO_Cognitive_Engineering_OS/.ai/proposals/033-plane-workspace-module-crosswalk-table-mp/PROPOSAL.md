---
proposal_id: "033"
slug: "plane-workspace-module-crosswalk-table-mp"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L419-420", "L3085-3086", "L3297-3299"]
related_open_questions: []
change_class: "duplication removal"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

新增小節 `§80.1`（緊接 §80 程式碼目錄結尾之後、§81 配置路徑之前），收錄 ADR-009 逐字核對出的 12 列 Plane↔Workspace↔Module 跨層對照表；並在 §4 Plane 圖結尾與 §77 Workspace 清單結尾各加一句指標句「跨層命名對照見 §80.1」。三處編輯同屬 ADR-009 Recommendation 第 2 項的單一最小編輯集，故合併為一個提案套用。

## RATIONALE

`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md`（ACCEPTED，2026-08-29）Sub-decision (a) 的核心產出即是這張 12 列對照表（ADR-009:68-84）：12 個 Plane 裡只有 4 個（Human Collaboration / Stakeholder Intelligence / Computation / Knowledge）有真正撐到程式碼層都還存在的完整三層對應，其餘 8 個要嘛從一開始就沒有 Workspace，要嘛 Module 端已被 `REPOSITORY_ARCHITECTURE.md` 判定應搬家或消失（ADR-009:85）。ADR 本身在 Recommendation 明確指定「新增一個小節（建議編號 `§80.1`）收錄...並在 §4 Plane 圖結尾與 §77 Workspace 清單結尾各加一句指標句...（同 ADR-005 對 Atlas 三處序列圖採用的『一句話指向唯一正本』模式）」（ADR-009:171）——這是一個不可拆分的最小編輯集：只加表格而不加指標句，讀者仍找不到表格；只加指標句而不加表格，指標句無所指。故本提案同時套用三處。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

- §4 總體架構，結尾（`L419-420`，插入指標句）
- §77 UI 工作空間，結尾（`L3085-3086`，插入指標句）
- §80 程式碼目錄，結尾／§81 之前（`L3297-3299`，插入新小節 `§80.1`）

## DEPENDENCIES

- 依賴 `ADR-009` 已 ACCEPTED（已確認：`docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:3`）。
- **對照表右側兩欄（「Module 現況」欄）引用 `docs/architecture/REPOSITORY_ARCHITECTURE.md` 的 Proposed Directory Tree 與 Bounded Context Analysis 結論（RA:56-68,90,104-142,181,209-218,220-233 等）。該文件目前 `Status: PROPOSED`，尚未 ACCEPTED**（已核對：`docs/architecture/REPOSITORY_ARCHITECTURE.md:2`，2026-08-30 讀取）。這代表本提案插入的表格右側兩欄描述的是「一旦 `REPOSITORY_ARCHITECTURE.md` 被採用後」的目標狀態，不是目前唯一可執行的程式碼層事實——ADR-009 已明文承認此點（ADR-009:66,187,192）。操作者核准本提案前應知悉：表格本身逐字忠實轉錄 ADR-009 已核對過的內容，不因 `REPOSITORY_ARCHITECTURE.md` 未 ACCEPTED 而需要修改文字，但應理解該表格的「現況」欄實質上是「提案中的現況」。
- 若 `032-plane-workspace-module-relationship-mp` 已先套用，本提案在 §4 結尾插入的指標句應接在 `032` 新增段落之後、`---` 分隔線之前；若 `032` 尚未套用，本提案的指標句可直接接在 `L419`（原 Trust Fabric 句後空行）之後、`L420` 分隔線之前，不會出錯，僅閱讀順序上少一段定義先行（見 `032` DEPENDENCIES 對稱說明）。
- 與 `035-code-layer-repository-architecture-pointer-mp`（同樣鄰接 §80，但編輯點在 §80 開頭 `L3175` 附近）不重疊、可任意順序套用。

## COMPATIBILITY

不影響任何 schema、policy、recipe 檔案——純新增文件小節與指標句，不刪除或改寫 §4/§77/§80 既有內容（§80 原始 22 項 `/modules/*` 清單保留為 v1 歷史快照，本提案不觸碰該清單本身，僅在其後追加新小節）。

## MIGRATION

套用時使用 `Edit` 工具做三處精確字串插入；套用後重新計算 Master Plan sha256 並更新 `.ai/research/phase-0/document-hashes.yaml`（若該登記檔存在）。建議套用順序：先 `032`（若一併套用），再本提案，最後 `034`/`035`（各自獨立、不互相依賴）。

## ROLLBACK

`git revert` 對應 commit 即可完整移除三處新增內容，還原 §4/§77/§80 原始結尾。純新增文字、無 runtime 副作用，回滾風險 Low，與 ADR-009 Migration/Rollback 段落一致（ADR-009:196）。

## EVIDENCE

- `docs/adr/ADR-009-nomenclature-and-directory-canonicalization.md:68-85,171`（12 列對照表原文、誠實結論、Recommendation 第 2 項）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:361-420,3051-3087,3175-3301`（§4/§77/§80 現況全文，2026-08-30 直接 Read 核對）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md:1-2,20-90,104-142,171-233`（現況 `Status: PROPOSED`；對照表右欄引用的 Bounded Context Analysis 與 Proposed Directory Tree 段落，2026-08-30 直接 Read 核對）

## Diff

### Original

N/A — this is an insertion (three separate insertion points), not a replacement.

插入點 1（§4 結尾，`L418-420` 逐字現況）：

```text
任何 Capability 在執行前都必須先通過 Trust Fabric。
(L418)

(L419，空行)
---
(L420，分隔線)
```

插入點 2（§77 結尾，`L3085-3087` 逐字現況）：

```text
多專家、多政府、多地方辯論。
(L3085)

(L3086，空行)
---
(L3087，分隔線)
```

插入點 3（§80 結尾／§81 之前，`L3296-3301` 逐字現況）：

````text
    /stakeholders
(L3296)
```
(L3297，§80 code fence 收尾)

(L3298，空行)
---
(L3299，分隔線)

(L3300，空行)
# 81. 配置路徑
(L3301)
````

### Proposed

插入點 1（§4 結尾）——在 `L419`／`L420` 之間（或緊接 `032` 新增段落之後）插入：

```text
跨層命名對照見 §80.1。
```

插入點 2（§77 結尾）——在 `L3085`／`L3086` 之間插入：

```text
跨層命名對照見 §80.1。
```

插入點 3（§80 結尾，新增 `§80.1` 小節，插在既有 `L3298-3299` 分隔線之後、`L3301` 「# 81. 配置路徑」之前）：

```text
## 80.1 Plane / Workspace / Module 跨層命名對照

（ADR-009 Sub-decision (a) 核心產出，逐一核對非猜測）

| Plane（§4） | Workspace（§77） | Module — §80 原始清單 | Module 現況（`REPOSITORY_ARCHITECTURE.md` 驗證後） | 對應程度 |
|---|---|---|---|---|
| EXPERIENCE PLANE | 無單一對應（Workspace 全體都是 Experience Plane 內部細分） | 無 | `/apps`（非 `/modules`） | 容器關係，非同層對應 |
| HUMAN COLLABORATION PLANE | Canvas | canvas, brainstorm | 兩者保留為 vertical | 完整三層對應 |
| STAKEHOLDER INTELLIGENCE PLANE | Intelligence Council（非正式六大之一） | stakeholders | 保留為 vertical | 對應，但 Workspace 端本身非正式項目 |
| GLOBAL JURISDICTION & COMPLIANCE PLANE | 無對應 Workspace | jurisdiction, compliance, privacy, localization, accessibility, trade, tax, legal, standards（9 項） | 全部移出 `/modules`，改列 `/platform/trust-fabric/*`——強制關卡，非使用者可選功能 | 無 Workspace；Module 定位本身被 RA 推翻 |
| DECISION PLANE | Decision Room | decision, optimization | decision 應移除併入 `/core/domain/decision`；optimization 拆為業務包裝與求解器兩處 | Workspace 對應；Module 端已知需修正 |
| COMPUTATION PLANE（§27 又稱「Data Science Plane」，非 §4 正式名） | Data Lab（§28 亦稱 Data Lab） | analytics, simulation | 合併為 `/modules/data-science/*` | 完整對應，但六站點四種拼法 |
| COGNITIVE PLANE | 無對應 Workspace | 無 | 屬於 `/cognitive/*` 頂層命名空間，不在 `/modules` 下 | 無 Workspace 亦無 Module |
| KNOWLEDGE PLANE | Knowledge | knowledge | 保留為 engine，schema 移至 `/core/domain/knowledge` | 完整三層對應 |
| ARTIFACT PLANE | Artifact Studio | artifact, authorship | artifact 應移除併入 `/core/domain/artifact`；authorship 保留 | Workspace 對應；Module 端部分已知需修正 |
| CONTROL PLANE | Workflow Lab（僅覆蓋「LEGO 組裝」，Policy/Identity/Version/Consent 無對應） | 無 | Workflow/Policy/Identity 為 Shared Kernel（`/core/domain/*`）；Workflow engine 在 `/platform/workflow` | 僅部分 Workspace 對應，無 Module |
| DATA PLANE | 無對應 Workspace | 無 | 對應頂層 `/data` | 無 Workspace 亦無 Module |
| PLATFORM PLANE | 無對應 Workspace | 無 | 對應頂層 `/platform`、`/security` | 無 Workspace 亦無 Module |

**誠實結論**：12 個 Plane 裡，只有 4 個（Human Collaboration / Stakeholder Intelligence / Computation / Knowledge）有真正撐到程式碼層都還存在的完整三層對應；其餘 8 個要嘛從一開始就沒有 Workspace（因為使用者不該直接操作），要嘛 Module 端已經被 `REPOSITORY_ARCHITECTURE.md` 驗證後判定應該搬家或消失（併入 kernel/platform）。
```

### Reason

補上 ADR-009 P1-DUP-2 的核心產出——沒有這張表，§4/§77/§80 的指標句無所指；沒有指標句，表格無人發現。逐字轉錄 ADR-009 已定案的對照表（ADR-009:70-85），欄位標題改用相對章節號（「§4」「§77」「§80」）取代 ADR 原文的「MP §4」等寫法，因為套用後這張表本身就活在 Master Plan 裡，不需要再前綴文件名；表格內容與判定不變。
