---
proposal_id: "028"
slug: "repo-layout-pointer-ec"
status: APPROVED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L220-224", "L644-648", "L732-749", "L1005-1009", "L2362-2374", "L2742-2843", "L3988-4059"]
related_open_questions: ["OQ-11"]
change_class: "boundary clarification"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: null
---

## PROPOSED_CHANGE

Replace the seven hard-coded repo-path listings in the Execution Contract — §4 Document Registry (L220-224), §12 Current State Artifact (L644-648), §15 Task Execution Packet (L732-749), §23 ADR Trigger (L1005-1009), §72 Handoff Files (L2362-2374), §90–§95 Fitness-Function/Policy/Spec/Docs/Test/Runtime paths (L2742-2843), and §149 第一階段實作計畫's five phase-level path blocks (L3988-4059) — with narrative-only principle statements plus pointers to `docs/architecture/REPOSITORY_ARCHITECTURE.md`. No literal repo directory paths remain at any of the seven sites after this change; the functional/capability narrative around each site is preserved.

## RATIONALE

`docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md`（ACCEPTED 2026-08-29）Sub-decision (b) 裁決「折衷方案」對 Execution Contract 的判斷與 Master Plan 相同：具體目錄/檔名（尤其 EC 這種**模組級深路徑**，如 `/platform/ai-execution/method_resolver/`）屬於實作細節，變化速率遠快於 30 年壽命的憲法文件，應移到 Phase-4-owned 的獨立 `repo-layout` spec；母規格只保留敘事級原則。

ADR 原文 Context 段落列了七個站點（L223 / L647 / L735 / L1008 / L2365 / L2745-2828 / L3995-4054），但這是 grep 找到路徑字串所在行的**近似引用**，不是完整區塊邊界。本提案逐站 Read 確認實際完整區塊，發現三處明顯的邊界落差，須在此明確揭露（依 R4「聲稱即驗證」原則，不可只信 ADR 表格文字）：

1. **§15 Task Execution Packet（ADR 引用 L735）**：實際完整區塊是 L732-749，是一整棵 13 項的 Task Execution Packet 目錄樹（`TASK.md`／`task.manifest.yaml`／...／`handoff/`），ADR 只引用了樹狀結構的**第一行**（`/.ai/tasks/{task_id}/`），漏了其餘 12 行。
2. **§90–§95（ADR 引用 L2745-2828）**：實際完整區塊是 L2742-2843，比 ADR 引用多出約 15 行——且 ADR 表格只點名 `/tests/architecture/`、`/policies/ai-execution/`、`/specs/execution/`、`/platform/ai-execution/` 四個路徑（對應 §90/§91/§92/§95），**完全沒提到 §93 Governance Documentation Paths（`/docs/governance/`）與 §94 Test Paths（`/tests/governance/ai-execution/`）**——這兩段夾在 §92 與 §95 之間，是同一種「模組級硬編碼路徑」問題，且緊鄰其他四段、風格完全一致，遺漏顯然是 ADR 撰寫時的 grep 取樣不完整，不是刻意排除。本提案將六段（§90 路徑部分 + §91 + §92 + §93 + §94 + §95）全部視為同一站點一併處理，理由是它們物理上緊鄰、問題性質相同，若只處理四段、跳過中間兩段，會產生「明明同一種問題、同一塊區域，卻有兩段完好無缺夾在中間」的不一致外觀，對未來讀者更難理解。
3. **§149 第一階段實作計畫（ADR 引用 L3995-4054）**：此站點 ADR 引用的行號範圍已相當接近實際內容邊界（Phase 0 第一行路徑到 Phase 4 最後一行路徑），但漏了每個 Phase 的「建立：」標籤行與「預期結果：」敘事說明。本提案將完整區塊定為 L3988-4059（§149 標題到 Phase 4 預期結果結尾），涵蓋 Phase 0–4 共 5 個路徑區塊；**Phase 5（Golden Cases / Production Gate，L4061-4067）本身沒有逐字路徑列表，維持不變，不在本提案範圍內**。

其餘四站（§4／§12／§23／§72）ADR 引用的單行行號經確認精確落在該路徑字串本身（L223／L647／L1008／L2365 分別對應各自 fence 內的路徑行），本提案取其外圍完整區塊（含標籤行與 fence）以利實際套用時的字串替換精確度。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

- §4 Document Registry（L220-224，"建議：" 路徑行）
- §12 Current State Artifact（L644-648，"Runtime 工作路徑：" 區塊）
- §15 Task Execution Packet（L732-749，完整目錄樹）
- §23 ADR Trigger（L1005-1009，"建議路徑：" 區塊）
- §72 Handoff Files（L2362-2374，"建議：" 目錄樹）
- §90 Architecture Fitness Functions（路徑部分，L2742-2746）、§91 Policy-as-Code Paths（L2750-2762）、§92 Machine-readable Execution Specs（L2766-2783）、§93 Governance Documentation Paths（L2787-2799）、§94 Test Paths（L2803-2819）、§95 Execution Runtime Modules（L2823-2843）——合併為單一站點處理
- §149 第一階段實作計畫，Phase 0–4 各自的「建立：」路徑區塊（L3988-4059；Phase 5 不受影響）

## DEPENDENCIES

- 依賴 ADR-006（ACCEPTED 2026-08-29）Sub-decision (b) 的折衷方案裁決；本提案是 Migration (b) 段的具體實作，七站合併為一份提案（任務指派時的明確安排，非逐站各開一份，理由同 `027-repo-layout-pointer-mp` DEPENDENCIES 段）。
- **`docs/architecture/REPOSITORY_ARCHITECTURE.md`（本提案的指標目標）目前 `Status: PROPOSED`，尚未 ratify 為正式 SSOT**——與 `027-repo-layout-pointer-mp` 依賴的是同一份未定案文件。操作者核准本提案前應知悉：核准後 Execution Contract 的七個站點會指向一份仍在草稿狀態、待 Phase 4 驗證/可能推翻的規格，不是已批准的正本。這是 ADR-006 §(b) 已預期並接受的過渡狀態，但仍需操作者知悉才能核准。
- 應與 `027-repo-layout-pointer-mp` 同批次審閱（同一 ADR-006 §(b) 裁決在兩份母文件上的對應實作），修改不同檔案，互不重疊，可獨立套用。
- **與 `004-architecture-constitution-ec-document-registry` 共同觸及 §4 Document Registry 區段，但行區間不重疊**：`004` 修改的是 §4 的 YAML 範例本體（`documents:` 清單，約 L229-253，新增 `ai-lego.architecture-constitution` 一筆），本提案（`028`）修改的是 §4 開頭「建議：」後的單一路徑行（L220-224，`/specs/governance/document-registry.yaml`）。兩者修改同一份文件的同一個章節但不同子區塊，可獨立套用，建議操作者仍留意套用順序以避免行號位移造成的 Edit 定位混淆（先套用其中一個後，另一個套用前應重新確認行號，因為兩者位於同一章節內、行號可能因彼此修改而位移）。

## COMPATIBILITY

不影響任何既有 schema、policy、recipe 或程式碼——七個站點列出的路徑目前均未被任何 Phase 2/3 程式碼實際引用（Phase 4/5 才是這些路徑對應模組的正式建立者，尚未開始）。§149 的 Phase 說明保留「每個 Phase 要建立什麼能力」的敘事（如 Phase 1「AI 不再 patch-first」），只移除「建在哪個目錄」的字串，不影響階段規劃本身的可讀性。

## MIGRATION

套用時對七個站點分別使用 `Edit` 工具做精確字串替換（禁止 `sed`/裸 patch），逐站替換、逐站確認周邊文字（尤其 §90-95 段落間的 `---` 分隔線與章節標題）未被誤傷；套用後重新計算 Execution Contract sha256 並更新 `.ai/research/phase-0/document-hashes.yaml` 的對應條目。因與 `004` 共享 §4 章節，若兩提案在不同 commit 套用，第二個套用前建議先 `Read` 該區段確認行號未偏移。

## ROLLBACK

`git revert` 對應 commit 即可完整還原七個站點的原始逐字路徑列表。因 Phase 4/5 尚未建立、無程式碼消費這些路徑字串，回滾零下游風險；七站合併於同一 commit，回滾為單一動作即可還原全部七處（若操作者僅想回滾其中一站，需手動局部還原，本提案不提供逐站獨立 commit 顆粒度——已在 DEPENDENCIES 段說明此為任務指派的明確安排）。

## EVIDENCE

- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md`（全文，尤其 Context (b) 站點表格、Sub-decision (b) 折衷方案、Recommendation 第 2 點、Migration (b) 段）
- `docs/architecture/REPOSITORY_ARCHITECTURE.md`（L1-9，確認 `Status: PROPOSED` 與過渡處置敘述）
- `.ai/research/phase-0/document-hashes.yaml`（target_baseline_hash 來源）
- `.ai/proposals/004-architecture-constitution-ec-document-registry/PROPOSAL.md`（確認與本提案 §4 修改範圍不重疊的依據）
- 本次調查直接 Read 七站點確認的實際行號邊界與 ADR 原表格的落差（見 RATIONALE 段逐站說明，尤其 §15、§90-95、§149 三處的邊界擴大）。

## Diff

### Original — 站點 1：§4 Document Registry（L220-224）

```
建議：

```text
/specs/governance/document-registry.yaml
```
```

### Proposed — 站點 1

```
建議：Document Registry 檔案的實際路徑由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（Phase-4-owned repo-layout spec；過渡期草稿落點 `.ai/research/phase-2/repo-layout-draft.yaml`，標記 `status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 1

Document Registry 本身的存在必要性（見本節下方 YAML 範例，列出哪些文件是 required/required_for）是治理內容，應保留；其存放的確切檔案路徑字串是實作細節，依 ADR-006 §(b) 移出。

---

### Original — 站點 2：§12 Current State Artifact（L644-648）

```
Runtime 工作路徑：

```text
/.ai/tasks/{task_id}/current-state/
```
```

### Proposed — 站點 2

```
Runtime 工作路徑：Current State Artifact 的實際存放位置由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。此路徑始終是 workspace path，非永久 identity（見下方「注意」段落，永久 identity 一律使用 `task_id / execution_id / artifact_id / hash`）。
```

### Reason — 站點 2

本站點緊接著的「注意」段落已經明講「`/.ai/` 是 workspace path，不是永久 identity」——這本身已經是「不要把這條路徑當硬約定」的內部信號。移除具體路徑字串、改用指標句，與本節既有原則一致，同時保留「這是 workspace path、identity 另有機制」的關鍵不變量。

---

### Original — 站點 3：§15 Task Execution Packet（L732-749）

```
每個非 trivial task 編譯：

```text
/.ai/tasks/{task_id}/
├── TASK.md
├── task.manifest.yaml
├── normative-context.yaml
├── current-state/
├── risk-assessment.yaml
├── methods.yaml
├── change-plan.yaml
├── rollback-plan.yaml
├── acceptance.yaml
├── gates.yaml
├── evidence/
├── results/
└── handoff/
```
```

### Proposed — 站點 3

```
每個非 trivial task 編譯出一份 Task Execution Packet，須包含以下內容類別：任務定義、任務清單（manifest）、規範性上下文、current-state 快照、風險評估、方法選用紀錄、變更計畫、rollback 計畫、驗收標準、gate 定義、evidence、執行結果、handoff。確切檔名與目錄樹形狀由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 3

Task Execution Packet 必須包含哪些**內容類別**（任務定義、風險評估、rollback 計畫等 13 項）是 Execution Contract 的核心契約，是「AI 執行任何非 trivial task 前必須具備什麼」的不變量，必須保留；但逐檔案的確切檔名（`TASK.md`、`task.manifest.yaml` 等）與目錄樹符號（`├──`、`└──`）是實作細節，依 ADR-006 §(b) 移出，改用內容類別清單 + 指標句，不流失原有的完整性要求。

---

### Original — 站點 4：§23 ADR Trigger（L1005-1009）

```
建議路徑：

```text
/docs/adr/ADR-XXXX-<slug>.md
```
```

### Proposed — 站點 4

```
建議路徑：ADR 檔案的存放慣例與命名規則由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。
```

### Reason — 站點 4

即使本 repo 目前 ADR 實際存放慣例（`docs/adr/ADR-XXXX-<slug>.md`）與此站點原文字面相符，依 ADR-006 §(b) 的一致原則，具體路徑仍不應鎖在憲法級文件裡——ADR 存放慣例未來若調整（例如加入按 domain 分子目錄），不應要求同步修改 Execution Contract 本身。

---

### Original — 站點 5：§72 Handoff Files（L2362-2374）

```
建議：

```text
/.ai/tasks/{task_id}/handoff/
├── EXECUTION_RESULT.md
├── execution-result.yaml
├── changed-paths.txt
├── test-results.yaml
├── gate-results.yaml
├── rollback-evidence.yaml
├── known-risks.yaml
└── evidence-index.yaml
```
```

### Proposed — 站點 5

```
建議：Handoff 須包含以下內容類別：執行結果說明、結構化執行結果、變更路徑清單、測試結果、gate 結果、rollback 證據、已知風險、evidence 索引。確切檔名與目錄樹形狀由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。
```

### Reason — 站點 5

Handoff 必須交付的內容類別（8 項）是 Structured Handoff 契約的核心，須保留；確切檔名是實作細節，依 ADR-006 §(b) 移出。

---

### Original — 站點 6：§90-§95 Fitness Functions / Policy / Specs / Docs / Test / Runtime Paths（L2742-2843）

```
路徑：

```text
/tests/architecture/
```

---

# 91. Policy-as-Code Paths

```text
/policies/ai-execution/
├── authority.yaml
├── risk-tiers.yaml
├── mandatory-gates.yaml
├── tool-permissions.yaml
├── forbidden-actions.yaml
├── network-egress.yaml
├── exception-policy.yaml
└── release-policy.yaml
```

---

# 92. Machine-readable Execution Specs

```text
/specs/execution/
├── task.schema.yaml
├── document-registry.schema.yaml
├── current-state.schema.yaml
├── risk.schema.yaml
├── authority.schema.yaml
├── method-resolution.schema.yaml
├── change-plan.schema.yaml
├── rollback.schema.yaml
├── gate.schema.yaml
├── exception.schema.yaml
├── manifest.schema.yaml
├── result.schema.yaml
└── handoff.schema.yaml
```

---

# 93. Governance Documentation Paths

```text
/docs/governance/
├── ai-execution/
│   ├── lifecycle.md
│   ├── authority.md
│   ├── risk-classification.md
│   ├── rollback-first.md
│   └── handoff.md
├── adr/
└── runbooks/
```

---

# 94. Test Paths

```text
/tests/governance/ai-execution/
├── document-resolution/
├── state-machine/
├── authority/
├── risk/
├── gate-injection/
├── rollback/
├── scope/
├── prompt-injection/
├── secrets/
├── jurisdiction/
├── replay/
└── handoff/
```

---

# 95. Execution Runtime Modules

建議：

```text
/platform/ai-execution/
├── document_resolver/
├── normative_context/
├── current_state/
├── task_classifier/
├── risk_engine/
├── method_resolver/
├── plan_compiler/
├── authority/
├── tool_broker/
├── execution_runtime/
├── gate_engine/
├── rollback/
├── audit/
└── handoff/
```
```

### Proposed — 站點 6

```
路徑：Architecture Fitness Function 測試的落點由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

---

# 91. Policy-as-Code Paths

Policy-as-Code（authority、risk-tiers、mandatory-gates、tool-permissions、forbidden-actions、network-egress、exception-policy、release-policy 等 8 類策略）須各自為機讀、版本化、可獨立於程式碼演進的檔案。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

---

# 92. Machine-readable Execution Specs

Execution 生命週期涉及的機讀 schema（task、document-registry、current-state、risk、authority、method-resolution、change-plan、rollback、gate、exception、manifest、result、handoff 等 13 類契約）須各自版本化為獨立 schema。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

---

# 93. Governance Documentation Paths

AI 執行治理文件（lifecycle、authority、risk-classification、rollback-first、handoff 等說明文件，含 ADR 與 runbook）須人類可讀且與機讀 spec 一一對應。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

---

# 94. Test Paths

AI 執行治理的每個面向（document-resolution、state-machine、authority、risk、gate-injection、rollback、scope、prompt-injection、secrets、jurisdiction、replay、handoff 等 12 類）須有對應的自動化測試覆蓋。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

---

# 95. Execution Runtime Modules

建議：Execution Runtime 依生命週期切分為獨立模組（document 解析、normative context、current state、task 分類、risk engine、method resolver、plan compiler、authority、tool broker、execution runtime、gate engine、rollback、audit、handoff 等 14 個模組），彼此邊界清楚、可獨立替換。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（Phase-4-owned repo-layout spec；過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。
```

### Reason — 站點 6

六個小節（§90 路徑部分／§91／§92／§93／§94／§95）都是同一種問題：用逐檔名/逐子目錄的方式把 Phase 4/5 才會定案的模組切分鎖進 Execution Contract。§90 的「例：」不變量清單（"No direct provider SDK in domain" 等 6 條）不是路徑，保留不動；六段各自的分類名稱與職責描述（如「Policy-as-Code 的 8 類策略」「Execution Runtime 的 14 個模組」）是有效的架構敘事，轉為文字描述保留，只移除逐檔名/逐目錄的樹狀列表。§93、§94 雖未被 ADR 原表格點名，但問題性質、所在位置（緊鄰 §92/§95）與處理方式完全相同，一併處理避免同一區域內處理不一致（詳見 RATIONALE 段）。

---

### Original — 站點 7：§149 第一階段實作計畫，Phase 0-4（L3988-4059）

```
# 149. 第一階段實作計畫

## Phase 0 — Normative Bootstrap

建立：

```text
/specs/governance/document-registry.yaml
/specs/execution/*.schema.yaml
/policies/ai-execution/*.yaml
```

預期結果：

AI 能 machine-read 規範，而不是只靠 prompt 記憶。

## Phase 1 — Current State + Risk Compiler

建立：

```text
/platform/ai-execution/current_state/
/platform/ai-execution/task_classifier/
/platform/ai-execution/risk_engine/
```

預期結果：

AI 不再 patch-first。

## Phase 2 — Method / Gate Compiler

建立：

```text
/platform/ai-execution/method_resolver/
/platform/ai-execution/gate_engine/
```

直接解析 Method Atlas / Method Specs。

預期結果：

方法與品質 gate 自動注入。

## Phase 3 — Rollback / Authority

建立：

```text
/platform/ai-execution/rollback/
/platform/ai-execution/authority/
/platform/ai-execution/tool_broker/
```

預期結果：

高風險 action 不可由 AI 單獨突破。

## Phase 4 — Handoff / Audit / Replay

建立：

```text
/platform/ai-execution/audit/
/platform/ai-execution/handoff/
/platform/ai-execution/replay/
```

預期結果：

每次 AI 工作都成為可驗證 Engineering Artifact。
```

### Proposed — 站點 7

```
# 149. 第一階段實作計畫

## Phase 0 — Normative Bootstrap

建立：Document Registry、Execution Specs schema、Policy-as-Code 檔案（機讀規範的最小集合）。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

預期結果：

AI 能 machine-read 規範，而不是只靠 prompt 記憶。

## Phase 1 — Current State + Risk Compiler

建立：Current State 重建、Task 分類、Risk Engine 三個 runtime 模組。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

預期結果：

AI 不再 patch-first。

## Phase 2 — Method / Gate Compiler

建立：Method Resolver、Gate Engine 兩個 runtime 模組。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

直接解析 Method Atlas / Method Specs。

預期結果：

方法與品質 gate 自動注入。

## Phase 3 — Rollback / Authority

建立：Rollback、Authority、Tool Broker 三個 runtime 模組。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`。

預期結果：

高風險 action 不可由 AI 單獨突破。

## Phase 4 — Handoff / Audit / Replay

建立：Audit、Handoff、Replay 三個 runtime 模組。實際目錄由 repo-layout spec 決定，見 `docs/architecture/REPOSITORY_ARCHITECTURE.md`（Phase-4-owned repo-layout spec；過渡期草稿 `.ai/research/phase-2/repo-layout-draft.yaml`，`status: DRAFT_PENDING_PHASE_4`）。

預期結果：

每次 AI 工作都成為可驗證 Engineering Artifact。
```

### Reason — 站點 7

每個 Phase「要建立什麼能力」（如 Phase 1 的「AI 不再 patch-first」）是實作路線圖的核心價值，保留不動；「建在哪個目錄」是實作細節，依 ADR-006 §(b) 移出改用指標句。Phase 5（Golden Cases / Production Gate）本身沒有逐字路徑列表，不受本次修改影響，維持原文不變。
