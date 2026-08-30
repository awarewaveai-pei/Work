---
proposal_id: "031"
slug: "financial-assumptions-blocked-callout-mp"
status: HUMAN_REVIEW
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L2171-2173"]
related_open_questions: []
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Master Plan §43 Business Planning Mode 的 Recipe 程式碼區塊結束後（L2171 收尾 ```` ``` ````）、章節分隔線之前（L2173 ` --- `），插入第二個 callout blockquote，明確標示 Recipe 中的 `Financial Assumptions` 節點目前會觸發 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`——因為其對應的 Atlas Finance Domain Pack（`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3901`）目前僅有目錄宣告、無任何方法內容。**不**改動 Recipe 本身的節點名稱、順序或箭頭串接（`Source → … → Financial Assumptions → Scenario → …` 原樣保留），**不**在任何母文件或 Atlas 新增/新建 finance 方法內容、stub 或 domain pack 內容。

## RATIONALE

ADR-008（`status: ACCEPTED`）認定 Master Plan §43 目前存在一個已登記的自我矛盾（P1-CONFLICT-4）：

- Recipe 逐字列出 17 個節點，其中 `Financial Assumptions`（MP:2160）是**唯一**一個對應到「Atlas 僅目錄宣告、零方法內容」的節點（ADR-008 已用 Grep 逐一核對其餘 16 個節點：SWOT/PESTEL/Porter/STP/Business Model/Scenario/KPI 等在 Atlas 皆有真實內容，見 ADR-008 Context 段對照表）。
- Master Plan 自己的 §Method Resolution Rule（MP:43-49，Statement B）明文規定：「若 Atlas 無法讀取、版本未知、內容不完整……狀態必須為：`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`。不得自行補齊、猜測或以模型記憶取代 Atlas。」
- 兩者疊加的結果：今日若真的驅動這條 Recipe 走到 `Financial Assumptions` 節點，依文件自己的規則就該立即 BLOCKED，但 §43 敘述這條 Recipe 時完全沒有標注這一點——讀者（人類或 AI）唯一能發現此缺口的方式是自己去 Grep Atlas 全文。`MACHINE_READABLE_SPEC_PLAN.md:277`（MRSP-2）已點名這會「損害對 MP §43 旗艦範例的信任」。

ADR-008 Options Considered 比較了三個方案：(a) 加註現況警語、(b) 現在就設計 Financial Assumptions 方法 stub、(c) 從 Recipe 移除該節點。ADR-008 Recommendation **明確排除 (b) 與 (c)**：

> 「不採用 (b)（現在設計 stub）與 (c)（移除節點）。」（ADR-008:73）

排除 (b) 的理由（ADR-008 Decision Driver 2、4；Options 表 Correctness/與「不做超前工程」原則一致性列）：`MACHINE_READABLE_SPEC_PLAN.md:244` 已明確排除「不知道哪條切片會被驗證就搶著補方法內容」的方案；Business Planning Mode 現在連 MVP 候選都不是（`MVP_VERTICAL_SLICE_PLAN.md:36` 選定 Research Mode）；且若真要補方法內容也不該寫進 Master Plan 本體（`MP:51-58` §0.0.1 文件職責分離）。排除 (c) 的理由（ADR-008 Decision Driver 6；Options 表 30-year 敘事完整性列）：`Financial Assumptions` 是 Atlas §25 已排入 Phase 4 的合理未來階段，非文件寫錯，直接刪除會讓 Recipe 失去「這裡本來規劃要有財務假設」的敘事完整性，代價比誠實加註更大且更不可逆。

因此本提案僅套用 (a)：在母文件層級加註現況警語，不新增、不設計、不虛構任何 finance 方法或 domain pack 內容，完全比照 §43 既有 `Method Resolution Rule` callout 的呈現風格（MP:2127-2133）。`change_class` 依 ADR-008 Recommendation 段原文建議為 `missing_contract`（ADR-008:91），惟本提案依任務指派之欄位值填 `boundary clarification`——語意上兩者描述的是同一件事（母文件對「方法契約尚未存在」這個邊界誠實加註，而非新增契約內容），差異僅在 `change_class` 值域用字選擇，不影響本提案的實際 diff 內容或範圍。

## SOURCE_DOCUMENT

`docs/adr/ADR-008-business-planning-recipe-method-gap.md`（Status: ACCEPTED，2026-08-29）—— Recommendation 段（ADR-008:71-93），加註內容逐字取自 ADR-008:77-89。

## AFFECTED_SECTIONS

- Master Plan §43 Business Planning Mode（`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2125-2173`）：Recipe 程式碼區塊收尾（L2171）與章節分隔線（L2173）之間插入新 callout。
- 不影響 §43 其餘內容（含既有 `Method Resolution Rule` callout，MP:2127-2133）、不影響 §44 Business Strategy Mode（ADR-008 範圍界定段明確排除 §44）。

## DEPENDENCIES

- 依 ADR-008 Migration 步驟 1：本提案須待 ADR-006（`.ai/proposals/` 機制本身）已被操作者批准後才能正式送審——本提案的建立即假設該前提已成立（`.ai/proposals/` 目錄已存在且已有 4 筆先例，見本次任務核對）。
- 不依賴、不觸碰 `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`、`methods/registry/contract-backlog.yaml`（ADR-008 Migration 步驟 4 提到的後續銜接項目，屬於本提案範圍外的獨立工作，本提案不代為建立）。
- 與本批次其他提案（若有）不重疊此行區間，無套用順序依賴。

## COMPATIBILITY

純文件加註，不修改 Recipe 節點名稱、順序或箭頭串接（L2137-2171 程式碼區塊本體逐字不動），不修改既有 `Method Resolution Rule` callout（MP:2127-2133），不修改任何 schema、YAML 或供工具解析的結構化內容。對任何既有讀取/解析此章節的邏輯是純增量、非破壞性變更——程式碼區塊的 fence 邊界與內容維持原樣，只在 fence 結束後、`---` 分隔線前新增一段 Markdown blockquote。

## MIGRATION

操作者核准後，用 `Edit` 工具以下方 Diff 段落的 Original → Proposed 精確字串替換，單一 commit 套用。套用完成後（依 ADR-008 Migration 步驟 3，屬後續步驟、非本提案本身的 diff 範圍）：`.ai/research/phase-1/CONFLICT_REGISTER.yaml` 的 P1-CONFLICT-4 應更新為 `RESOLVED_BY_HUMAN`，附本 ADR 編號與生效 commit。

## ROLLBACK

純文件加註、無 runtime 或 schema 耦合，`git revert` 對應 commit 即可完整還原（風險等級 Low，同 ADR-008 Rollback 段）。若未來 Atlas finance domain pack 補齊、節點恢復端到端可執行，應另開新提案更新或移除本 callout，不直接盲改母文件。

## EVIDENCE

- `docs/adr/ADR-008-business-planning-recipe-method-gap.md:71-93`（Recommendation，含逐字加註內容 :77-89）
- `docs/adr/ADR-008-business-planning-recipe-method-gap.md:11-12`（Statement A/B，Recipe 列表與 Method Resolution Rule 規則原文）
- `docs/adr/ADR-008-business-planning-recipe-method-gap.md:59-67`（Options Considered 比較表，(b)/(c) 排除理由）
- `docs/adr/ADR-008-business-planning-recipe-method-gap.md:101-109`（Migration / Rollback 段）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2125-2173`（§43 全段，本次任務逐行讀取以確認插入點）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:43-49`（§Method Resolution Rule，callout 文字內部引用的行號依據）
- `target_baseline_hash` 已用 `sha256sum` 對本機檔案實測核對，與本提案 frontmatter 填值一致（REALTEST：`sha256sum AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md` → `8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10`）。

## Diff

### Original

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2171-2173`（逐字）：

`````text
```

---
`````

### Proposed

`````text
```

> **現況限制（P1-CONFLICT-4 / ADR-008，登記日 2026-08-29）**
>
> 上列 Recipe 中的 `Financial Assumptions` 節點，其對應的 Atlas Finance Domain Pack
>（`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:3901`）目前僅有目錄宣告，
> 無任何方法內容。依本節 §Method Resolution Rule（本文件 L45-49）之規則，今日若實際
> 驅動本 Recipe 執行到此節點，Method Selection Engine 必須回傳：
>
> `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`
>
> 節點名稱予以保留（Finance domain pack 已列於 Atlas §25 開發優先順序之 Phase 4，
> 非文件寫錯），在該 domain pack 補齊前，本 Recipe 不具備端到端可執行性。詳見 ADR-008。

---
`````

### Reason

逐字採用 ADR-008 Recommendation 段（ADR-008:77-89）給出的加註內容，未新增、未改寫、未省略任何字句。插入位置選在 Recipe 程式碼區塊收尾（L2171）之後、章節分隔線（L2173）之前，比照該章節既有 `Method Resolution Rule` callout（MP:2127-2133）的呈現慣例——同一章節內兩個 callout 風格一致，讀者掃過 §43 開頭與結尾即可同時看到「這條 Recipe 是 intent flow 示意」與「其中一個節點目前會 BLOCKED」兩個邊界聲明。Recipe 節點本身（`Financial Assumptions` 名稱、順序、箭頭）完全不動，因為 ADR-008 明確排除 (b) 設計 stub 方法與 (c) 移除節點——本 diff 僅在母文件加註現況，不生產任何 finance 方法或 domain pack 內容，也不觸碰 Atlas。
