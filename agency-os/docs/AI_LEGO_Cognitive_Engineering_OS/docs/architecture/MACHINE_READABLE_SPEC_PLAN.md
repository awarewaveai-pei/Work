# MACHINE_READABLE_SPEC_PLAN
Status: PROPOSED
Date: 2026-08-29
Depends on: ADR-001~006 (`docs/adr/`, all `Status: PROPOSED`), Phase 0 `verified-findings.yaml` (71 items), Phase 1 `GAP_REGISTER.yaml` / `CONFLICT_REGISTER.yaml` / `DUPLICATION_REGISTER.yaml`

> **邊界聲明**：本文件是 Phase 3（`Status: NOT_STARTED`）開工前的規劃文件，不建立任何 `/specs /policies /methods /recipes` 目錄或檔案，不修改三母文件。所有「建議」在操作者批准對應 ADR、且 Phase 2 Exit Gate（STOP FOR HUMAN REVIEW）通過前不得執行。

---

## 0. 這份計畫要解決的問題

Phase 0/1 用 71+98 條 findings 證明了同一件事的三種樣態：
1. **同一機讀型別被定義兩次以上，且已經漂移**（Execution Manifest 4 種形狀、epistemic label 4 套詞彙、risk_tier 2 套、reversal 3 種形狀、assumption 3 種形狀、DB Migration 5 處序列圖）。
2. **規範性文字承諾了一個型別/schema，但全庫零定義**（`MethodExecutionRequest`/`TypedMethodResult`、`Section Registry`/`Normative Context Bundle`、12+ typed workflow objects、`Jurisdiction Pack`、`Repository Contract`）。
3. **Atlas 289 個方法條目中僅 2 個有結構化 contract**，Method Selection Engine 的核心機制（Compatibility Check）在機制上無法執行。

六份 ADR（Round 1，全部 `PROPOSED`）已經對其中一部分做出裁決。本文件的工作是把「ADR 裁決」與「Phase 0/1 尚未有 ADR 覆蓋的 missing_contract findings」一起攤開，變成一張可執行的建置清單：**每個檔案的用途、格式、依賴順序、解決哪個 finding**。

**誠實聲明（避免自我隱藏缺口）**：GAP_REGISTER.yaml 51 條中，多數（P1-GAP-SEC-*／P1-GAP-INFRA-*／P1-GAP-PROD-* 等）是「完全空白」而非「重複定義衝突」——這類項目沒有既有內容可收斂，Phase 3 只能先建骨架/佔位 schema，實質內容需要操作者做工程/法遵決策（例如選 SBOM 格式、選 IdP 標準），不是靠讀三母文件就能推導。本計畫將這類項目標記為 `SKELETON_ONLY`，不假裝一次規劃能填滿。**（2026-08-29 訂正，發現本段已過期——見 R4 抓蟲）**：4 條 CONFLICT（P1-CONFLICT-1~4）與 5 條 DUPLICATION（P1-DUP-1~5）**現已全數有 ADR 裁決**：P1-CONFLICT-1（ADR-002）、P1-CONFLICT-2（ADR-003）、P1-CONFLICT-3（**ADR-007**）、P1-CONFLICT-4（**ADR-008**）、P1-DUP-1（ADR-005）、P1-DUP-3（ADR-003）、P1-DUP-2（**ADR-009**）、P1-DUP-5（**ADR-009**）。本段原文寫「P1-CONFLICT-3/4、P1-DUP-2/5 尚無 ADR」，該陳述已被 ADR-007/008/009（皆 2026-08-29 ACCEPTED，見 `docs/adr/ADR_INDEX.md`）取代但本段落當時未同步更新——**ADR 裁決定案 ≠ 母文件已編輯**，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 `status: APPROVED` 僅操作者可推進，故下方 §2.9 `policies/privacy/` 相關列的 `BLOCKED_PENDING_ROUND2_ADR` 標記同步改為「ADR 已定案，母文件套用/policy 檔建置進度」說明。

---

## 1. Directory Structure

以 `AI_LEGO_OS_Program_Plan_v1.md` §7 已定的骨架為基礎（該骨架本身是 Phase 2 治理計畫的既定輸出，非本文件發明）：

```
PROJECT_ROOT/                                  ← D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\
├── Architecture-Constitution-v1.md            ← ADR-001；第四份母文件，敘事層，不進 /specs
├── .ai/
│   ├── proposals/<NNN>-<slug>/PROPOSAL.md     ← ADR-006a；母文件修改流程（已存在機制，非本計畫產物）
│   └── research/phase-2/repo-layout-draft.yaml← ADR-006b；DRAFT_PENDING_PHASE_4（已存在，Phase 3 只讀不改）
├── specs/
│   ├── domain/          ← 產品/業務物件（Tenant、Repository Contract、Capability Contract 擴充…）
│   ├── cognitive/        ← LEGO 積木本體（primitive/method/lens/recipe/profile/representation + I/O 型別）
│   ├── evidence/         ← evidence/claim/assumption
│   ├── artifact/          ← CAS 路徑文法、Portable Artifact URI
│   ├── workflow/         ← Workflow IR node、Branch/Merge（草案）
│   ├── execution/        ← EC §92 的 13 個檔案 + 本計畫新增的缺口
│   ├── decision/         ← decision/reversal
│   ├── jurisdiction/     ← context/availability/pack/conflict-of-laws 輸出
│   ├── security/         ← ★ crypto-shred envelope、tenant 加密金鑰、RBAC/ABAC（部分 SKELETON_ONLY）
│   ├── governance/       ← ★★ 新增目錄（見下方「與 Program Plan §7 的差異」）
│   └── analytics/        ← SKELETON_ONLY（成本/計量，P1-GAP-PROD-7，低優先）
├── policies/
│   ├── ai-execution/     ← EC §91 既有 8 檔清單（authority/risk-tiers/mandatory-gates/tool-permissions/forbidden-actions/network-egress/exception-policy/release-policy）
│   ├── security/         ← **BUILT（2026-08-30，8/8 子決策全數批准，ADR-015/016）**——IdP=Zitadel 為操作者本人決定
│   ├── privacy/          ← crypto-shred 落地為政策；PII/pseudonymization 段已由 ADR-007 定案並建成 `pii-redaction.policy.yaml`（2026-08-29）
│   ├── jurisdiction/      ← Legal Source Registry SLA、Conflict-of-Laws Engine 歸屬（BLOCKED，需 Round 2 決定哪個引擎贏）
│   ├── provider/         ← Model Registry、AI Gateway Fallback（SKELETON_ONLY）
│   └── release/          ← Global/High-risk Gate 清單（BLOCKED_PENDING_ROUND2_ADR，見 §4 Wave 5）
├── methods/
│   ├── contracts/        ← 逐方法 contract 檔（見 §5）
│   └── registry/         ← method-inventory.yaml（沿用 Phase 0）+ contract-backlog.yaml（新增）
├── recipes/
│   └── validated/        ← DB Migration（ADR-005a）、Method Deprecation、Champion/Challenger
├── docs/
│   ├── architecture/
│   ├── adr/              ← 沿用現有 `docs/adr/`，路徑已與多數母文件引用一致（見 §2 CROSS-T-22 註記）
│   └── runbooks/
└── tests/
    ├── architecture/
    ├── contracts/
    └── governance/        ← 內嵌 EC §94 原 12 個子目錄 + 補回遺漏的 golden/（見 §2）
```

### 與 Program Plan §7 的差異（需要操作者確認的偏離，非擅自更動）

| 差異 | 原因 | 證據 |
|---|---|---|
| **新增 `/specs/governance/`** | Program Plan §7 列的 10 個 specs 子目錄（domain/cognitive/evidence/artifact/workflow/execution/decision/jurisdiction/security/analytics）**不含 governance**，但 ADR-004 明確指定 `epistemic-label.schema.yaml` 的路徑是 `/specs/governance/`。這不是本計畫發明新目錄，是把 ADR-004 已寫死的路徑物理接上。 | ADR-004 Recommendation 段；`AI_LEGO_OS_Program_Plan_v1.md` §7 |
| **`/tests/governance/` 內嵌 EC §94 的 12 個子目錄** | Program Plan §7 只給 3 個粗桶（architecture/contracts/governance），EC §94 已有更細的 12 項清單（document-resolution/state-machine/authority/risk/gate-injection/rollback/scope/prompt-injection/secrets/jurisdiction/replay/handoff）。兩者不衝突，細清單是粗桶下的實作細節，不需要一份新 ADR，僅在此處記錄採納。 | EC L2805-2819；`DOC-execution_contract-8` |
| **補回 `golden/` 子目錄** | EC §141 要求 `/tests/governance/ai-execution/golden/`，但 §94 的清單漏列它。Phase 3 建置時一併補上，屬 R0 Low-risk 修正（純新增，不刪除任何既有項）。 | `DOC-execution_contract-8`（EC L849） |
| **新增頂層 `/capabilities/contracts/`（2026-08-30）** | Program Plan §7 未列此目錄；`specs/domain/capability-contract.schema.yaml` 一直只有 schema，全庫零一份真實 Capability Contract 實例檔（唯一具體內容是內嵌在該 schema檔自身的 `worked_example`）。比照既有 `methods/contracts/`／`recipes/validated/`（schema 放 `specs/`，實例放頂層複數目錄）同一慣例，為 `run_statistics`（Cohen's Kappa inter-rater reliability，Phase 5 Research Mode 切片所需）建第一份真實 Capability Contract 實例；2026-09-04 再補 `transcribe`／`literature_search`／`artifact.generate_research_paper` 三份（ADR-023 §Consequences 1），該切片 Recipe 的 4 個 capability ref 首次全部有 ACTIVE contract。`tests/run_golden_tests.py` 同步新增對應 conformance check（見該檔 §2c）。 | `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` §4（L121）；`capabilities/contracts/run_statistics.capability.yaml#/description`（新目錄理由完整說明） |

---

## 2. Spec Inventory

依目錄分組。**依賴**欄只列同層或下層的直接依賴（不重複列遞移依賴）。**狀態**欄：`READY`（可直接依現有 ADR/母文件內容建置）、`BLOCKED_PENDING_ROUND2_ADR`（母文件仍有未裁決衝突，Phase 3 不得單方面選邊）、`SKELETON_ONLY`（母文件完全空白，只能先建欄位骨架，內容留待操作者/法遵決策）。

### 2.1 `/specs/governance/`（Wave 1 — 全系統最先建）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `epistemic-label.schema.yaml` | 定義 `epistemic_type`（11 值 SNAKE_CASE）+ `authorship_state`（6 值）+ `locked`（LOCKED_FACT/LOCKED_DECISION）三個正交欄位，組成每個內容物件的最小 provenance record | YAML (JSON Schema) | 無（Wave 0 之後最先建） | CROSS-T-6, CROSS-R-9, CROSS-R-11, CROSS-T-7, CROSS-T-8, CDX-7, OQ-7, OQ-8（ADR-004b 全套裁決） | **BUILT（2026-08-29，`specs/governance/epistemic-label.schema.yaml`）** |

### 2.2 `/specs/execution/`（Wave 1 其餘 + EC §92 既有 13 檔 + 新增缺口）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `risk-tier.schema.yaml` | R0–R4 五級唯一 canonical risk_tier enum，取代 Atlas 四級 | YAML (JSON Schema) | 無 | CROSS-T-3, CROSS-R-10（ADR-004a） | **BUILT（2026-08-29，`specs/execution/risk-tier.schema.yaml`）** |
| `status-codes.schema.yaml` **（新增）** | 統一收斂全庫所有 blocking/escalation 機讀狀態碼：`PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED`/`METHOD_RESOLUTION_BLOCKED` 合併映射、EC 另外 9 個具名信號（`DOCUMENT_RESOLUTION_BLOCKED`/`CURRENT_STATE_DRIFT_DETECTED`/`SCOPE_CHANGE_REQUIRED`/`LEGAL_REVIEW_REQUIRED`/`BUDGET_REVIEW_REQUIRED`/`CONFLICT_REQUIRES_HUMAN_REVIEW`/`PREEXISTING_WORKTREE_CHANGES`/`OFFLINE_SOURCE_STALE`）與 §10 合法 side states 的映射關係，並新增 §5 提案的 `PLANNING_BLOCKED_METHOD_CONTRACT_REQUIRED` | YAML (JSON Schema) | 無 | CROSS-R-4, CROSS-T-5, DOC-execution_contract-9, DOC-execution_contract-3（`NEEDS_REVIEW` 未宣告） | **BUILT（2026-08-29，`specs/execution/status-codes.schema.yaml`；額外發現新衝突 P1-DUP-6，見 DUPLICATION_REGISTER.yaml）** |
| `manifest.schema.yaml` | Execution Manifest 唯一正本，合併 MP §0.0.3 Atlas pin（file/declared_version/content_hash/loaded）+ EC §64 documents 段（version/sha256）+ MP §69 flat pin list + Atlas §16.3 method_execution record 四種形狀，並補上 ADR-001 建議的 Architecture Constitution 記錄欄位 | YAML (JSON Schema) | governance/epistemic-label（provenance 欄位）、Architecture-Constitution-v1.md（記錄它的 hash） | CROSS-R-6, CROSS-T-4, DOC-execution_contract-2（`document_version+content_hash` vs `version+sha256` 命名不一致） | **BUILT（2026-08-29，`specs/execution/manifest.schema.yaml`；EC L85 prose 與機讀區塊仍不一致，留 open_question 未擅自改母文件）** |
| `normative-context.schema.yaml` **（新增）** | 定義 `Section Registry`（EC L198）與 `Normative Context Bundle`（EC L204）結構，供 Task Execution Packet 的 `normative-context.yaml` 引用 | YAML (JSON Schema) | manifest.schema.yaml | CROSS-T-18 | **BUILT（2026-08-29）**——~85% 為 Phase 3 新設計，已誠實標註非母文件既有承諾內容 |
| `method-resolution.schema.yaml` | Task Context → Method Atlas selection_context 的欄位映射表，補齊 `goal_type/problem_type/required_rigor/decision_criticality/evidence_available/uncertainty/time_horizon` 等 EC task_context 缺失欄位 | YAML (JSON Schema) | risk-tier.schema.yaml, cognitive/method.schema.yaml | CROSS-T-16, P1-GAP-LEGAL-7 | **BUILT（2026-08-29，2026-08-30 修正一處真實邏輯漏洞）**——17 個 Atlas selection_context 欄位對 12 個 task_context 欄位逐一映射，13 個標記 SUPPLEMENT_REQUIRED。**續30 追加第 18 個欄位** `policy_context`（+ 衍生欄位 `regulatory_exposure`）：轉錄 `GLOBAL_JURISDICTION_PLAN.md`（Status: PROPOSED）§6，解 P1-GAP-LEGAL-7（§26.3 十一項政策分析維度與 selection_context 無欄位對應）；誠實標記非 Atlas 原生 17 欄位之一（`mapping_type: NEW_FIELD_NOT_IN_ATLAS_17`），「尚未走 ADR 正式批准」的揭露記錄於 `open_questions.OQ-mres-4`（訂正：此列先前誤引 `OQ-mres-5`）；§6.4 forcing rule 另記錄於 `OQ-mres-5`，非硬編為 schema 約束（跨物件選擇演算法行為，非同物件形狀約束）。**2026-08-30 真實 `/codex-review` 端到端測試 MEDIUM finding 並已修正**：`regulatory_exposure` 原為選填，`resolved_selection_context` 可在 `policy_context` 已填的情況下仍省略它，靜默繞過 §6.4 forcing rule；已改為 `required`（連 `none` 都要顯式寫），`OQ-mres-5` 補 `partial_resolution` 記錄此半題已解。**轉錄忠實度已由 ADR-013（2026-08-30）批次追認**，`OQ-mres-4` 標記 RESOLVED。**同批 commit 事後真實 `/codex-review` 額外抓到一個獨立缺口**：`regulatory_exposure` 必填但來源文件 `GLOBAL_JURISDICTION_PLAN.md` §6 自己也沒給出 `policy_context → regulatory_exposure` 的具體推導演算法（§6.3 對照表只講下游效果，非推導公式）；已新增 `open_questions.OQ-mres-6` 誠實記錄，不由 Claude 自行發明（屬法規/政策判斷，需操作者裁決） |
| `capability-resolution.schema.yaml` **（新增 2026-09-04）** | Workflow IR capability refs → Capability Catalog 的解析記錄（`capability_resolution_request` / `capability_resolution_result` / `plan_executability`），是 `method-resolution.schema.yaml#/method_resolution_result` 的 capability 側鏡像；依 Recipe `necessity`（Atlas §14.3）判定計畫可執行性（REQUIRED_* 節點未解析 → `executable: false` → 不得進 PLAN_COMPILED） | YAML (JSON Schema) | domain/capability-contract.schema.yaml, cognitive/recipe.schema.yaml, status-codes.schema.yaml | OQ-P5-1（ADR-023 §Consequences 3） | **BUILT（2026-09-04）**——刻意新檔而非泛化 method-resolution（該檔 `blocked.status` const 與 method id 文法都不同，泛化會削弱 ACTIVE 檔的保證；統一留 OQ-CAPRES-1）；`blocked` 為 required-nullable、`unresolved` 必非空（比 method 側嚴，已揭露）；3 份 fixture 逐條打 4 條 allOf/if/then 規則；runtime 落盤前驗證 |
| `task.schema.yaml` | EC §92 既有承諾，task_context 完整結構 | YAML (JSON Schema) | risk-tier, governance/epistemic-label | （沿用既有承諾，無單一 finding） | **BUILT（2026-08-29）**——EC §7 12 欄位逐字轉譯，risk_tier 升級為真實 $ref |
| `document-registry.schema.yaml` | EC §92 既有承諾，含三母文件 + Architecture Constitution 的 identity header 登記 | YAML (JSON Schema) | Architecture-Constitution-v1.md | OQ-1（identity header 缺失，2026-08-30 proposal 040/041 已解） | **BUILT（2026-08-30）**——EC §4 靜態登記表逐字轉譯，4 個 id 皆已對應真實 identity header；runtime 記錄半部已由既有 `manifest.schema.yaml` 涵蓋不重複；發現 `manifest.schema.yaml` 獨立硬編同 4 值 enum 的潛在漂移風險，誠實記錄 `OQ-DOCREG-1` 不擅自重構既有 ACTIVE 檔案 |
| `current-state.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | **BUILT（2026-08-29）**——EC §11.1 20 項檢查清單 + §11.2 證據優先序 |
| `authority.schema.yaml` | EC §92 既有承諾，A0-A4 Autonomy/Authority Levels | YAML (JSON Schema) | governance/epistemic-label（locked 欄位需對照誰能改） | P1-GAP-SEC-6（人類角色↔A0-A4 對應，部分） | **BUILT（骨架，2026-08-29）**——A0-A4 本體為 EC §9 真實逐字轉譯；`role_to_authority_mapping` 誠實留空並標 `SKELETON_ONLY`，未捏造範例角色 |
| `change-plan.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | risk-tier | — | **BUILT（2026-08-29）** |
| `rollback.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | **BUILT（2026-08-29）**——從 EC §20 + 本專案 10 份 ADR 自己真實的 Migration/Rollback 段落逆向工程，非抽象發明 |
| `gate.schema.yaml` | EC §92 既有承諾，`gate_result.gate_id` 需要一份穩定 gate 清單 | YAML (JSON Schema) | risk-tier（R3∪R4 觸發規則） | 部分依 ADR-004a 可用；Global/High-risk Gate 清單本身（14+6 vs 11+1）**已由 ADR-011（2026-08-30）裁決** | **BUILT（2026-08-29 骨架 → 2026-08-30 完整）**——`gate_result` 結構本體已建（EC §69）；`gate_id` 由 `TBD_PENDING_ROUND2_ADR` 升級為 `gate_catalog`（20 項：14 Global + 6 High-risk，Master Plan 為唯一內容 owner，3 個 CROSS-T-11 命名採 Atlas 版本）；Method-specific（Atlas §22.3）維持開放命名空間不變 |
| `exception.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | **BUILT（2026-08-29）**——EC §24 12 欄位範本 + Atlas §29 rule 12 交叉核對 |
| `result.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | cognitive/typed-method-result.schema.yaml | CROSS-R-3（部分：result.schema.yaml 不等於 TypedMethodResult，見 2.3） | **BUILT（2026-08-29）**——`status` 為真實 $ref 指向 EC §70 vocabulary，非重新宣告 |
| `handoff.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | authority.schema.yaml | — | **BUILT（2026-08-29）**——EC §71 30 項 MUST 清單 + §72 8 檔 RECOMMENDED 佈局逐字依據 |
| `section-registry.schema.yaml` **（新增，評估後確定分離設計）** | Section Registry 與 Normative Context Bundle 判定為不同生命週期（前者文件層級可跨 execution 重用，後者 per-execution）而分離為兩檔 | YAML (JSON Schema) | normative-context.schema.yaml | CROSS-T-18（同上） | **BUILT（2026-08-29）** |
| `deprecation-pipeline.schema.yaml` **（新增）** | 統一 Atlas §24.3（6 步）與 EC §113（7 步，多 Deadline）的方法/物件退場流程，採 EC 版（更完整，屬 Low-risk 事實性補全，非需要 ADR 裁決的取捨） | YAML (JSON Schema) | status-codes.schema.yaml | CROSS-T-19 | **BUILT（2026-08-29）**——逐欄位核對後確認「EC 完全涵蓋 Atlas」的假設成立，非照抄計畫文件定性 |

### 2.3 `/specs/cognitive/`（Wave 3 — Method Selection Engine 核心）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `primitive.schema.yaml` | Atlas Appendix A 既有承諾，24-primitive kernel 型別化（並收斂 `CAUSE_HYPOTHESIS/TRANSFORM/CLASSIFY/CONTEXTUALIZE/WEIGHT` 等超出 kernel 清單的用法） | YAML (JSON Schema) | — | DOC-method_atlas-2 | **BUILT（2026-08-29）**——CANONICAL_KERNEL(24) vs OBSERVED_EXTENSION(5) 分層，未靜默合併 |
| `method.schema.yaml` | Atlas §9 LEGO Contract 正式 schema 化；`id` 欄位 pattern 鎖定 ADR-005b 裁決的 bare `<family>.<name>` 文法（`^[a-z_]+\.[a-z_]+$`），`version` 獨立欄位 | YAML (JSON Schema) | governance/epistemic-label（method 的 has_contract 狀態本身需要 provenance） | CROSS-T-14, DOC-method_atlas-1（ADR-005b） | **BUILT（2026-08-29）**——id pattern 已用正則實測確認拒絕 `method.swot.v1` 等錯誤形式 |
| `lens.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | — | — | **BUILT（2026-08-29）**——僅 1 個真實範例（stakeholder.regulator），已誠實標註單例推論風險 |
| `representation.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | — | — | **BUILT（2026-08-29）**——5 處 Atlas 段落交叉驗證後建立 |
| `recipe.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | method.schema.yaml | — | **BUILT（2026-08-29）**——採 MP §9 Workflow IR 2 值 node-type 文法，Recipe ID 文法留 open_question |
| `profile.schema.yaml` | Atlas Appendix A 既有承諾（rigor/mode profile） | YAML (JSON Schema) | rigor-level.schema.yaml | — | **BUILT（2026-08-29）**——僅 cognitive 維度有真實依據，其餘留骨架 |
| `rigor-level.schema.yaml` **（新增）** | 補回 MP §84 五模式（Fast/Professional/Research Grade/Board Grade/**Deep Intelligence**）與 Atlas `required_rigor` 四值 enum 的映射，Deep Intelligence 定義為 board_grade + 額外 gate 組合 | YAML (JSON Schema) | governance/epistemic-label | CROSS-T-15 | **BUILT（2026-08-29）**——名稱恢復（Low-risk）已定案；enum 基數該不該擴為 5 值留 `open_questions` 待操作者/Round 2 ADR（比照 ADR-004 判準，未擅自決定） |
| `problem-type.schema.yaml` **（新增）** | 統一 `selection_context.problem_type` enum 與 §10 Problem Type 路由表——把 Incident/Policy/Architecture/Security/DB Migration/Market Entry 補進 enum，exploratory/decision/operational 補上路由表對應列 | YAML (JSON Schema) | method-resolution.schema.yaml | DOC-method_atlas-5 | **BUILT（2026-08-29）**——13 值 enum，10 個路由對應有據，3 個（exploratory/decision/operational）誠實留白非母文件承諾 |
| `method-execution-request.schema.yaml` **（新增，全庫首次定義）** | `cognitive.execute_method` Capability Contract 的輸入型別；全三份文件目前僅 MP L708 提名、零定義 | YAML (JSON Schema) | method.schema.yaml, execution/task.schema.yaml | CROSS-R-3, CROSS-T-17, DOC-master_plan-6 | **BUILT（2026-08-29）**——~15% 有據/~85% 新設計，比例誠實揭露 |
| `typed-method-result.schema.yaml` **（新增，全庫首次定義）** | 同上契約的輸出型別 | YAML (JSON Schema) | execution/result.schema.yaml | CROSS-R-3, CROSS-T-17, DOC-master_plan-6 | **BUILT（2026-08-29）**——~35% 有據/~65% 新設計，CROSS-R-3 至此完整解決 |
| `typed-objects/problem-statement.schema.yaml` **（新增）** | 含 `status` enum（引用處要求 `validated` 狀態值，但全文從未定義完整 enum） | YAML (JSON Schema) | — | DOC-method_atlas-9, DOC-method_atlas-7 | **BUILT（2026-08-29）** |
| `typed-objects/cause-hypothesis-set.schema.yaml` **（新增）** | §14.1 型別鏈節點 | YAML (JSON Schema) | root-cause-fact（見下） | DOC-method_atlas-7 | **BUILT（2026-08-29）**——真實 `$ref` 串接 problem-statement → cause-hypothesis-set → root-cause-fact |
| `typed-objects/root-cause-fact.schema.yaml` **（新增）** | 統一 `FinalCausalFact`/`RootCauseFact`/`Root Cause Fact`/`RootCauseAssessment` 四個名稱為單一型別 + 單一 canonical name（建議採 `RootCauseFact`，其餘三個列為 deprecated alias） | YAML (JSON Schema) | governance/epistemic-label（此型別的提升規則直接對應 FACT 紅線） | DOC-method_atlas-3 | **BUILT（2026-08-29）**——4 個名稱引用逐一核對行號正確；建置過程抓到並修正 2 個真實 schema bug（required 欄位打錯、forbidden_transition 縮排錯誤） |
| `typed-objects/knowledge-set.schema.yaml` / `swot-analysis.schema.yaml` / `strategy-options.schema.yaml` / `decision-candidate.schema.yaml` / `human-decision.schema.yaml` / `perspective-assessment.schema.yaml` / `board-decision-pack.schema.yaml` / `idea-set.schema.yaml` / `cluster-set.schema.yaml` / `preliminary-priority.schema.yaml` **（新增，共 10 檔）** | §14.1 型別相容性鏈其餘節點；Atlas §16 目前只定義 Idea/Decision/MethodExecution 三種，這 10+ 種完全無 schema | YAML (JSON Schema，逐檔獨立） | 依鏈上下游互相依賴（見 Build Order Wave 3） | DOC-method_atlas-7 | **DEFERRED（2026-08-30 查證）**——`grep` 全文 `MVP_VERTICAL_SLICE_PLAN.md`（Research Mode 已選定為切片 Mode）確認這 10 個物件名稱**零命中**：全部 10 個看起來屬於 Business/Decision Mode 產出（SWOT、strategy-options、board-decision-pack 等），Research Mode 切片目前不需要任何一個。依「建議先做 MVP 垂直切片實際會用到的節點」的既有指示，誠實結論是「目前一個都不用做」，不臆測哪個可能有用而搶先建；待 Business/Decision Mode 排入切片範圍時再回來按實際需求建置，避免無需求的投機規格造成日後與真實用法不一致 |

### 2.4 `/specs/evidence/` 與 `/specs/decision/`（Wave 4 — 知識平面）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `evidence/evidence.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | governance/epistemic-label | — | **BUILT（2026-08-29）**——母文件對本體形狀證據薄弱，誠實標記 `content`/`source` 為新設計非既有承諾 |
| `evidence/claim.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | evidence.schema.yaml | — | **BUILT（2026-08-29）**——以 Atlas §11.20 Evidence Matrix 實例為主要依據 |
| `evidence/assumption.schema.yaml` | 合併 MP §24（type/evidence_strength/confidence/validation_method）+ EC §116（evidence[]/validation/owner）+ Atlas F10（ID/statement/type/evidence/confidence/validation/status/owner，欄位最完整）三種形狀，建議採 Atlas F10 版為底 | YAML (JSON Schema) | claim.schema.yaml | CROSS-T-13 | **BUILT（2026-08-29）**——逐欄位核對後發現本列「F10 最完整」的敘述其實不精確：F10 缺 `impact_if_wrong`（MP/EC 皆有），已補回，非機械照抄 |
| `decision/decision.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | governance/epistemic-label（DECISION 型別 + LOCKED_DECISION） | — | **BUILT（2026-08-29）**——以 Atlas §16.2 Decision Object 範例為主，補回 MP §53 額外欄位（risks/predictions） |
| `decision/reversal.schema.yaml` | 合併 Atlas 語言政策範例（`reversal_conditions: indicator/threshold/action`）+ Atlas §11.33（`reversal: indicator/condition/action/owner`）+ EC §88（`reversal: indicators[]/thresholds[]/owner/action`，複數陣列）三種形狀 | YAML (JSON Schema) | decision.schema.yaml | CROSS-T-12 | **BUILT（2026-08-29）**——EC 陣列形狀不完全能無損吸收 Atlas 雙語政策範例（每項可各自 action），改用 `oneOf` 雙形狀而非強行統一 |

### 2.5 `/specs/domain/`、`/specs/artifact/`、`/specs/security/`（Wave 2 — Tenant/CAS/個資）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `domain/tenant.schema.yaml` | Domain Model 第 23 物件；`tenant_id/legal_name/status/home_jurisdiction/data_residency_region/encryption_root_key_ref/created_at/deleted_at` | YAML (JSON Schema) | jurisdiction/context.schema.yaml, security/key-vault-lifecycle.schema.yaml | P1-CONFLICT-2, P1-DUP-3, P1-GAP-SEC-7（部分）（ADR-003a） | **BUILT（2026-08-29）** |
| `artifact/cas-path.schema.yaml` | Tenant-scoped CAS 路徑文法 `/objects/<tenant_id>/sha256/aa/bb/<hash>` + narrow 全域例外池的白名單機制 | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-CONFLICT-2（ADR-003b Option A + C） | **BUILT（2026-08-29）** |
| `execution/blast-radius-chain.schema.yaml` | Method Atlas §21 七層鏈（含 Branch）定為 canonical，`Tenant→Workspace→Project→Workflow→Branch→Execution→Capability` | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-DUP-3（ADR-003c） | **BUILT（2026-08-29）**——Branch 僅最小定義；完整 state machine 已於 2026-08-30 由 ADR-012 補建於 `workflow/branch.schema.yaml`（見下），本檔自身不重複收錄 |
| `workflow/branch.schema.yaml` **（新增）** | Branch 的完整狀態機（誰能 Merge、衝突處理） | YAML (JSON Schema) | blast-radius-chain.schema.yaml, authority.schema.yaml, risk-tier.schema.yaml, mandatory-gates.yaml, gate.schema.yaml, rollback.schema.yaml | ADR-003 Consequences 段明列的 follow-up (iii) | **BUILT（2026-08-30，`docs/adr/ADR-012-branch-merge-state-machine.md` 裁決）**——6 狀態機（ACTIVE/MERGE_REQUESTED/CONFLICT/MERGED/ABANDONED/ROLLED_BACK）；merge 授權門檻 >= A2；R3/R4 額外要求 `mandatory-gates.yaml` 兩條規則（引用 ADR-011 `gate_catalog`）皆 PASS；衝突一律由 `merge_base` 過期偵測，只能人工裁決（`resolution_rule_applied`，沿用 conflict-of-laws-output.schema.yaml 既有模式）。全系統零母文件先例，完全由本項目已裁決的 5 個既有機制組合而成，非憑空發明 |
| `security/personal-data-envelope.schema.yaml` | 個資欄位加密信封格式：`cipher_alg/kek_ref/dek_wrapped/iv/ciphertext/classification_tag` | YAML (JSON Schema) | domain/tenant.schema.yaml（`encryption_root_key_ref`） | P1-CONFLICT-1（ADR-002 Consequences 項 2） | **BUILT（2026-08-29）** |
| `security/key-vault-lifecycle.schema.yaml` | Per-subject DEK 生命週期：簽發/銷毀/Key Destruction Record | YAML (JSON Schema) | personal-data-envelope.schema.yaml | P1-CONFLICT-1（ADR-002 Consequences 項 1） | **BUILT（2026-08-29）**——已含 Codex 覆審新增的 restore-replay 強制關卡 + 備份副本銷毀範圍檢查 + ADR-007 `HMAC_SIGNING_KEY` 用途 |
| `security/log-redaction-token.schema.yaml` **（新增，ADR-007 追加，原表遺漏）** | v1 log 去識別化 token 格式：`token_alg/hmac_key_ref/classification_tag/tenant_scope` + `token` 本體，依附 key-vault-lifecycle 的 `HMAC_SIGNING_KEY` | YAML (JSON Schema) | security/key-vault-lifecycle.schema.yaml | P1-CONFLICT-3（ADR-007 規格缺口項 2） | **BUILT（2026-08-29）**——本列為本次補登，ADR-007 早於本表最後一次全面更新，此為文件同步缺口的訂正 |
| `domain/personal-data-redacted-event.schema.yaml` | `PersonalDataRedacted { subject_id, redacted_fields[], redacted_at, authorization_ref }` 稽核輔助事件 | YAML (JSON Schema) | key-vault-lifecycle.schema.yaml, governance/epistemic-label | P1-CONFLICT-1（ADR-002 Consequences 項 5） | **BUILT（2026-08-29）** |
| `execution/data-deletion.schema.yaml` **（新增）** | EC §31 Data Deletion Contract 新增分支：「個資刪除（crypto-shred）」與「一般 production row 刪除」兩種不同 Verification 定義 | YAML (JSON Schema) | key-vault-lifecycle.schema.yaml | P1-CONFLICT-1（ADR-002 Consequences 項 3） | **BUILT（2026-08-29）**——兩分支 Verification 語意不同（negative proof vs positive proof）+ Codex 覆審的兩種 Rollback 情境已納入 |
| `domain/repository-contract.schema.yaml` **（新增）** | MP §60「應用層透過 Repository Contract」全文僅此一句，補上實際 schema，解決 7 種異質儲存無 system-of-record 的問題 | YAML (JSON Schema) | cas-path.schema.yaml | P1-GAP-ARCH-2 | **BUILT（2026-08-29）**——原判定 SKELETON_ONLY 需要架構設計決策；發現 `docs/architecture/DATA_ARCHITECTURE_PLAN.md`（Status: PROPOSED）已對此做出完整、有憑有據的設計（§1-5），直接轉錄建成，額外解決 P1-GAP-ARCH-3/4/5/7/9。**已由 ADR-013（2026-08-30）批次追認**——逐欄位重新核對轉錄忠實，並修正一處獨立缺陷：`storage_engine_assignment` 原 `minItems/maxItems: 8` 與 `purpose` enum 實際 9 個值不一致，已訂正為 9 並補完整性防護 |
| `domain/capability-contract.schema.yaml` | 既有 Capability Contract（id/version/input/output/preconditions/quality/security/rollback）+ 補 edition/tier/entitlement 欄位 | YAML (JSON Schema) | method-execution-request.schema.yaml | P1-GAP-PROD-1 | **BUILT（2026-08-29）**——MP §8.3 唯一具體實例逐欄位轉譯（`worked_example` 驗證零額外欄位仍合法）；`entitlement`（editions_allowed/requires_explicit_entitlement_check/custom_capability）為 additive 新設計，未解決 P1-ASSUM-PROD-1 與 CONVERGENCE_MATRIX L30 的「該不該寫進母規格」疑慮，誠實留 open_questions；jurisdiction-scoped Capability Availability 不重複（見 jurisdiction/availability.schema.yaml） |
| `security/tenant-isolation-controls.schema.yaml` **（新增）** | RLS/schema-per-tenant vs shared-schema 決策、tenant-scoped 加密金鑰、跨租戶共用元件（Vector Index/Knowledge Graph）防洩漏機制 | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-GAP-SEC-7（ADR-003 Consequences follow-up (i)(ii)） | **BUILT（2026-08-29）**——原判定需要另一輪 ADR；發現 `DATA_ARCHITECTURE_PLAN.md` §6 已裁決（shared-schema+RLS 預設、schema-per-tenant 窄範圍例外、共用元件強制 tenant_id 過濾+RLS/fail-closed），同步修正 `SECURITY_THREAT_MODEL.md` I1/Ds1 兩處過期宣稱（該檔未交叉引用此設計）。**已由 ADR-013（2026-08-30）批次追認**——確認 ADR-003 本身明文排除這兩項 follow-up（非重複裁決），並發現本檔自身 description 對 I1/Ds1 交叉引用狀態的敘述已過期（SECURITY_THREAT_MODEL.md 早已補上引用），一併訂正 |

### 2.6 `/specs/jurisdiction/`（Wave 4）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `context.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | domain/tenant.schema.yaml（`home_jurisdiction`） | — | **BUILT（2026-08-29）** |
| `availability.schema.yaml` | Atlas Appendix A 既有承諾，7-status Capability Availability enum | YAML (JSON Schema) | context.schema.yaml | CROSS-T-21（casing 未定案：Title Case enum vs lowercase yaml 範例，Low-risk 直接統一為 lowercase） | **BUILT（2026-08-29）**——7 值統一為 lowercase snake_case（`allowed/restricted/human_review/local_only/government_only/prohibited/unknown`） |
| `pack.schema.yaml` **（新增）** | 定義 `Jurisdiction Pack`/`Applicable Pack`——EC 用了三次卻從未定義的核心構件 | YAML (JSON Schema) | availability.schema.yaml | DOC-execution_contract-5 | **BUILT（2026-08-29）**——formalize `GLOBAL_JURISDICTION_PLAN.md` 既有設計為正式 schema，非重新設計 |
| `conflict-of-laws-output.schema.yaml` **（新增）** | `/modules/jurisdiction/conflicts/` 路徑與 §98 Conflict-of-Laws Engine 的輸出格式與仲裁規則 | YAML (JSON Schema) | pack.schema.yaml | P1-GAP-LEGAL-4 | **BUILT（2026-08-29，2026-08-30 修正一處真實邏輯漏洞）**——formalize `GLOBAL_JURISDICTION_PLAN.md` §5（Status: PROPOSED）既有設計；`owning_component: const conflict_of_laws_engine` 解決「哪個元件擁有狀態」的歸屬模糊，MP §98 五值 status enum 逐字沿用（未改名）。**範圍邊界**：只決定軟體架構歸屬，不判定任何真實法律優先權——`status` 為 AMBIGUOUS/CONFLICT/LEGAL_REVIEW_REQUIRED 時強制 `human_counsel_ref` 非空，真正法律衝突一律轉交人類律師。**2026-08-30 真實 `/codex-review` 端到端測試 HIGH finding 並已修正**：原版 `conflicts_detected` 與 `status` 互不約束，一個 schema-valid instance 可以同時宣告 `DIRECT_CONTRADICTION` 又 `status: RESOLVED`；已補 3 條 `allOf`/`if`/`then`（RESOLVED⇒conflicts_detected 必空、conflicts_detected 非空⇒status 非 RESOLVED、CONFLICT⇒conflicts_detected 至少 1 筆），並補 2 條對應 invalid fixture。**未解決**：P1-DUP-6（MP §98 五值 vs MP §134 六值法律不確定性詞彙衝突，僅共享 AMBIGUOUS 一值）非本檔範圍，仍待獨立 Round 2 ADR 裁決，見 `specs/execution/status-codes.schema.yaml` 既有揭露。**原始 §5 轉錄忠實度已由 ADR-013（2026-08-30）批次追認**，`GLOBAL_JURISDICTION_PLAN.md` 本身仍維持 Status: PROPOSED |

### 2.7 `/methods/registry/`（Wave 3，Atlas Method Contract 相關）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `method-inventory.yaml` | 沿用 Phase 0 既有 289 條目編目（284 個正式 Atlas Method + lens/primitive 條目），升級為 Phase 3 正式 registry（非重新編目） | YAML | cognitive/method.schema.yaml | P1-GAP-AI-7（部分：清點已完成，schema 化未完成） | **BUILT（2026-08-29）**——289 條全數遷移，`has_contract:true` 獨立複核仍為 2 筆 |
| `contract-backlog.yaml` **（新增）** | 逐方法 `contract_status: complete\|pending\|in_mvp_slice` 追蹤表，見 §4 完整策略 | YAML | method-inventory.yaml, execution/status-codes.schema.yaml | P1-GAP-AI-7 | **BUILT（2026-08-29）**——Tier 0 僅列 4 個計畫明文點名的方法（非臆測 5-10 個清單）；Tier 1 依計畫指示留白待 Phase 5 切片定案；額外補上 ADR-008 明訂要求的 `finance.financial_assumptions` Tier 2 項目。**Tier 0 四份實際 contract 檔案已於同日補建**（`methods/contracts/{root_cause.fishbone,stakeholder.regulator,strategy.swot,evidence.triangulation}.contract.yaml`，皆通過 jsonschema 驗證），本表追蹤與實際檔案首次同步一致 |

### 2.8 `/recipes/validated/`（Wave 7）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `db-migration-expand-contract.recipe.yaml` | ADR-005a 裁決的 15 步序列（Schema Baseline→…→Close Rollback Window），機器可讀版本，人類權威版留在 EC §28 prose | YAML | execution/risk-tier.schema.yaml, execution/gate.schema.yaml（Backup/Restore Validation 等步驟掛 gate） | P1-DUP-1, OQ-12（ADR-005a） | **BUILT（2026-08-29）**——15 步全數轉譯自 ADR-005a「最終建議序列」；risk_tier: R3（risk-tier.schema.yaml 逐字列 DB migration 為範例）；3 個 `gate_ref` **RESOLVED（2026-08-30，ADR-011）**——已從 `TBD_PENDING_ROUND2_ADR` placeholder 換成真實 `gate.schema.yaml#/gate_catalog` id（Backup/Restore Validation → `recovery_rollback_rehearsal`、Reconciliation → `data`、Traffic Migration/Switch → `human_specialist_review`）；本列先前未同步，2026-08-30 doc-sync 稽核發現並修正 |
| `method-deprecation-retirement.recipe.yaml` | 對應 `execution/deprecation-pipeline.schema.yaml` 的機器可執行版本 | YAML | execution/deprecation-pipeline.schema.yaml | CROSS-T-19 | **BUILT（2026-08-29）**——7 步逐字轉譯自 deprecation-pipeline.schema.yaml，未新增規範內容；Usage Scan/Archive 的阻塞機制刻意不塞進 `gate_ref`（該欄位語意是 gate.schema.yaml 的 gate id，實際機制是 status-codes.schema.yaml 的 legal_side_state，兩者不同，見檔案自身 compilation_decisions） |
| `champion-challenger.recipe.yaml` | 統一 MP §71（僅模型）/ Atlas §24.2（模型+Method+Recipe）/ EC §37（模型+Method+Prompt+Recipe）適用範圍，建議採 EC 版（最完整） | YAML | method.schema.yaml | CROSS-T-20 | **BUILT（2026-08-29）**——採 EC 4 種適用範圍（Model/Method/Prompt/Recipe）；4 步 Shadow→Eval→Compare→Promote or Reject；MP 專屬的品質/成本/延遲升級判準已補入 mandatory_elements（非捨棄） |

### 2.9 `/policies/`（Wave 6 — 政策代碼化，多數需操作者決策內容）

| 目錄 | 涵蓋內容 | 狀態摘要 |
|---|---|---|
| `ai-execution/` | EC §91 既有 8 檔清單直接轉譯（authority/risk-tiers/mandatory-gates/tool-permissions/forbidden-actions/network-egress/exception-policy/release-policy），`mandatory-gates.yaml` 需套用 ADR-004a 的 R3∪R4 擴大規則 | **BUILT（2026-08-29，8/8 → 2026-08-30 三檔升級）**——`authority.yaml`/`risk-tiers.yaml`/`tool-permissions.yaml`/`forbidden-actions.yaml`/`exception-policy.yaml`/`network-egress.yaml` 為 `status: ACTIVE`；`mandatory-gates.yaml`/`release-policy.yaml` 由 `PROVISIONAL` 升級為 **`ACTIVE`（2026-08-30，ADR-011 裁決 OQ-10 後 gate_ref/scope 不再阻塞）**：`mandatory-gates.yaml` 補 `MGATE-R3-R4-RECOVERY-ROLLBACK` 第 2 條規則（`action` enum 新增 `REQUIRE_RECOVERY_REHEARSAL`）；`release-policy.yaml` 的 `release_gate_requirement.scope` 改為 `{always_required: gate_catalog.global, conditionally_required: mandatory-gates.yaml 規則}` 結構化物件。Critic 覆審（Wave 6 批次）：0 Critical、6 Major（已修正）、多項 Minor/Suggestion（已修正或記錄於各檔 `open_questions`）|
| `security/` | Zero Trust 協定選型（IdP/OIDC/SPIFFE/Cedar）、Supply Chain 標準版本（SBOM 格式/簽章機制/SLSA 等級） | **BUILT（2026-08-30，8/8 子決策全數批准）**——`docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（web-researcher 外部研究）逐項套用供應商支出判準後，`supply-chain-security.policy.yaml`（P1-GAP-SEC-2 全數 5 項，ADR-015）+ `zero-trust.policy.yaml`（P1-GAP-SEC-1 全數 3 項，ADR-016）建成 `status: ACTIVE`。IdP/OIDC provider 依 R0「取捨影響產品方向」正確保留給操作者後，操作者同日於對話中直接明示決定自架 **Zitadel**（`zero-trust.policy.yaml` `idp_provider.provider: Zitadel, deployment_model: self-hosted`），非 Claude 拍板，非文件收斂不足 |
| `privacy/` | crypto-shred 落地為可執行政策（依附 ADR-002）；PII redaction 現行時效 vs pseudonymization「未來能力」矛盾 | **BUILT（2026-08-29，`pii-redaction.policy.yaml`）**——ADR-007 定案內容（Deterministic Keyed-HMAC Tokenization + MP §149 v1_baseline/future_advanced 分級）已寫入 policy 檔；MP §149/EC §101-102 母文件本身文字仍待 ADR-006 `.ai/proposals/` 流程套用（僅操作者可推進 APPROVED），本 policy 檔為過渡期權威來源 |
| `jurisdiction/`（`policies/jurisdiction/legal-freshness-sla.policy.yaml`） | Legal Source Registry 更新 SLA（週期天數） | **BUILT（2026-08-30）**——操作者核准 `GLOBAL_JURISDICTION_PLAN.md` §2，CRITICAL/HIGH/MEDIUM/LOW 四級 30/90/180/365 天週期 + 寬限期 + 自動降級規則，解 P1-GAP-LEGAL-1。Conflict-of-Laws Engine 歸屬已於 §2.6 `specs/jurisdiction/conflict-of-laws-output.schema.yaml` 解決（2026-08-29），非本目錄範圍 |
| `provider/` | Model Registry 元件、AI Gateway Fallback circuit breaker 規則 | **BUILT（2026-08-29）**——`ai-gateway-fallback.policy.yaml`（P1-GAP-INFRA-5）+ `model-registry.policy.yaml`（P1-GAP-INFRA-6），逐字轉譯 `DEVOPS_SRE_PLAN.md`（Status: PROPOSED）§4/§5 數值門檻。**轉錄內容已由 ADR-013（2026-08-30）批次追認**（逐一常數重新核對來源忠實）；`DEVOPS_SRE_PLAN.md` 這份規劃文件本身仍維持 Status: PROPOSED 不變——ADR-013 批准的是「這兩個 policy 檔已忠實轉錄」，不是把整份規劃文件升格 |
| `release/` | Global/High-risk Gate 統一清單 | **內容裁決已由 ADR-011（2026-08-30）解除**（見 `specs/execution/gate.schema.yaml#/gate_catalog`）；此目錄本身（`policies/release/`）目前實際內容已建在 `policies/ai-execution/release-policy.yaml`（EC §91 指定路徑），是否需要另建 `policies/release/` 屬既有規劃遺留的目錄命名疑問，非本次 ADR-011 範圍，暫不新建空目錄 |

### 2.10 `/specs/analytics/`（低優先，Wave 8+）

僅列存在理由，不展開個別檔案：P1-GAP-PROD-7（成本追蹤無 tenant_id 歸屬）需要 `cost-record.schema.yaml` 補 `tenant_id/org_id`；因為與 MVP 垂直切片證明架構的目標關聯度低，建議排在 Phase 5 之後再做，本計畫僅登記不展開。

### 2.11 Phase 5 垂直切片前置規格（2026-08-30 新增，直接任務指定，非既有 Wave 排程產物）

`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` §4 列出的 Research Mode 切片前置需求，經逐項盤點後：6 項已存在（`tenant`/`risk-tier`/`epistemic-label`/`key-vault-lifecycle`/`cas-path`/`evidence.triangulation` contract）、4 項為命名/路徑誤判實為既有檔案（`execution-manifest`≡`manifest.schema.yaml`、`rollback-plan`≡`rollback.schema.yaml`、`execution/capability-contract`≡`domain/capability-contract.schema.yaml`、`execution/personal-data-redacted-event`≡`domain/personal-data-redacted-event.schema.yaml`），其餘真正缺失者當日建成：

| 檔案 | 狀態 |
|---|---|
| `specs/domain/knowledge-canvas.schema.yaml` | **BUILT** — MP §11/§11.1/§11.2，AI/Human 互動規則以 `allOf`/`if`/`then` 結構性強制（非僅文字） |
| `specs/artifact/portable-uri.schema.yaml` | **BUILT**（原誤建於 `specs/domain/artifact-uri.schema.yaml`，當日依 `cas-path.schema.yaml`/本表 L37 既有目錄慣例更正路徑）——MP §59 Portable Artifact URI |
| `specs/evidence/evidence-graph.schema.yaml` + `sentence-provenance.schema.yaml` | **BUILT** — MP §13.1/13.2/13.3，Entity/Relation 為此任務首次定義的最小形狀（此前全庫零 schema） |
| `specs/workflow/workflow-ir.schema.yaml` | **BUILT** — MP §9；同時解決 `recipe.schema.yaml` 既有 open question「Recipe 與 Workflow IR 是否同一物件」：Recipe=作者宣告意圖，Workflow IR=編譯後可執行節點圖 |
| `specs/execution/execution-state-machine.schema.yaml` | **BUILT** — EC §10 十四狀態序列 + 7 個既有 side-state（`$ref` `status-codes.schema.yaml`，非重複定義） |
| `specs/execution/audit.schema.yaml` | **BUILT** — 調和 MP §82（capability-run 指標）與 EC §66（決策敘事）兩種不同形狀為 `record_type` 判別聯集，非二選一 |
| `specs/execution/event-ledger.schema.yaml` | **BUILT** — MP §57 Event-native Architecture，`event_id` 不得重用（EC §27）獨立驗證屬實 |
| `policies/ai-execution/trusted-compute-gate.policy.yaml` | **BUILT** — 解 P1-GAP-AI-2；誠實揭露：無法偵測自由文字宣稱計算結果，僅結構性要求 `computation_provenance_marker` |
| `policies/privacy/data-deletion.policy.yaml` | **BUILT** — 薄封裝層，`$ref` 既有 `data-deletion.schema.yaml`/`key-vault-lifecycle.schema.yaml`；SLA 天數刻意留 `null`（母文件無具體數字，不發明） |
| `methods/contracts/research.qualitative_coding.contract.yaml` + `capabilities/contracts/run_statistics.capability.yaml` + `recipes/validated/research-qualitative-v1.recipe.yaml` | **BUILT** — 解 P1-GAP-AI-9/P1-GAP-AI-3；母文件無內容可轉錄，改為引用真實外部學術/統計標準（Strauss & Corbin 1990/1998 開放/主軸/選擇性編碼；Cohen 1960 Kappa 統計量；Landis & Koch 1977 判讀量表），專案專屬數值門檻（飽和度資料量、Kappa 接受門檻）留待操作者設定，不發明 |
| `capabilities/contracts/{transcribe,literature_search,artifact.generate_research_paper}.capability.yaml` + `specs/execution/capability-resolution.schema.yaml` + `status-codes.schema.yaml` 登記 `CAPABILITY_RESOLUTION_BLOCKED` | **BUILT（2026-09-04）** — ADR-023 §Consequences 1-3 的 spec-root 後續全數落地：`research-qualitative-v1` 的 4 個 capability ref 首次全部有 ACTIVE contract（golden test 2c 逐名釘死），runtime 計畫層驗證翻為 `executable: true`，plan-level BLOCKED 轉移（METHODS_RESOLVED → BLOCKED，trigger `CAPABILITY_RESOLUTION_BLOCKED`）同日接進 slice 並以突變測試證明會觸發；三份 contract 皆引真實母文件段落（MP §8.4 `AudioVideo → Transcript`、§9、§39/§40/§42/§56、EC §83 `OFFLINE_SOURCE_STALE`），typed-object 名稱與 `retrieve_evidence` 關係等未決項留 open_questions 不發明（見各檔 OQ-TRANSCRIBE-*/OQ-LITSEARCH-*/OQ-ARTIFACT-*） |

全數已通過 `tests/run_golden_tests.py`（835/835），對應 `tests/contracts/` fixture 已建。詳細決策依據見各檔案自身 `compilation_decisions`/`open_questions`。

---

## 3. Build Order

Wave 之間的依賴關係，不是任意排序：

```
Wave 0  操作者批准 ADR-001/004/005/006（治理與詞彙前提）── ✅ COMPLETE（2026-08-29，9 份 ADR 全數 ACCEPTED）
          ↓
Wave 1  specs/governance/epistemic-label.schema.yaml            ── ✅ BUILT
        specs/execution/{risk-tier, status-codes, manifest}.schema.yaml ── ✅ BUILT（全數 2026-08-29）
          ↓（Wave 2 與 Wave 3 可平行）
Wave 2 ── ✅ 核心完成（2026-08-29）           Wave 3 ── ✅ 核心完成（2026-08-29）
  specs/domain/tenant.schema.yaml ✅         specs/cognitive/{primitive,method,lens,
  specs/artifact/cas-path.schema.yaml ✅       representation,recipe,profile}.schema.yaml ✅
  specs/execution/blast-radius-chain.yaml ✅ specs/cognitive/{method-execution-request,
  specs/security/{personal-data-envelope,      typed-method-result}.schema.yaml ── 延後（依賴 Wave 5 task/result，未建）
    key-vault-lifecycle}.schema.yaml ✅       specs/cognitive/typed-objects/*.schema.yaml
  specs/security/log-redaction-token          ── 僅 3/13 節點已建（problem-statement/
    .schema.yaml ✅（ADR-007 追加）                cause-hypothesis-set/root-cause-fact）
  specs/domain/personal-data-redacted-        specs/cognitive/{rigor-level ✅,problem-type
    event.schema.yaml ✅                          ── 延後（依賴 method-resolution 循環）}
  specs/execution/data-deletion.schema.yaml ✅ specs/execution/method-resolution.schema.yaml ── 延後
  workflow/branch.schema.yaml ✅（ADR-012）    methods/registry/{method-inventory,
  domain/repository-contract.schema.yaml        contract-backlog}.yaml ✅
    ✅ BUILT（2026-08-29，本輪補齊——原判定 SKELETON_ONLY，
    發現 DATA_ARCHITECTURE_PLAN.md 已有完整設計，直接轉錄）
  domain/capability-contract.schema.yaml
    ── 延後（依賴 method-execution-request）
  security/tenant-isolation-controls.schema.yaml
    ✅ BUILT（2026-08-29，本輪補齊——原判定 BLOCKED_PENDING_ROUND2_ADR，
    發現 DATA_ARCHITECTURE_PLAN.md §6 已裁決，直接轉錄）
          ↓                                          ↓
Wave 4 ── ✅ 完成（2026-08-29）
  specs/evidence/{evidence,claim,assumption}.schema.yaml ✅
  specs/decision/{decision,reversal}.schema.yaml ✅
  specs/jurisdiction/{context,availability,pack,conflict-of-laws-output}.schema.yaml ✅
    （conflict-of-laws-output.schema.yaml 2026-08-29 建成，2026-08-30 由 ADR-013 批次追認轉錄忠實度）
  specs/execution/{normative-context,section-registry}.schema.yaml ✅
          ↓
Wave 5 ── ✅ 核心完成（2026-08-29）
  specs/execution/{task,current-state,authority,change-plan,rollback,
    exception,result,handoff,method-resolution,deprecation-pipeline}
    .schema.yaml ✅
  specs/execution/gate.schema.yaml ✅（2026-08-29 骨架 → 2026-08-30 完整，gate_id 由 TBD 升級為 gate_catalog，見 ADR-011）
  specs/execution/document-registry.schema.yaml ── 延後（依賴尚未建立的
    Architecture-Constitution-v1.md 這份新母文件，需先走 ADR-006 proposals 流程）
  specs/cognitive/{problem-type,method-execution-request,
    typed-method-result}.schema.yaml ✅（原 Wave 3 延後項目，Wave 5 補齊）
  specs/domain/capability-contract.schema.yaml ✅ BUILT（2026-08-29，本輪
    補齊——原 Wave 2/3 與 Wave 5 兩度延後項目，依賴的
    method-execution-request.schema.yaml 已完成後立即建置）
          ↓
Wave 6 ── ✅ 完成（2026-08-29，8/8）
  policies/ai-execution/{authority,risk-tiers,tool-permissions,
    forbidden-actions,exception-policy}.yaml ✅（status: ACTIVE）
  policies/ai-execution/{mandatory-gates,network-egress,release-policy}.yaml
    ✅（status: PROVISIONAL——結構已建，blocked 內容見各檔自身
    blocked_scope/allowlist_registry/release_gate_requirement.scope，
    非整檔阻塞）
    Critic 覆審（獨立於本輪撰寫者）：0 Critical、6 Major（已於同批修正：
    authority.yaml condition 未含 authority 前提子句 x2、coverage guard
    可繞過、MP §158 誤讀、3 處「未建」過期宣稱、EC 行號誤引、本表未同步）
          ↓
Wave 7 ── ✅ 完成（2026-08-29，3/3）
  recipes/validated/{db-migration-expand-contract,
    method-deprecation-retirement,champion-challenger}.recipe.yaml ✅
    （全數 status: ACTIVE；db-migration 的 3 個 gate_ref 原留
    TBD_PENDING_ROUND2_ADR placeholder，同 Wave 5/6 的 gate_id 阻塞範圍，
    當時不阻塞本檔案本身 —— **RESOLVED 2026-08-30 由 ADR-011**，3 個
    placeholder 已換成真實 gate_catalog id，見 §2.8 row）
          ↓
Wave 8 ── ✅ 完成（2026-08-29，55/55 schema + 3/3 recipe instance + 2/2
  registry + 12/12 EC §94 governance category + golden/）
  tests/run_golden_tests.py（單一 runner，四種檢查：schema conformance /
    recipe instance conformance / registry invariants / 跨檔 $ref 解析）
  tests/contracts/**（58 個 fixture 檔，鏡射 specs/+policies/ai-execution/
    路徑；method-resolution/status-codes/key-vault-lifecycle 各拆 2 檔）
  tests/governance/ai-execution/{12 個 EC §94 子目錄}/ + golden/（18 個
    fixture 檔；prompt-injection/secrets 兩類無對應 schema，誠實記錄為
    借用最近似機制，非真實該類別測試——見 WORKLOG）
  過程中發現並修正 3 個真實 bug（非本 Wave 新增，Wave 2/5/6 既有檔）：
    personal-data-envelope.schema.yaml 根層級 title/description 重複 key
    （PyYAML 靜默吃掉上層 provenance 內容）、gate.schema.yaml 與
    epistemic-label.schema.yaml 各有一條「constraints: 純文字未機讀化」
    （NOT_APPLICABLE 需 rationale、LOCKED_FACT 需 epistemic_type=SOURCE_FACT
    皆補上真 if/then）；change-plan.schema.yaml 的 if/then 誤縮排進
    alternatives_considered 陣列本身（對陣列而非物件根做 risk_tier 檢查，
    JSON Schema 對型別不符時 properties/required 視為真空通過，導致條件永
    遠觸發）在本 Wave 測試過程中由另一個並行 session 修正，已重新驗證
  specs/analytics/（低優先，可延後）
```

**為什麼 Wave 1 必須最先**：`risk_tier`、`epistemic_type/authorship_state`、`manifest` 三者被 Wave 2 以後**幾乎每一個** schema 引用（tenant 的 encryption_root_key_ref 稽核要記 epistemic label；每個 typed object 要記 provenance；每個 recipe 步驟要掛 risk gate）。先建這三個等於先建全系統的「型別字母表」，避免後續 40+ 個 schema 檔各自發明一套 risk/provenance 欄位又要重新收斂一次——這正是 Phase 0/1 找到的問題的成因，不能在 Phase 3 重演。

**為什麼 `gate.schema.yaml` / `release-policy.yaml` 曾卡住但不擋全局（2026-08-30 起已解除）**：CROSS-R-5/CROSS-R-7/CROSS-T-11（Global/High-risk Gate 清單本身 11 vs 14+6 items、命名漂移）原無 ADR 裁決，這不影響 Wave 1-4 的建置（它們不依賴 gate 清單內容），只影響 Wave 5 的 `gate.schema.yaml` 與 Wave 6 的 `release-policy.yaml`/`mandatory-gates.yaml`——先建這幾檔的骨架（欄位結構）、`gate_id` enum 留 `TBD_PENDING_ROUND2`，不阻塞其餘 30+ 個檔案的建置。**2026-08-30**：`docs/adr/ADR-011-platform-gate-ownership-and-unification.md` 裁決 OQ-10，三檔的 TBD 佔位已升級為實際值（見 `gate.schema.yaml#/gate_catalog`）。

---

## 4. Atlas Method Contract 補齊策略（P1-GAP-AI-7）

**現況**：Atlas 289 個方法/lens 條目中，僅 2 個 `has_contract: true`——`Fishbone / Ishikawa`（F05 root_cause，即 Atlas §9 自己拿來當範例的 `root_cause.fishbone`）與 `stakeholder.regulator lens`。其餘 287 個全用敘事型欄位，Method Selection Engine 的 Compatibility Check 在機制上無法對它們執行。

**不現實的方案（明確排除）**：一次性補齊全部 289 個方法的完整 contract。理由：(a) Phase 5 MVP Vertical Slice 選 Learning/Research/Business 三選一**尚未決定**（`Program Plan §9: NOT_STARTED`），在不知道哪條垂直切片會被驗證的情況下，全量補齊會產生大量永遠用不到的 contract；(b) 289 個方法逐一補齊需要的工作量遠超 Phase 3 的其餘交付物總和，會讓 Phase 3 變成「只做這一件事」，違反最小爆炸半徑。

**推薦方案 —— 三層漸進式補齊**：

1. **Tier 0（Phase 3 立即完成，≈5-10 個方法）**：已有 `has_contract:true` 的 2 個方法（Fishbone、stakeholder.regulator lens）先用新 `method.schema.yaml` 正式重寫（格式從舊有的簡化欄位升級為完整 schema），作為其餘所有 contract 撰寫的範本；另外補齊 Atlas 與 MP 全文反覆拿來當「這是怎麼用的」範例的方法（`root_cause.fishbone` 已含在內、`strategy.swot`、`evidence.triangulation`——三者在 Atlas §9/§24.1、MP §8.4 被多次引用為教學範例，若連範例本身都沒有真 contract，等於文件自證的示範是假的）。

2. **Tier 1（Phase 3 內，數量待 Phase 5 切片方向決定後鎖定，估計 15-25 個）**：Phase 5 尚未選定 Learning/Research/Business 哪條切片，但無論選哪條，Program Plan §9 定義的全鏈步驟（`Source→Ingest→Normalize→Knowledge→Human Contribution→Method Selection→Workflow→AI/Compute→Evidence→Artifact→Human Review→Version→Audit→Replay/Rollback`）中，`Method Selection`與`Workflow`兩步一定會呼叫到方法。建議 Phase 3 末期（Wave 3 收尾）由 Claude 與 Codex 各自列出「三條候選切片各自最可能用到的方法清單」交集，取交集內方法優先補 contract——這是 Program Plan §9 本來就要求的比較動作（「Claude 與 Codex 各自論證後比較」）的自然延伸，不是新流程。

3. **Tier 2（其餘 260+ 個方法，標記 `contract_status: pending`）**：`methods/registry/contract-backlog.yaml` 逐條記錄，**不阻塞 Phase 3 收尾**。搭配新增狀態碼 `PLANNING_BLOCKED_METHOD_CONTRACT_REQUIRED`（見 `execution/status-codes.schema.yaml`）：Method Selection Engine 若被要求選用一個 `contract_status: pending` 的方法，fail-closed 回傳此狀態碼並要求人類/後續 session 補 contract 後才能繼續——而不是靜默用敘事型欄位瞎猜相容性。這個設計沿用 Master Plan 自己已有的 `PLANNING_BLOCKED_METHOD_ATLAS_REQUIRED` 模式（同一類「缺前提就停」的不變量），不是發明新機制。

```yaml
# methods/registry/contract-backlog.yaml 記錄格式示意
- method_id: "root_cause.fishbone"
  contract_status: complete
  tier: 0
- method_id: "strategy.swot"
  contract_status: pending
  tier: 0
  note: "Atlas 多處拿來當教學範例，但目前僅有 method.swot.v1/v2/v3 版本化敘述，無結構化 contract"
- method_id: "association.mind_map"
  contract_status: pending
  tier: 2
```

**為什麼不現在就選 Tier 1 清單**：Program Plan §9 明文「Learning / Research / Business 三選一——選『最能驗證 architecture』而非功能最多，Claude 與 Codex 各自論證後比較」——這個比較尚未發生。本計畫若在此時武斷列出 15-25 個方法名單，等於越權替 Phase 5 做決定，違反 Phase 0-2 期間禁令。因此 Tier 1 清單本身列為 **Phase 3 內的一個顯式待辦**，而非本計畫直接產出的清單。

---

## 5. Open Questions

| # | 問題 | 阻塞範圍 | 建議處理方式 |
|---|---|---|---|
| MRSP-1 | Global/High-risk Gate 清單（CROSS-R-5/CROSS-R-7/CROSS-T-11）尚無 ADR 裁決，`gate.schema.yaml` 與 `release-policy.yaml` 無法定案內容 | Wave 5-6 兩個檔案 | **已解決（2026-08-30）**：`docs/adr/ADR-011-platform-gate-ownership-and-unification.md` 裁決 OQ-10——Master Plan 依其自身＋EC 自身的 Scoped Authority 表定為唯一 owner；內容為三方聯集（14 Global + 6 High-risk）；3 個 CROSS-T-11 命名採 Atlas 版本。`gate.schema.yaml`（`gate_catalog`）、`mandatory-gates.yaml`（新增 `MGATE-R3-R4-RECOVERY-ROLLBACK` 規則）、`release-policy.yaml`（`release_gate_requirement.scope` 結構化）三檔同批次更新，`status` 由 `PROVISIONAL` 升級為 `ACTIVE` |
| MRSP-2（2026-08-29 訂正：ADR 已定案，此列原文過期） | ~~P1-CONFLICT-3...P1-CONFLICT-4...尚無 ADR~~ → **P1-CONFLICT-3 已由 ADR-007 定案**（Deterministic Keyed-HMAC Tokenization，已建 `policies/privacy/pii-redaction.policy.yaml`）；**P1-CONFLICT-4 已由 ADR-008 定案**（MP §43 加註現況警語，不現在造 stub） | `policies/privacy/` 已建；MP §43 加註文字仍待 ADR-006 `.ai/proposals/` 流程套用到母文件本身（僅操作者可推進 APPROVED） | 兩個 ADR 裁決本身已完成，剩餘工作是母文件文字套用（治理流程步驟，非未決架構問題） |
| MRSP-3（2026-08-29 訂正：ADR 已定案，此列原文過期） | ~~P1-DUP-2...P1-DUP-5...尚無 ADR~~ → **兩者已由 ADR-009 定案**（三層命名各自維持正本 + 12×6×22 跨層對照表；Localization 正本 = `/platform/trust-fabric/localization/`） | `docs/architecture/` 敘事文件；`REPOSITORY_ARCHITECTURE.md`（`Status: PROPOSED`，ADR-009 的目錄配置依附此文件，該文件本身尚未 ACCEPTED） | ADR 裁決本身已完成；實際生效還多依賴一層——`REPOSITORY_ARCHITECTURE.md` 自己尚未走完 ACCEPTED 流程（ADR_INDEX.md 決策依賴關係第 23 行已註記此依賴） |
| MRSP-4 | `workflow/branch.schema.yaml`（Branch 完整 state machine）明列為 ADR-003 的 out-of-scope follow-up | `specs/workflow/` 一檔 | **已解決（2026-08-30）**：`docs/adr/ADR-012-branch-merge-state-machine.md` 裁決 6 狀態機 + merge 授權（>= A2）+ R3/R4 gate 要求（引用 ADR-011）+ 衝突一律人工裁決；`specs/workflow/branch.schema.yaml` 已建成 `status: ACTIVE`，19 個 fixture case 全過 |
| MRSP-5（2026-08-29 訂正：已建成，此列原文過期） | ~~`security/tenant-isolation-controls.schema.yaml`...非本輪已裁決範圍~~ → **已由 `DATA_ARCHITECTURE_PLAN.md` §6 裁決並建成**（shared-schema+RLS 預設、共用元件強制 tenant_id 過濾+RLS/fail-closed） | `specs/security/tenant-isolation-controls.schema.yaml` 已建 | 設計層級已完成；正式 ADR 批准仍待後續（見該檔 `OQ-TENANTISO-1`） |
| MRSP-6（2026-08-30 訂正：切片已選定，狀態部分解除）| ~~Tier 1 Method Contract 清單依賴 Phase 5 MVP 切片選擇，但 Phase 5 `Status: NOT_STARTED`~~ → **切片選擇本身已解除**：`docs/adr/ADR-014-phase-5-mode-selection-research.md`（ACCEPTED 2026-08-30）已批准 Research Mode 為 Phase 5 第一條垂直切片。**但一般性 15-25 個方法清單本身仍未產出**——Claude/Codex 候選切片常用方法交集比對這個動作本身尚未執行，`methods/registry/contract-backlog.yaml` 的 `tier_1.no_method_ids_listed: true` 因此維持不變，不因切片選定而自動視為已完成。**已具體交付的是該切片自己點名的第一個方法**：`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` §4（L105）明確要求的 `research.qualitative_coding` Method Contract，已建成 `methods/contracts/research.qualitative_coding.contract.yaml`（GROUNDED ORIGINAL DESIGN，解 P1-GAP-AI-9，Strauss & Corbin 1990/1998 開放/主軸/選擇性編碼 + Glaser & Strauss 1967 理論飽和度為外部學術依據），並登記為 `contract-backlog.yaml` 的 `tier_1.first_concrete_entry`（非一般性 15-25 清單的一部分，是該清單定案前，切片文件自己點名的個別項目，同一類「非依政策衍生、依明文要求登記」的機制，比照該檔案自身 `tier_2.explicit_entries` 的 `finance.financial_assumptions` 先例）。同任務並建成該方法的 Trusted-Compute-gated 統計能力契約 `capabilities/contracts/run_statistics.capability.yaml`（Cohen's Kappa + Landis & Koch 1977 判讀量表）與具體 Recipe 實例 `recipes/validated/research-qualitative-v1.recipe.yaml` | `methods/contracts/` 其餘 15-25 個檔案的具體名單（仍未產出，非本次任務範圍） | 一般性清單仍見 §4 建議：Phase 3 末期由 Claude/Codex 各自列候選切片常用方法交集，作為顯式待辦而非本計畫產出的清單；`research.qualitative_coding` 一項已具體完成，不等待該一般性交集比對流程 |
| MRSP-7 | 6 份 Round 1 ADR 全部 `Status: PROPOSED`，尚未經 Codex 獨立驗證，建議至少對 ADR-001/002 安排 Codex oracle 覆審 | 本計畫全部依賴 ADR 內容的項目（幾乎所有 Wave） | **已處理（2026-08-29）**：ADR-001/002 已完成 Codex 覆審並修正；9 份 ADR 全數 ACCEPTED（操作者授權）。ADR-003/005/006/009 仍未逐份覆審，風險相對低 |
| MRSP-8（2026-08-29 新增） | `rigor-level.schema.yaml` 的 `deep_intelligence` 該不該是 Atlas `required_rigor` 的原生第 5 值，或永遠只能是 `board_grade` + 附加維度層——這是真正的 enum 基數變更，比照 ADR-004 判準不應由 Phase 3 單方定案 | `specs/cognitive/rigor-level.schema.yaml`、未來任何依 `required_rigor` 觸發的 gate/policy 檔案 | 該 schema 已內建 `PROVISIONAL_PENDING_OPERATOR_SIGNOFF` 預設值（採 board_grade+附加層，與本計畫 §2.3 原始草稿方向一致）並在 `open_questions` 明確標註未定案；建議操作者決定是否併入 Round 2 ADR |
| MRSP-9（2026-08-29 新增） | `recipe.schema.yaml` 的 `id` 文法用 kebab-case slug，與 MP:812 既有的版本內嵌點號形式不一致，目前無 ADR 裁決 Recipe ID 文法（與 ADR-005b 已裁決的 Method ID 文法是兩件事） | `specs/cognitive/recipe.schema.yaml`、未來 `recipes/validated/` 目錄下的實際檔名 | 低風險，可與 MRSP-3（DUP-2/DUP-5 命名收斂）併入同一輪處理，或操作者另行裁決 |
| MRSP-10（2026-08-29 新增） | `key-vault-lifecycle.schema.yaml` 發現 ADR-002 檔案自身標頭仍寫 `Status: PROPOSED`，與 `ADR_INDEX.md` 登記的 `ACCEPTED` 不一致 | 無（純文件同步問題） | **已修正（2026-08-29）**：ADR-002 標頭已同步更新為 `ACCEPTED`，見 WORKLOG 對應條目 |
| MRSP-11（2026-08-29，Codex 覆審）| 4 個檔案（risk-tier/epistemic-label/rigor-level/representation）的實際內容放在具名子欄位下，檔案根本身不驗證任何東西——直接對檔案根做驗證的工具會誤放行任意值 | 上述 4 檔 | **已修正（2026-08-29）**：4 檔根層級各加一行 `$ref` 指向對應的主要型別（`#/risk_tier`、`#/provenance_record`、`#/rigor_mode`、`#/representation`），已用 jsonschema 實測確認根層級驗證正確拒絕非法值 |
| MRSP-12（2026-08-29，Codex 覆審）| `profile.schema.yaml` 的 `rigor` 欄位用鬆散字串而非真正 `$ref`，其 `compilation_decisions` 聲稱「全套件零跨檔 $ref」其實不實——同一批次的 `task.schema.yaml` 已有真正的 $ref 先例 | `specs/cognitive/profile.schema.yaml` | **已修正（2026-08-29）**：`rigor` 改為真正 `$ref` 指向 `rigor-level.schema.yaml#/rigor_mode`，已實測確認 `"board-grad"` 這類錯字現在會被正確拒絕 |
| MRSP-13（2026-08-29，Codex 覆審）| `method.schema.yaml` 的 `contract_provenance` 聲稱「型別化為 provenance_record」，實際卻是三個無約束字串——`epistemic_type: FACT`（非真實值）、`authorship_state: BOT`（非真實值）這類資料會通過驗證 | `specs/cognitive/method.schema.yaml` | **已修正（2026-08-29）**：改為真正 `$ref` 指向 `epistemic-label.schema.yaml#/provenance_record`（epistemic-label.schema.yaml 早在 Wave 1 就已建好，原本用軟參照沒有正當理由），已實測確認非法值現在會被拒絕 |
| MRSP-14（2026-08-29，Codex 覆審）| `contract-backlog.yaml` 的 Tier 2 定義自相矛盾：`policy` 段只說「從 method-inventory.yaml 衍生」，但 `explicit_entries` 又加了一筆 `finance.financial_assumptions`（該方法根本不在 method-inventory.yaml 裡）——依字面規則走的 compiler 會漏掉 ADR-008 要求的項目 | `methods/registry/contract-backlog.yaml` | **已修正（2026-08-29）**：`policy` 改為明確說明 Tier 2 = method-inventory.yaml 待完成項（284）∪ explicit_entries（1）之聯集，總數訂正為 285 |
| MRSP-15（2026-08-29，我方在驗證 MRSP-12 修正時獨立發現）| 自訂 URI scheme `ai-lego://` 不在 Python `urllib.parse` 的已知 scheme 清單中，導致相對路徑形式的 `$ref`（如 `"rigor-level.schema.yaml#/rigor_mode"`）無法正確解析——`urljoin` 會原樣回傳相對字串，不會拼接成完整 URI | 任何未來新增的跨檔 `$ref` | 全庫掃描確認：現有 40+ 個檔案的真正跨檔 `$ref` 全數已正確使用完整 `ai-lego://specs/...` 絕對形式（`task.schema.yaml` 是最早示範此形式的檔案），無其他檔案受影響；本次修正 MRSP-12 時一度誤用相對形式，已改正。**新規則（供未來建置遵循）**：跨檔 `$ref` 一律使用完整 `ai-lego://specs/<path>#/<key>` 形式，禁止相對檔名形式 |
| MRSP-16（2026-08-29，critic 覆審 MAJOR #5，事後自行修正兩輪）| 5 個檔案（current-state/data-deletion/deprecation-pipeline/handoff/manifest）的固定計數陣列只有 `minItems`，缺任何 identity 完整性檢查——N 份相同 step/dimension/checklist-item 條目可滿足 `minItems: N` 而完全遺漏其餘必填值 | 上述 5 檔 | **已修正並訂正（2026-08-29）**：第一輪加 `uniqueItems: true`，PoC 事後證明**該修法本身不足**——每個 item 除 identity 欄位外還帶自由文字欄位（summary/evidence_ref/note/file/version/sha256），只要那些欄位不同，N 個「identity 相同」的條目仍是 N 個「整體不同」的物件，可通過 uniqueItems。第二輪改用 `allOf` + 每個canonical值一組 `contains`/`minContains: 1`/`maxContains: 1`（Draft 2020-12），已用 jsonschema 4.26.0 對全部 5 檔的「同 identity 換其他欄位」規避案例實測確認正確拒絕。`data-deletion.schema.yaml` 另有一次更早的失敗嘗試（`prefixItems` 參照一個從未定義的 `#/definitions/deletion_step_entry`，屬懸空 $ref）已完整復原重寫，未殘留 |
| MRSP-17（2026-08-29，critic 覆審 MAJOR #6）| `method-resolution.schema.yaml` 的 `problem_type` 兩處內嵌 7 值 enum，其自身 `open_questions.OQ-mres-2` 早已言明「待 `cognitive/problem-type.schema.yaml` 建成後應升級為真正 $ref」——該檔已在後續 Wave 5B 由平行 session 建成，升級動作未跟進 | `specs/execution/method-resolution.schema.yaml` | **已修正（2026-08-29）**：兩處改為 `$ref: "ai-lego://specs/cognitive/problem-type.schema.yaml#/problem_type"`（13 值，7 原值的嚴格超集），`OQ-mres-2` 標記 RESOLVED，已用 jsonschema 對兩處實測確認新值（如 `incident`）通過、非法值被拒 |
| MRSP-18（2026-08-29，critic 覆審 MAJOR #2）| `log-redaction-token.schema.yaml` 缺根層級 `$ref`（與 MRSP-11 同類問題，該檔建成時間晚於 MRSP-11 修正批次，未同步套用），且範例 `token` 值為 63 位十六進位字元（少一位） | `specs/security/log-redaction-token.schema.yaml` | **已修正（2026-08-29）**：根層級加 `$ref: "#/definitions/log_redaction_token"`；範例 token 補至 64 位；已用 jsonschema 實測確認根層級驗證兩份範例皆通過、63 位字串被拒 |
| MRSP-19（2026-08-29，critic 覆審 MAJOR #3）| `typed-method-result.schema.yaml` 範例中 `authorship_state: "AI_DRAFTED"` 並非 `epistemic-label.schema.yaml` 的真實 enum 值，另一 `hash` 範例值為 63 位十六進位字元 | `specs/cognitive/typed-method-result.schema.yaml` | **已修正（2026-08-29）**：`AI_DRAFTED` 改為真實值 `AI_GENERATED`；hash 補至 64 位；已用完整跨檔 $ref 解析（epistemic-label + cas-path）對整份範例實測確認通過 |
| MRSP-20（2026-08-29，critic 覆審 MAJOR #7）| `method.schema.yaml` 兩處 `type: array` 欄位（`preconditions`/`forbidden_transition`）的 `examples:` 寫成裸字串而非陣列包裹，範例本身不代表該欄位的合法值形狀 | `specs/cognitive/method.schema.yaml` | **已修正（2026-08-29）**：兩處改為 `[["..."]]`（陣列中的一個範例，該範例本身是字串陣列） |
| MRSP-21（2026-08-29，critic 覆審 MINOR #8）| `exception.schema.yaml` 的 `required_authority_level` 因「`authority.schema.yaml` 尚未建成」的舊理由停留在無約束字串，該檔現已存在且 `authority_level` 節點已可信賴 | `specs/execution/exception.schema.yaml` | **已修正（2026-08-29）**：改為 `anyOf: [$ref → authority.schema.yaml#/authority_level, {type: "null"}]`，已用 jsonschema 實測確認 A0-A4 通過、`A9` 這類非法值被拒 |
| MRSP-22（2026-08-29，critic 覆審 MINOR #9，重新查證後修正方向與原建議不同）| `decision.schema.yaml` 的 `evidence_snapshot`/`assumptions` 因「`specs/evidence/` 尚未建成」的舊理由維持軟參照，該目錄現已存在（`evidence.schema.yaml`/`assumption.schema.yaml`） | `specs/decision/decision.schema.yaml` | **重新查證後刻意不改為硬 $ref（2026-08-29）**：實際檢查發現形狀真的不合——`evidence.schema.yaml` 要求 `evidence_id`+`provenance`，`assumption.schema.yaml` 要求 `id`+`statement`+`status`+`provenance`（完整治理型登記記錄），而本檔既有範例分別是 `{source, summary}` 臨時摘要物件與一句裸字串——硬 `$ref` 會讓現有合法範例直接驗證失敗。已更新兩處說明文字承認舊理由過時，並新增 `OQ-DECISION-3` 記錄「未來若要收緊，方向應是 `assumptions[]` 改存 `ASM-*` id 字串（輕量軟參照），而非整包硬 $ref」，非本次動作 |

**MINOR #11（`data-deletion.schema.yaml` 的 `pattern:` 鍵名與 JSON Schema `pattern` 關鍵字撞名）已修正**：改名 `transition_pattern:`（純文件區塊，從未被當驗證目標使用，零功能影響，純命名清晰度）；bughunt grep 確認全庫無其他引用。**MINOR #14（security/ 與 data-deletion 物件加 `additionalProperties: false`）刻意延後**：範圍橫跨多檔，且會改變「允許額外欄位」的既有寬鬆語意，風險/效益需獨立評估，不與本批次一起倉促處理，比照 MINOR #13（`definitions`→`$defs` 全庫改名）與 #15（examples 包裝慣例）同樣列為未來獨立批次的候選項，不視為遺漏。

**第二輪：對 MRSP-16~22 修正結果再跑一次獨立 critic 覆審**（不信任自己剛寫的敘述，逐檔重新機器驗證）——0 個 Critical（121 個 $ref 全數可解析、46 檔 YAML 全過、0 個範例驗證失敗），但抓到 3 個 Major，全數屬於同一類：**schema 本體已修正，但檔案裡解釋該欄位設計理由的散文（`compilation_decisions`/`description`/`verification`）還停留在修正前、以現在式聲稱依賴目標「尚不存在」**。逐一修正如下：

| MRSP-23（2026-08-29，第二輪 critic 覆審 MAJOR）| `exception.schema.yaml` 三處現在式聲稱 `authority.schema.yaml` 不存在（含 `verification.method`——即該檔自己的驗證證據段落，等於驗證紀錄本身作偽證） | `specs/execution/exception.schema.yaml:96-113`（`compilation_decisions`）、`:280-284`（欄位說明殘留半改動的「cannot yet see」子句）、`:374-381`（`verification.method`）| **已修正**：三處全數改為過去式敘述原始決策 + 附加「2026-08-29 已升級」現況說明；`source_of_truth_for` 補上 `authority.schema.yaml#/authority_level` 條目 |
| MRSP-24（2026-08-29，第二輪 critic 覆審 MAJOR）| `method-resolution.schema.yaml` 的 `problem_type` 欄位 `mapping_type` 仍寫 `SUPPLEMENT_REQUIRED`，但該檔自己的分類法（L74-79）定義「有 sibling schema 可 $ref 重用」該歸 `SUPPLEMENT_REQUIRED_VIA_EXISTING_SCHEMA`——這是**資料值錯誤**，不只是散文過期 | `specs/execution/method-resolution.schema.yaml:285`（`mapping_type` 值本身，行號至今未再位移）、`:88-117`（`compilation_decisions` 現在式敘述，行號至今未再位移）、`:850-854`（`verification.note` 仍寫「7 values」未提 13 值 $ref，2026-08-30 端到端測試修正後第 2 次位移，原引 `:600`→`:833-837`→現值）、`OQ-mres-2` 的 `owner`/`blocks` 欄位仍寫「待未來 session 遷移」| **已修正**：`mapping_type` 訂正為正確值（比照 `required_rigor` 同款情境）；`compilation_decisions` 改過去式並加現況指標；`verification.note` 更新為「13 值透過 $ref 呈現」；`OQ-mres-2` 的 owner/blocks 改為「已解決，無待辦」|
| MRSP-25（2026-08-29，第二輪 critic 覆審 MAJOR）| `decision.schema.yaml` 的 `outcome.review_task_ref` 描述聲稱 `execution/task.schema.yaml` 不存在（實際存在，`method-resolution.schema.yaml` 早已對它跑真正 $ref），且該描述引用「與上方 `evidence_snapshot` 同款告誡」——但 `evidence_snapshot` 的說明已在本輪改寫成形狀不合理由，此交叉引用已懸空 | `specs/decision/decision.schema.yaml:527-544`（欄位描述）、`:658-672`（`verification.method` 同款過期聲稱）| **已修正**：欄位改為 `^TASK-` id pattern（Decision Review Task 是任務實例參照，不是整包 task-context 物件，故非硬 $ref 而是收緊 pattern）+ 過去式敘述原始理由；`verification.method` 同步更新 |

**同一輪覆審另抓到 3 個 Minor（連帶修正，不留到下次）**：
- `manifest.schema.yaml`（m4）：`documents[]` 的「未來可無 schema 變更下新增第 5 份文件」聲稱經 PoC 證實為假——`document_id` 已是封閉 4 值 enum + 每值 `maxContains: 1`，今天就已完全鎖死第 5 筆的可能性，與 `maxItems` 有無無關；且引用的「`compilation_decisions` 內的擴充性理由」根本不存在（grep 確認）。已補 `maxItems: 4`（無害，僅為誠實一致）並重寫兩處聲稱為「新增第 5 份文件需三處協同修改（enum 值 + contains 區塊 + maxItems 調整），不是零成本」。
- `data-deletion.schema.yaml`（m5）：`transition_pattern:` 欄位的**值本身**混入了本輪改名的說明文字，污染了原本該欄位的 ADR 內容——搬到 `#` 註解，欄位值只留 ADR 衍生內容。
- `problem-type.schema.yaml`／`authority.schema.yaml`（m6）：兩檔與 MRSP-11/18 屬同一類「檔案根無型別約束」問題，只是建成時間晚於那兩輪修正批次未同步套用。已各自比照套上根層級 `$ref`（`#/problem_type`、`#/authority_level`），jsonschema 實測確認根層級驗證正確拒絕非法值。

**1 個 Suggestion 一併採納（s9）**：5 個 finding #5 檔案（current-state/data-deletion/deprecation-pipeline/manifest/handoff）的全部 71 個 `contains` 區塊補上 `required: [<identity欄位>]`（例：`contains: { required: [step], properties: { step: { const: "Deletion" } } }`）——目前靠 sibling `items.required` 間接保證，屬非局部安全性；補上後每個 `contains` 區塊自身即完整，不依賴其他欄位定義維持正確性。已用 script 批次套用（`re.sub` 精確比對既有格式，逐檔核對替換數＝預期數：20/10/7/4/30）並重新對全部 5 檔實測（含 handoff 的跨檔 `$ref` 解析）確認通過。

**明確不採納 / 延後**：s10（`data-deletion.schema.yaml` 的 `MRSP-dd-1` owner/blocks 過期，屬本輪修正範圍外的既有問題，非本次改動引入，留待下次一併處理）。

---

**驗證聲明（本次任務全程僅執行 Read/Grep/Bash，唯讀，未修改任何檔案）**：
- 六份 ADR 全文讀取確認（`docs/adr/ADR-001~006*.md` + `ADR_INDEX.md`）
- `AI_LEGO_OS_Program_Plan_v1.md` 全文讀取，§7 Phase 3 骨架逐字採用並標註差異
- `verified-findings.yaml`（1288 行全讀）與 `GAP_REGISTER.yaml`（454 行全讀）+ `CONFLICT_REGISTER.yaml`/`DUPLICATION_REGISTER.yaml` 全讀，逐條 finding ID 對照本計畫的 Spec Inventory 表
- Atlas Appendix A（L4574-4604）、EC §91/§92（L2750-2783）、EC §93-95（L2787-2842）逐段核對既有承諾的 14+13 個 schema 清單，本計畫的「新增」標記僅用於全庫零出現的型別，未重複列已承諾項目
- `method-inventory.yaml` grep 確認 `has_contract: true` 僅 2 筆，逐一核對其方法名稱（Fishbone / Ishikawa、stakeholder.regulator lens）
