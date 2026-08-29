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

**誠實聲明（避免自我隱藏缺口）**：GAP_REGISTER.yaml 51 條中，多數（P1-GAP-SEC-*／P1-GAP-INFRA-*／P1-GAP-PROD-* 等）是「完全空白」而非「重複定義衝突」——這類項目沒有既有內容可收斂，Phase 3 只能先建骨架/佔位 schema，實質內容需要操作者做工程/法遵決策（例如選 SBOM 格式、選 IdP 標準），不是靠讀三母文件就能推導。本計畫將這類項目標記為 `SKELETON_ONLY`，不假裝一次規劃能填滿。另有 4 條 CONFLICT（P1-CONFLICT-1~4）與 5 條 DUPLICATION（P1-DUP-1~5）中，**只有 P1-CONFLICT-1/2 與 P1-DUP-1/3 已有 ADR 裁決**（ADR-002/003/005）；P1-CONFLICT-3（PII redaction vs pseudonymization 時序矛盾）、P1-CONFLICT-4（Business Planning Recipe 引用不存在的方法）、P1-DUP-2（Plane/Module/Workspace 三套分解）、P1-DUP-5（Localization 目錄結構歧異）**尚無 ADR**——本計畫把它們相關的 spec 檔案標記 `BLOCKED_PENDING_ROUND2_ADR`，不越權替 Round 2 做裁決。

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
│   ├── security/         ← 多數 SKELETON_ONLY（P1-GAP-SEC-1/2）
│   ├── privacy/          ← crypto-shred 落地為政策；PII/pseudonymization 段 BLOCKED_PENDING_ROUND2_ADR
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
| `normative-context.schema.yaml` **（新增）** | 定義 `Section Registry`（EC L198）與 `Normative Context Bundle`（EC L204）結構，供 Task Execution Packet 的 `normative-context.yaml` 引用 | YAML (JSON Schema) | manifest.schema.yaml | CROSS-T-18 | READY（母文件僅提名詞，內容需 Phase 3 從零設計，非重複定義修正） |
| `method-resolution.schema.yaml` | Task Context → Method Atlas selection_context 的欄位映射表，補齊 `goal_type/problem_type/required_rigor/decision_criticality/evidence_available/uncertainty/time_horizon` 等 EC task_context 缺失欄位 | YAML (JSON Schema) | risk-tier.schema.yaml, cognitive/method.schema.yaml | CROSS-T-16 | READY |
| `task.schema.yaml` | EC §92 既有承諾，task_context 完整結構 | YAML (JSON Schema) | risk-tier, governance/epistemic-label | （沿用既有承諾，無單一 finding） | READY |
| `document-registry.schema.yaml` | EC §92 既有承諾，含三母文件 + Architecture Constitution 的 identity header 登記 | YAML (JSON Schema) | Architecture-Constitution-v1.md | OQ-1（identity header 缺失） | READY |
| `current-state.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | READY |
| `authority.schema.yaml` | EC §92 既有承諾，A0-A4 Autonomy/Authority Levels | YAML (JSON Schema) | governance/epistemic-label（locked 欄位需對照誰能改） | P1-GAP-SEC-6（人類角色↔A0-A4 對應，部分） | SKELETON_ONLY（人類職稱↔授權等級對應表全文空白，需操作者定義） |
| `change-plan.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | risk-tier | — | READY |
| `rollback.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | READY |
| `gate.schema.yaml` | EC §92 既有承諾，`gate_result.gate_id` 需要一份穩定 gate 清單 | YAML (JSON Schema) | risk-tier（R3∪R4 觸發規則） | 部分依 ADR-004a 可用；**Global/High-risk Gate 清單本身（14+6 vs 11+1）尚未裁決** | **BLOCKED_PENDING_ROUND2_ADR**（CROSS-R-5, CROSS-R-7, CROSS-T-11） |
| `exception.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | — | — | READY |
| `result.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | cognitive/typed-method-result.schema.yaml | CROSS-R-3（部分：result.schema.yaml 不等於 TypedMethodResult，見 2.3） | READY |
| `handoff.schema.yaml` | EC §92 既有承諾 | YAML (JSON Schema) | authority.schema.yaml | — | READY |
| `section-registry.schema.yaml` **（新增，若與 normative-context 分離設計）** | 若評估後 Section Registry 與 Normative Context Bundle 不宜合併為一檔，另立此檔 | YAML (JSON Schema) | normative-context.schema.yaml | CROSS-T-18（同上，二擇一實作細節） | READY |
| `deprecation-pipeline.schema.yaml` **（新增）** | 統一 Atlas §24.3（6 步）與 EC §113（7 步，多 Deadline）的方法/物件退場流程，採 EC 版（更完整，屬 Low-risk 事實性補全，非需要 ADR 裁決的取捨） | YAML (JSON Schema) | status-codes.schema.yaml | CROSS-T-19 | READY |

### 2.3 `/specs/cognitive/`（Wave 3 — Method Selection Engine 核心）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `primitive.schema.yaml` | Atlas Appendix A 既有承諾，24-primitive kernel 型別化（並收斂 `CAUSE_HYPOTHESIS/TRANSFORM/CLASSIFY/CONTEXTUALIZE/WEIGHT` 等超出 kernel 清單的用法） | YAML (JSON Schema) | — | DOC-method_atlas-2 | READY |
| `method.schema.yaml` | Atlas §9 LEGO Contract 正式 schema 化；`id` 欄位 pattern 鎖定 ADR-005b 裁決的 bare `<family>.<name>` 文法（`^[a-z_]+\.[a-z_]+$`），`version` 獨立欄位 | YAML (JSON Schema) | governance/epistemic-label（method 的 has_contract 狀態本身需要 provenance） | CROSS-T-14, DOC-method_atlas-1（ADR-005b） | READY |
| `lens.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | — | — | READY |
| `representation.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | — | — | READY |
| `recipe.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | method.schema.yaml | — | READY |
| `profile.schema.yaml` | Atlas Appendix A 既有承諾（rigor/mode profile） | YAML (JSON Schema) | rigor-level.schema.yaml | — | READY |
| `rigor-level.schema.yaml` **（新增）** | 補回 MP §84 五模式（Fast/Professional/Research Grade/Board Grade/**Deep Intelligence**）與 Atlas `required_rigor` 四值 enum 的映射，Deep Intelligence 定義為 board_grade + 額外 gate 組合 | YAML (JSON Schema) | governance/epistemic-label | CROSS-T-15 | READY（映射方式需操作者確認，屬 Medium-risk 語意決定，非純技術修正） |
| `problem-type.schema.yaml` **（新增）** | 統一 `selection_context.problem_type` enum 與 §10 Problem Type 路由表——把 Incident/Policy/Architecture/Security/DB Migration/Market Entry 補進 enum，exploratory/decision/operational 補上路由表對應列 | YAML (JSON Schema) | method-resolution.schema.yaml | DOC-method_atlas-5 | READY |
| `method-execution-request.schema.yaml` **（新增，全庫首次定義）** | `cognitive.execute_method` Capability Contract 的輸入型別；全三份文件目前僅 MP L708 提名、零定義 | YAML (JSON Schema) | method.schema.yaml, execution/task.schema.yaml | CROSS-R-3, CROSS-T-17, DOC-master_plan-6 | READY（無既有內容可沿用，需從 MP §8.3 呼叫語境反推欄位，屬新設計非修正） |
| `typed-method-result.schema.yaml` **（新增，全庫首次定義）** | 同上契約的輸出型別 | YAML (JSON Schema) | execution/result.schema.yaml | CROSS-R-3, CROSS-T-17, DOC-master_plan-6 | READY（同上） |
| `typed-objects/problem-statement.schema.yaml` **（新增）** | 含 `status` enum（引用處要求 `validated` 狀態值，但全文從未定義完整 enum） | YAML (JSON Schema) | — | DOC-method_atlas-9, DOC-method_atlas-7 | READY（需新設計） |
| `typed-objects/cause-hypothesis-set.schema.yaml` **（新增）** | §14.1 型別鏈節點 | YAML (JSON Schema) | root-cause-fact（見下） | DOC-method_atlas-7 | READY（新設計） |
| `typed-objects/root-cause-fact.schema.yaml` **（新增）** | 統一 `FinalCausalFact`/`RootCauseFact`/`Root Cause Fact`/`RootCauseAssessment` 四個名稱為單一型別 + 單一 canonical name（建議採 `RootCauseFact`，其餘三個列為 deprecated alias） | YAML (JSON Schema) | governance/epistemic-label（此型別的提升規則直接對應 FACT 紅線） | DOC-method_atlas-3 | READY（命名裁決屬 Low-risk，可在 Phase 3 內部直接定案，不需 ADR） |
| `typed-objects/knowledge-set.schema.yaml` / `swot-analysis.schema.yaml` / `strategy-options.schema.yaml` / `decision-candidate.schema.yaml` / `human-decision.schema.yaml` / `perspective-assessment.schema.yaml` / `board-decision-pack.schema.yaml` / `idea-set.schema.yaml` / `cluster-set.schema.yaml` / `preliminary-priority.schema.yaml` **（新增，共 10 檔）** | §14.1 型別相容性鏈其餘節點；Atlas §16 目前只定義 Idea/Decision/MethodExecution 三種，這 10+ 種完全無 schema | YAML (JSON Schema，逐檔獨立） | 依鏈上下游互相依賴（見 Build Order Wave 3） | DOC-method_atlas-7 | READY（新設計；優先序見 §4 Wave 3，建議先做 MVP 垂直切片實際會用到的節點，見 §5） |

### 2.4 `/specs/evidence/` 與 `/specs/decision/`（Wave 4 — 知識平面）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `evidence/evidence.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | governance/epistemic-label | — | READY |
| `evidence/claim.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | evidence.schema.yaml | — | READY |
| `evidence/assumption.schema.yaml` | 合併 MP §24（type/evidence_strength/confidence/validation_method）+ EC §116（evidence[]/validation/owner）+ Atlas F10（ID/statement/type/evidence/confidence/validation/status/owner，欄位最完整）三種形狀，建議採 Atlas F10 版為底 | YAML (JSON Schema) | claim.schema.yaml | CROSS-T-13 | READY（Low-risk 事實性合併：三形狀是子集關係非互斥取捨，可直接取聯集） |
| `decision/decision.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | governance/epistemic-label（DECISION 型別 + LOCKED_DECISION） | — | READY |
| `decision/reversal.schema.yaml` | 合併 Atlas 語言政策範例（`reversal_conditions: indicator/threshold/action`）+ Atlas §11.33（`reversal: indicator/condition/action/owner`）+ EC §88（`reversal: indicators[]/thresholds[]/owner/action`，複數陣列）三種形狀 | YAML (JSON Schema) | decision.schema.yaml | CROSS-T-12 | READY（同上，聯集式合併：建議採 EC 複數陣列形狀為底，因唯一支援多指標場景） |

### 2.5 `/specs/domain/`、`/specs/artifact/`、`/specs/security/`（Wave 2 — Tenant/CAS/個資）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `domain/tenant.schema.yaml` | Domain Model 第 23 物件；`tenant_id/legal_name/status/home_jurisdiction/data_residency_region/encryption_root_key_ref/created_at/deleted_at` | YAML (JSON Schema) | jurisdiction/context.schema.yaml, security/key-vault-lifecycle.schema.yaml | P1-CONFLICT-2, P1-DUP-3, P1-GAP-SEC-7（部分）（ADR-003a） | READY |
| `artifact/cas-path.schema.yaml` | Tenant-scoped CAS 路徑文法 `/objects/<tenant_id>/sha256/aa/bb/<hash>` + narrow 全域例外池的白名單機制 | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-CONFLICT-2（ADR-003b Option A + C） | READY |
| `execution/blast-radius-chain.schema.yaml` | Method Atlas §21 七層鏈（含 Branch）定為 canonical，`Tenant→Workspace→Project→Workflow→Branch→Execution→Capability` | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-DUP-3（ADR-003c） | READY（Branch 完整 state machine 為 follow-up，見下方 workflow/branch.schema.yaml） |
| `workflow/branch.schema.yaml` **（新增）** | Branch 的完整狀態機（誰能 Merge、衝突處理） | YAML (JSON Schema) | blast-radius-chain.schema.yaml | ADR-003 Consequences 段明列的 follow-up (iii) | **BLOCKED**（ADR-003 明文標記為 out-of-scope follow-up，非本輪 ADR 已裁決範圍；Phase 3 應先只實作最小定義，完整 state machine 排入 Round 2） |
| `security/personal-data-envelope.schema.yaml` | 個資欄位加密信封格式：`cipher_alg/kek_ref/dek_wrapped/iv/ciphertext/classification_tag` | YAML (JSON Schema) | domain/tenant.schema.yaml（`encryption_root_key_ref`） | P1-CONFLICT-1（ADR-002 Consequences 項 2） | READY |
| `security/key-vault-lifecycle.schema.yaml` | Per-subject DEK 生命週期：簽發/銷毀/Key Destruction Record | YAML (JSON Schema) | personal-data-envelope.schema.yaml | P1-CONFLICT-1（ADR-002 Consequences 項 1） | READY |
| `domain/personal-data-redacted-event.schema.yaml` | `PersonalDataRedacted { subject_id, redacted_fields[], redacted_at, authorization_ref }` 稽核輔助事件 | YAML (JSON Schema) | key-vault-lifecycle.schema.yaml, governance/epistemic-label | P1-CONFLICT-1（ADR-002 Consequences 項 5） | READY |
| `execution/data-deletion.schema.yaml` **（新增）** | EC §31 Data Deletion Contract 新增分支：「個資刪除（crypto-shred）」與「一般 production row 刪除」兩種不同 Verification 定義 | YAML (JSON Schema) | key-vault-lifecycle.schema.yaml | P1-CONFLICT-1（ADR-002 Consequences 項 3） | READY |
| `domain/repository-contract.schema.yaml` **（新增）** | MP §60「應用層透過 Repository Contract」全文僅此一句，補上實際 schema，解決 7 種異質儲存無 system-of-record 的問題 | YAML (JSON Schema) | cas-path.schema.yaml | P1-GAP-ARCH-2 | SKELETON_ONLY（system-of-record 策略、跨儲存 reconciliation 機制需要架構設計決策，非 schema 撰寫可獨立解決） |
| `domain/capability-contract.schema.yaml` | 既有 Capability Contract（id/version/input/output/preconditions/quality/security/rollback）+ 補 edition/tier/entitlement 欄位 | YAML (JSON Schema) | method-execution-request.schema.yaml | P1-GAP-PROD-1 | READY（新增欄位為 additive，非破壞既有結構） |
| `security/tenant-isolation-controls.schema.yaml` **（新增）** | RLS/schema-per-tenant vs shared-schema 決策、tenant-scoped 加密金鑰、跨租戶共用元件（Vector Index/Knowledge Graph）防洩漏機制 | YAML (JSON Schema) | domain/tenant.schema.yaml | P1-GAP-SEC-7（ADR-003 Consequences follow-up (i)(ii)） | **BLOCKED_PENDING_ROUND2_ADR**（ADR-003 只解決存儲層 CAS 部分，relational 資料的 RLS 設計是明列的獨立 follow-up，需要另一輪決策） |

### 2.6 `/specs/jurisdiction/`（Wave 4）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `context.schema.yaml` | Atlas Appendix A 既有承諾 | YAML (JSON Schema) | domain/tenant.schema.yaml（`home_jurisdiction`） | — | READY |
| `availability.schema.yaml` | Atlas Appendix A 既有承諾，7-status Capability Availability enum | YAML (JSON Schema) | context.schema.yaml | CROSS-T-21（casing 未定案：Title Case enum vs lowercase yaml 範例，Low-risk 直接統一為 lowercase） | READY |
| `pack.schema.yaml` **（新增）** | 定義 `Jurisdiction Pack`/`Applicable Pack`——EC 用了三次卻從未定義的核心構件 | YAML (JSON Schema) | availability.schema.yaml | DOC-execution_contract-5 | READY（新設計） |
| `conflict-of-laws-output.schema.yaml` **（新增）** | `/modules/jurisdiction/conflicts/` 路徑與 §98 Conflict-of-Laws Engine 的輸出格式與仲裁規則 | YAML (JSON Schema) | pack.schema.yaml | P1-GAP-LEGAL-4 | **BLOCKED_PENDING_ROUND2_ADR**（兩個機制哪個該贏尚未裁決，非單純缺 schema） |

### 2.7 `/methods/registry/`（Wave 3，Atlas Method Contract 相關）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `method-inventory.yaml` | 沿用 Phase 0 既有 289 條目編目（284 個正式 Atlas Method + lens/primitive 條目），升級為 Phase 3 正式 registry（非重新編目） | YAML | cognitive/method.schema.yaml | P1-GAP-AI-7（部分：清點已完成，schema 化未完成） | READY（遷移既有檔案，非新建內容） |
| `contract-backlog.yaml` **（新增）** | 逐方法 `contract_status: complete\|pending\|in_mvp_slice` 追蹤表，見 §4 完整策略 | YAML | method-inventory.yaml, execution/status-codes.schema.yaml | P1-GAP-AI-7 | READY |

### 2.8 `/recipes/validated/`（Wave 7）

| 檔名 | 用途 | 格式 | 依賴 | 解決的 Finding | 狀態 |
|---|---|---|---|---|---|
| `db-migration-expand-contract.recipe.yaml` | ADR-005a 裁決的 15 步序列（Schema Baseline→…→Close Rollback Window），機器可讀版本，人類權威版留在 EC §28 prose | YAML | execution/risk-tier.schema.yaml, execution/gate.schema.yaml（Backup/Restore Validation 等步驟掛 gate） | P1-DUP-1, OQ-12（ADR-005a） | READY（`gate.schema.yaml` 若尚未定案，本檔的 gate 掛鉤欄位先留 placeholder） |
| `method-deprecation-retirement.recipe.yaml` | 對應 `execution/deprecation-pipeline.schema.yaml` 的機器可執行版本 | YAML | execution/deprecation-pipeline.schema.yaml | CROSS-T-19 | READY |
| `champion-challenger.recipe.yaml` | 統一 MP §71（僅模型）/ Atlas §24.2（模型+Method+Recipe）/ EC §37（模型+Method+Prompt+Recipe）適用範圍，建議採 EC 版（最完整） | YAML | method.schema.yaml | CROSS-T-20 | READY（Low-risk 聯集式合併） |

### 2.9 `/policies/`（Wave 6 — 政策代碼化，多數需操作者決策內容）

| 目錄 | 涵蓋內容 | 狀態摘要 |
|---|---|---|
| `ai-execution/` | EC §91 既有 8 檔清單直接轉譯（authority/risk-tiers/mandatory-gates/tool-permissions/forbidden-actions/network-egress/exception-policy/release-policy），`mandatory-gates.yaml` 需套用 ADR-004a 的 R3∪R4 擴大規則 | READY（`release-policy.yaml` 內容依附 `gate.schema.yaml`，見上方 BLOCKED 註記） |
| `security/` | Zero Trust 協定選型（IdP/OIDC/SPIFFE/OPA）、Supply Chain 標準版本（SBOM 格式/簽章機制/SLSA 等級） | SKELETON_ONLY（P1-GAP-SEC-1, P1-GAP-SEC-2 全文空白，需操作者選型，非文件收斂） |
| `privacy/` | crypto-shred 落地為可執行政策（依附 ADR-002）；PII redaction 現行時效 vs pseudonymization「未來能力」矛盾 | 部分 READY（crypto-shred 段）+ 部分 **BLOCKED_PENDING_ROUND2_ADR**（P1-CONFLICT-3 尚無 ADR） |
| `jurisdiction/` | Legal Source Registry 更新 SLA（週期天數）、Conflict-of-Laws Engine 歸屬 | SKELETON_ONLY / BLOCKED（P1-GAP-LEGAL-1 需操作者訂週期數字；P1-GAP-LEGAL-4 同 2.6） |
| `provider/` | Model Registry 元件、AI Gateway Fallback circuit breaker 規則 | SKELETON_ONLY（P1-GAP-INFRA-5, P1-GAP-INFRA-6） |
| `release/` | Global/High-risk Gate 統一清單 | **BLOCKED_PENDING_ROUND2_ADR**（同 gate.schema.yaml） |

### 2.10 `/specs/analytics/`（低優先，Wave 8+）

僅列存在理由，不展開個別檔案：P1-GAP-PROD-7（成本追蹤無 tenant_id 歸屬）需要 `cost-record.schema.yaml` 補 `tenant_id/org_id`；因為與 MVP 垂直切片證明架構的目標關聯度低，建議排在 Phase 5 之後再做，本計畫僅登記不展開。

---

## 3. Build Order

Wave 之間的依賴關係，不是任意排序：

```
Wave 0  操作者批准 ADR-001/004/005/006（治理與詞彙前提）── ✅ COMPLETE（2026-08-29，9 份 ADR 全數 ACCEPTED）
          ↓
Wave 1  specs/governance/epistemic-label.schema.yaml            ── ✅ BUILT
        specs/execution/{risk-tier, status-codes, manifest}.schema.yaml ── ✅ BUILT（全數 2026-08-29）
          ↓（Wave 2 與 Wave 3 可平行）
Wave 2                                    Wave 3
  specs/domain/tenant.schema.yaml           specs/cognitive/{primitive,method,lens,
  specs/artifact/cas-path.schema.yaml         representation,recipe,profile}.schema.yaml
  specs/execution/blast-radius-chain.yaml   specs/cognitive/{method-execution-request,
  specs/security/{personal-data-envelope,     typed-method-result}.schema.yaml
    key-vault-lifecycle}.schema.yaml        specs/cognitive/typed-objects/*.schema.yaml
  specs/domain/personal-data-redacted-      specs/cognitive/{rigor-level,problem-type}
    event.schema.yaml                         .schema.yaml
  specs/execution/data-deletion.schema.yaml specs/execution/method-resolution.schema.yaml
                                             methods/registry/{method-inventory,
                                               contract-backlog}.yaml
          ↓                                          ↓
Wave 4  specs/evidence/{evidence,claim,assumption}.schema.yaml
        specs/decision/{decision,reversal}.schema.yaml
        specs/jurisdiction/{context,availability,pack}.schema.yaml
        specs/execution/{normative-context,section-registry}.schema.yaml
          ↓
Wave 5  specs/execution/ 其餘檔（task/document-registry/current-state/authority/
          change-plan/rollback/exception/result/handoff）
        specs/execution/gate.schema.yaml            ← BLOCKED，先建骨架等 Round 2
          ↓
Wave 6  policies/ 全目錄（依附 Wave 1-5 的 schema 做代碼化）
          ↓
Wave 7  recipes/validated/ 全目錄
          ↓
Wave 8  tests/ 全目錄（對 Wave 1-7 的每個 schema 寫 golden test）
        specs/analytics/（低優先，可延後）
```

**為什麼 Wave 1 必須最先**：`risk_tier`、`epistemic_type/authorship_state`、`manifest` 三者被 Wave 2 以後**幾乎每一個** schema 引用（tenant 的 encryption_root_key_ref 稽核要記 epistemic label；每個 typed object 要記 provenance；每個 recipe 步驟要掛 risk gate）。先建這三個等於先建全系統的「型別字母表」，避免後續 40+ 個 schema 檔各自發明一套 risk/provenance 欄位又要重新收斂一次——這正是 Phase 0/1 找到的問題的成因，不能在 Phase 3 重演。

**為什麼 `gate.schema.yaml` / `release-policy.yaml` 卡住不擋全局**：CROSS-R-5/CROSS-R-7/CROSS-T-11（Global/High-risk Gate 清單本身 11 vs 14+6 items、命名漂移）尚無 ADR 裁決。這不影響 Wave 1-4 的建置（它們不依賴 gate 清單內容），只影響 Wave 5 的 `gate.schema.yaml` 與 Wave 6 的 `release-policy.yaml`——可以先建這兩檔的骨架（欄位結構）、`gate_id` enum 留 `TBD_PENDING_ROUND2`，不阻塞其餘 30+ 個檔案的建置。

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
| MRSP-1 | Global/High-risk Gate 清單（CROSS-R-5/CROSS-R-7/CROSS-T-11）尚無 ADR 裁決，`gate.schema.yaml` 與 `release-policy.yaml` 無法定案內容 | Wave 5-6 兩個檔案 | 建議操作者將此列為 Round 2 ADR 的第一項；Phase 3 先建骨架，`gate_id` enum 留 placeholder |
| MRSP-2 | P1-CONFLICT-3（PII redaction v1 生效 vs pseudonymization「未來能力」）、P1-CONFLICT-4（Business Planning Recipe 引用不存在的 Financial Assumptions 方法）尚無 ADR | `policies/privacy/` 部分內容；MP §43 旗艦 Recipe 是否可信任 | 同上，建議併入 Round 2 ADR batch；P1-CONFLICT-4 額外建議：在 Round 2 ADR 前，MP §43 的 Recipe 範例應加註「僅示意，Financial Assumptions 方法尚待 Atlas finance domain pack 補齊」，避免誤導 |
| MRSP-3 | P1-DUP-2（Plane/Module/Workspace 三套分解）、P1-DUP-5（Localization 目錄結構歧異）尚無 ADR | `docs/architecture/` 敘事文件；`/config/localization/` vs `/modules/localization/` 路徑歸屬 | 兩者皆屬「路徑/命名對照表缺失」而非邏輯矛盾，風險低於 MRSP-1/2，可視操作者時間排入 Round 2 或標記為 Low-risk 直接由 Phase 3 執行者建對照表解決 |
| MRSP-4 | `workflow/branch.schema.yaml`（Branch 完整 state machine）明列為 ADR-003 的 out-of-scope follow-up | `specs/workflow/` 一檔 | Phase 3 只實作 ADR-003 給的最小定義（forked isolated execution lineage），完整 state machine 排入 Round 2 或 Phase 4 |
| MRSP-5 | `security/tenant-isolation-controls.schema.yaml`（RLS/schema-per-tenant 決策）同樣是 ADR-003 明列的 follow-up，非本輪已裁決範圍 | `specs/security/` 一檔 | 同上，Phase 3 建骨架欄位，不填入未裁決的 RLS 策略選擇 |
| MRSP-6 | Tier 1 Method Contract 清單依賴 Phase 5 MVP 切片選擇，但 Phase 5 `Status: NOT_STARTED` | `methods/contracts/` 15-25 個檔案的具體名單 | 見 §4 建議：Phase 3 末期由 Claude/Codex 各自列候選切片常用方法交集，作為顯式待辦而非本計畫產出的清單 |
| MRSP-7 | 6 份 Round 1 ADR 全部 `Status: PROPOSED`，尚未經 Codex 獨立驗證，建議至少對 ADR-001/002 安排 Codex oracle 覆審 | 本計畫全部依賴 ADR 內容的項目（幾乎所有 Wave） | 本計畫的 Build Order 假設 ADR-001/004/005/006 最終被批准（可能經 Codex 覆審後有微調）；若覆審後任一 ADR 的建議方案改變，對應 Wave 的檔案需要重新核對，不是本計畫的錯誤，是上游決策尚未定案的自然結果 |

---

**驗證聲明（本次任務全程僅執行 Read/Grep/Bash，唯讀，未修改任何檔案）**：
- 六份 ADR 全文讀取確認（`docs/adr/ADR-001~006*.md` + `ADR_INDEX.md`）
- `AI_LEGO_OS_Program_Plan_v1.md` 全文讀取，§7 Phase 3 骨架逐字採用並標註差異
- `verified-findings.yaml`（1288 行全讀）與 `GAP_REGISTER.yaml`（454 行全讀）+ `CONFLICT_REGISTER.yaml`/`DUPLICATION_REGISTER.yaml` 全讀，逐條 finding ID 對照本計畫的 Spec Inventory 表
- Atlas Appendix A（L4574-4604）、EC §91/§92（L2750-2783）、EC §93-95（L2787-2842）逐段核對既有承諾的 14+13 個 schema 清單，本計畫的「新增」標記僅用於全庫零出現的型別，未重複列已承諾項目
- `method-inventory.yaml` grep 確認 `has_contract: true` 僅 2 筆，逐一核對其方法名稱（Fishbone / Ishikawa、stakeholder.regulator lens）
