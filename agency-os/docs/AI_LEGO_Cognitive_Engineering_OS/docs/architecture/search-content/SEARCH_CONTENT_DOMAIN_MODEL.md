# SearchContent Domain Model

**Document ID:** `search-content.domain-model`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_DOMAIN_MODEL.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 SearchContent vertical 的 object model、aggregate、reference、state machine、cardinality 與 invariants；所有 Core object 僅引用、不複製。

**直接依賴：**
- `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md`
- `ADR-021-search-content-boundary-and-ownership.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Aggregate Map

```text
SearchSourceProfile ──source_ref──────────────► Core Source (dependency)
        │
        └── produces/searches
                ▼
SearchQuery ──► SearchSnapshot ──► SearchObservation
                                  ├─► CompetitorObservation
                                  ├─► AIAnswerObservation
                                  ├─► CitationObservation
                                  └─► RankingObservation

SearchObservation + Core Evidence/Claim
                ▼
             TopicCluster
                ▼
             ContentBrief ──evidence_pack_ref──► EvidencePack snapshot
                │
                ▼
        Core Artifact (artifact_ref)
                │
                ▼
        ContentPublication
                │
                ▼
        ContentPerformance
                │
                ▼
        DecayObservation  (measurement.content_decay_detection MethodResult, §2.16)
                │ trigger_refs
                ▼
          RefreshContext ──decision_ref────────► Core Decision
```

## 2. Object Contracts

### 2.1 SearchSourceProfile

```yaml
search_source_profile:
  id:
  tenant_ref:
  workspace_ref:
  source_ref:          # opaque Core Source reference
  search_domains: []
  platforms: []
  markets: []
  locales: []
  ingestion_modes: []
  crawl_policy_ref:
  authority_policy_ref:
  freshness_policy_ref:
  legal_or_terms_constraints: []
  active_from:
  active_to: null
  status: ACTIVE | PAUSED | RETIRED
  created_at:
  updated_at:
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §47 Search Source Registry / Profile (L4692-L4744; §47.1 Proposed Search Source Profile L4698)"
  - "SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md §2 — references this schema by field name, does not redeclare it"
decided_by: >
  ADR-021 §D1. Field union per EV-AUDIT-0902 finding B2: this file previously dropped
  ingestion_modes / legal_or_terms_constraints / active_from / active_to and the policy document
  dropped tenant_ref / workspace_ref / created_at / updated_at; merged here, this file is SSOT per
  its stated purpose (§0 object-model owner).
```

Invariant：`source_ref` 不得被此 object 重新定義 identity grammar。

### 2.2 SearchQuery

```yaml
search_query:
  id:
  tenant_ref:
  workspace_ref:
  project_ref:
  query_text:
  normalized_query:
  locale:
  market:
  language:
  intent_ref:
  topic_refs: []
  entity_refs: []
  source_provenance:
  created_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.3 SearchQuery (L743-L766)"
decided_by: >
  ADR-021 §D1; tenant/workspace scope per EV-AUDIT-0902 B3.
```

`query_text` 保存原始字串；`normalized_query` 是 derived value，不覆蓋原始輸入。

### 2.3 SearchSnapshot

```yaml
search_snapshot:
  id:
  tenant_ref:
  workspace_ref:
  query_ref:
  provider:
  surface:
  provider_adapter_version:
  locale:
  market:
  captured_at:
  request_fingerprint:
  raw_artifact_ref:
  raw_content_hash:
  execution_ref:
  status: REQUESTED | CAPTURED | PARTIAL | FAILED   # REQUESTED 補於 2026-09-02 audit remediation, finding B4 — 本檔自己的 state machine 已含 "REQUESTED → CAPTURED"，此 enum 原本漏列
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.4 SearchSnapshot (L767-L796)"
  - "SEARCH_INTELLIGENCE_SPEC.md §3 capture_result.outcome — aligned to this status enum"
decided_by: >
  ADR-021 §D1 / §D2; REQUESTED added per EV-AUDIT-0902 B4 (state machine already had REQUESTED →
  CAPTURED).
```

Invariant：同一 request fingerprint + capture slot 的 retry 必須 idempotent。

### 2.4 SearchObservation

```yaml
search_observation:
  id:
  tenant_ref:
  workspace_ref:
  snapshot_ref:
  observation_type:
  position:
  raw_observed_entity:
    provider_type:
    provider_value:
  entity_ref: null      # DEPENDENCY OQ-SC-12：Core Entity contract 成熟前只由 resolver 填
  url:
  title:
  text_excerpt_ref:
  feature_flags: []
  confidence:
  normalization_version:
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.1 core objects (L705-L716) + §12 Search Observation Model (L797-L840)"
  - "ADR-021 §D3 raw_observed_entity / entity_ref split"
decided_by: >
  ADR-021 §D1 / §D3; EV-CRIT-M (M-05); master §11.1 EntityObservation folded into
  raw_observed_entity (Errata E-09).
```

**Confirmed design correction**：raw provider entity 與 canonical entity 必須分離。證據：`EV-CRIT-M`（M-05）、`EV-EGRAPH`。

### 2.5 CompetitorObservation

```yaml
competitor_observation:
  id:
  tenant_ref:
  workspace_ref:
  search_observation_ref:
  competitor_entity_ref:
  target_query_ref:
  observed_url:
  observed_position:
  content_type:
  features: []
  captured_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.1 (L705-L716) + §13 Competitor Intelligence (L841-L867)"
  - "SEARCH_INTELLIGENCE_SPEC.md §7"
decided_by: >
  ADR-021 §D1; observed fact only — comparisons/recommendations are MethodResults.
```

不保存「競爭者比我們強」這類推論為 raw observation；推論由 MethodResult 產生。

### 2.6 AIAnswerObservation

```yaml
ai_answer_observation:
  id:
  tenant_ref:
  workspace_ref:
  snapshot_ref:
  prompt_or_query_ref:
  provider:
  product_surface:
  model_or_surface_version:
  search_enabled:
  answer_artifact_ref:
  mentioned_entity_refs: []
  citation_observation_refs: []
  captured_at:
  reproducibility_notes:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.1 (L705-L716) + §25.4 Answer Snapshot Analysis (L2442-L2466)"
  - "SEARCH_INTELLIGENCE_SPEC.md §6"
decided_by: >
  ADR-021 §D1; one snapshot is not stable truth — LLMO measurement must sample longitudinally
  (SEARCH_INTELLIGENCE_SPEC.md §6).
```

### 2.7 CitationObservation

```yaml
citation_observation:
  id:
  tenant_ref:
  workspace_ref:
  ai_answer_observation_ref:
  cited_url:
  cited_source_ref: null   # 只有 resolver 成功才填；URL 本身不等於 canonical Source
  context_span_ref:
  claim_context_refs: []
  citation_position:
  observed_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.1 (L705-L716) + §25.6 Citation Analysis (L2490-L2512)"
  - "SEARCH_INTELLIGENCE_SPEC.md §8 — references this schema by field name, does not redeclare it"
decided_by: >
  ADR-021 §D1. Merge per EV-AUDIT-0902 finding B2: two divergent copies existed (6 of 7 fields
  renamed, no id in the SEARCH_INTELLIGENCE_SPEC.md copy); kept id from this file, adopted
  context_span_ref and array-cardinality claim_context_refs from the spec copy (a citation may
  resolve to more than one claim).
```

### 2.8 RankingObservation

```yaml
ranking_observation:
  id:
  tenant_ref:
  workspace_ref:
  query_ref:
  snapshot_ref:
  observed_url:
  rank_position:
  result_type:
  entity_ref: null
  captured_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.1 (L705-L716) + §12 Search Observation Model (L797-L840)"
decided_by: >
  ADR-021 §D1; position is never compared across surfaces without the surface dimension
  (SEARCH_INTELLIGENCE_SPEC.md §5).
```

### 2.9 TopicCluster

```yaml
topic_cluster:
  id:
  tenant_ref:
  project_ref:
  canonical_topic:
  parent_cluster_ref: null
  child_cluster_refs: []
  query_refs: []
  question_refs: []
  entity_refs: []
  existing_url_refs: []
  lifecycle_state: DISCOVERED | VALIDATED | ACTIVE | MERGED | RETIRED
  method_ref:
  method_version:
  evidence_refs: []
  created_by_execution:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §14.2 TopicCluster (L904-L939)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §15 URL / Topic Mapping (L940-L966) — URLTopicMap is a derived projection over existing_url_refs, not a separate object (EV-AUDIT-0902 M14)"
decided_by: >
  ADR-021 §D1; lifecycle_state carries what master §55 called ContentOpportunityCreated (ADR-021
  §D6 — no separate aggregate).
```

### 2.10 AuthorityAssessment / FreshnessAssessment

它們是 **assessment snapshot**，不是 Evidence truth：

```yaml
authority_assessment:
  id:
  tenant_ref:
  workspace_ref:
  evidence_ref:
  source_ref:
  claim_scope:
    domain:
    platform:
    jurisdiction:
    assertion_type:
  policy_ref:
  policy_version:
  assessed_tier:
  weight:
  rationale:
  evaluated_at:
  execution_ref:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §7.3 Proposed Authority Assessment (L447-L489)"
  - "SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md §4 claim_scope + §5 authority_policy"
decided_by: >
  ADR-021 §D1; assessment snapshot, not Evidence truth
  (SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md FINDING-SA-01).
```

```yaml
freshness_assessment:
  id:
  tenant_ref:
  workspace_ref:
  source_ref:
  evidence_ref:
  policy_ref:
  policy_version:
  last_verified_at:
  evaluated_at:
  next_review_at:
  state: CURRENT | REVIEW_DUE | STALE | SUPERSEDED | RETRACTED | UNKNOWN
  rationale:           # 2026-09-02 合併自 SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md §6 的重複區塊（B2 同類）
  execution_ref:       # 同上；§5 invariant 3（derived object 必存 execution ref）
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §8 Search-domain Freshness Policy (L490-L566)"
  - "SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md §6 — references this schema by field name (its former duplicate block was replaced 2026-09-02)"
decided_by: >
  ADR-021 §D1; rationale and execution_ref merged from the policy document's copy (EV-AUDIT-0902
  B2 class, fourth instance found 2026-09-02).
```

### 2.11 EvidencePack

```yaml
evidence_pack:
  id:
  tenant_ref:
  project_ref:
  retrieval_request_hash:
  query_context:
  refs:
    - evidence_ref:
      claim_ref:
      source_ref:
      retrieval:
        channel:
        semantic_score:
        rerank_score:
        rank:
  assessment_snapshot:
    authority_policy_ref:
    authority_policy_version:
    freshness_policy_ref:
    freshness_policy_version:
    evaluated_at:
  knowledge_snapshot_ref:
  generated_by_execution:
  generated_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §18 Evidence Pack (L1083-L1155)"
  - "SEARCH_EVIDENCE_RETRIEVAL_SPEC.md §7 (producer capability search.build_evidence_pack)"
decided_by: >
  ADR-021 §D1 (retrieval snapshot only; never a copy of canonical Evidence content).
```

禁止複製 canonical Evidence content/quality 當第二真相。

### 2.12 ContentBrief

詳細 contract 由文件 7；Domain Model 只定 identity/state/reference：

```yaml
content_brief:
  id:
  tenant_ref:
  workspace_ref:
  project_ref:
  topic_cluster_ref:
  evidence_pack_ref:
  decision_ref: null
  version:
  status: DRAFT | VALIDATING | REVIEW_REQUIRED | APPROVED | REJECTED | SUPERSEDED | RETIRED   # REJECTED 補於 2026-09-02 audit remediation, finding B4 — CONTENT_BRIEF_CONTRACT.md §3 state machine 早有此狀態，此 enum 原本漏列
  created_by_execution:
  created_at:
  updated_at:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §17 Content Brief as a Contract (L1020-L1082)"
  - "CONTENT_BRIEF_CONTRACT.md §2 (full field contract; this block = identity / state / reference only)"
decided_by: >
  ADR-021 §D1; REJECTED added per EV-AUDIT-0902 B4 (CONTENT_BRIEF_CONTRACT.md §3 state machine
  already had it).
```

### 2.13 ContentPublication

```yaml
content_publication:
  id:
  tenant_ref:
  workspace_ref:
  project_ref:
  artifact_ref:
  brief_ref:
  target_ref:
  provider:
  provider_object_id:
  remote_version:
  publication_state:
  published_url:
  content_hash:
  metadata_hash:
  publish_execution_ref:
  approval_ref:        # 見下方註記 — 非直接抄自 master architecture
  created_at:
  published_at:
  verified_at:
  rollback_ref: null
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §40 Content Publication Object (L4413-L4454)"
  - "PUBLISHING_ADAPTER_CONTRACT.md §4 (executor of this state machine; references by name)"
decided_by: >
  ADR-021 §D1 / §D7; project_ref / publish_execution_ref / provenance restored from master
  L4420-4448 and approval_ref added (inference, see note below) per EV-AUDIT-0902 B3.
```

**2026-09-02 audit remediation 註記**（finding B3）：`project_ref`、`publish_execution_ref`、`provenance` 三個欄位直接對照 master architecture `:4420-4448` 補回。`approval_ref` **不是**master architecture 逐字有的欄位——它是為了讓 `search_content.publishing.approval_binding` gate（`SEARCH_CONTENT_QUALITY_GATES.md`）與 architecture 驗收條件 `:5649`（"A published page is linked to ... an approval record"）有實際欄位可驗而新增，屬本次補的**推論**，不是既有正本轉錄，故標記於此不與其他逐字轉錄的欄位混淆。

### 2.14 ContentPerformance

`ContentPerformance` 定義為 **projection**，不是 raw measurement truth：

```yaml
content_performance:
  id:
  tenant_ref:
  workspace_ref:
  publication_ref:
  metric_definition_set_ref:
  measurement_run_refs: []
  period:
  timezone:
  currency: null
  dimensions: {}
  metrics: {}
  baseline_refs: []          # OPEN_QUESTION OQ-SC-1：見下方
  data_quality_summary:
  attribution_model_ref: null
  generated_at:
  generated_by_execution:
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §43 ContentPerformance (L4511-L4547)"
  - "CONTENT_MEASUREMENT_SPEC.md §11 and CONTENT_BRIEF_CONTRACT.md measurement_plan.baseline_refs — both reference by field name"
decided_by: >
  ADR-021 §D1 (projection, not raw measurement truth). Per EV-AUDIT-0902 B2:
  CONTENT_MEASUREMENT_SPEC.md had baseline_refs where this file had nothing and
  CONTENT_BRIEF_CONTRACT.md used singular baseline_ref; unified to plural here. Baseline object
  itself is OPEN_QUESTION OQ-SC-1.
```

**OPEN_QUESTION `OQ-SC-1`（未消音，未虛構解答）**：`baseline_refs` 目前全包沒有任何一份文件定義「baseline 是什麼物件、由誰產生、儲存在哪」——它只是一個被三份文件引用但從未 contract 化的參照型別。本次修正只統一了欄位名稱與 cardinality，**沒有發明一個 Baseline schema**。在有人定義它之前，任何 consumer 都不能假設這個 ref 可解析。

此設計直接修正 `EV-CRIT-H08`。

### 2.15 RefreshContext

```yaml
refresh_context:
  id:
  tenant_ref:
  workspace_ref:
  publication_ref:
  performance_ref:
  trigger_refs: []           # DecayObservation refs（§2.16）；source 變更走 source_change_refs
  source_change_refs: []     # SearchSourceChangeObserved event refs（ADR-021 §D6）
  search_observation_refs: []
  affected_claim_refs: []
  proposed_options: []
  decision_ref: null
  created_at:
  created_by_execution:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §45.2 Refresh Context (L4606-L4630)"
decided_by: >
  ADR-021 §D1; decision_ref points to Core Decision — master §45 forbids a RefreshDecision model.
```

`decision_ref` 指向 Core Decision；此 vertical 不建立另一個 decision schema。

### 2.16 DecayObservation

**2026-09-02 補列**（`EV-AUDIT-0902` 任務 8）：`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` Step 15 產出它、`refresh_context.trigger_refs` 指向它、`CONTENT_MEASUREMENT_SPEC.md` §12 描述它，但全包先前沒有 schema、也不在 ADR §D1 可擁有清單。它是 `measurement.content_decay_detection` 的 **MethodResult 快照**（`epistemic_type: AI_INFERENCE`），不是 performance truth，也不直接改文章：

```yaml
decay_observation:
  id:
  tenant_ref:
  workspace_ref:
  publication_ref:
  performance_ref:
  detected_at:
  signals: []                 # 值域逐字轉錄自 master §32.6：search_visibility_decline | query_coverage_decline | ai_citation_decline | conversion_decline | source_staleness | content_age | competitor_displacement | entity_inconsistency | broken_links | technical_eligibility_change
  signal_evidence_refs: []    # 每個 signal 對應的 ContentPerformance / SearchObservation / FreshnessAssessment refs
  severity_estimate:          # AI_INFERENCE；不得寫成 truth，Decision 由 RefreshContext → Core Decision 產生
  method_ref: measurement.content_decay_detection
  method_version:
  execution_ref:
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §32.6 Content Decay Detection (L3829-L3861; signal list transcribed verbatim) + §32.8 Measurement Outputs (L3889)"
  - "SEARCH_CONTENT_MVP_VERTICAL_SLICE.md Step 15; CONTENT_MEASUREMENT_SPEC.md §12"
decided_by: >
  ADR-021 §D1 (added 2026-09-02, EV-AUDIT-0902 task 8); analysis output, not truth —
  severity_estimate is AI_INFERENCE.
```

Invariant：`ContentDecayDetected`（ADR-021 §D6）的 aggregate owner 是本物件；一個 DecayObservation 只能產生一個 RefreshContext 的 `trigger_refs` 條目（不可重複觸發同一 refresh）。

### 2.17 Artifact Type Catalog（vertical 目錄）

**2026-09-02 補列**（`EV-AUDIT-0902` M14）：`SEARCH_CONTENT_QUALITY_GATES.md` 的每筆 gate record 以 `applies_to_artifact_types` 為鍵，但全包先前沒有這份目錄。逐字轉錄 master §56；它是 **vertical 目錄，不是平台 enum**——canonical Artifact record／global artifact-type registry 成熟後（`OQ-SC-14`）改以 extension/profile 語意接入，不重定義 Artifact：

```yaml
search_content_artifact_type:
  values:
    - CONTENT_STRATEGY
    - CONTENT_BRIEF
    - CONTENT_OUTLINE
    - ARTICLE
    - LANDING_PAGE
    - PRODUCT_PAGE
    - CATEGORY_PAGE
    - FAQ
    - COMPARISON_PAGE
    - LOCAL_PAGE
    - APP_STORE_LISTING
    - CONTENT_AUDIT
    - SEARCH_INTELLIGENCE_REPORT
  wildcard: "*"              # gate record 用 "*" 表示適用於全部 13 值
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §56 SearchContent Artifact Type Catalog (L5123-L5146; 13 values transcribed verbatim)"
decided_by: >
  ADR-021 §D1 (vertical catalog, not a platform enum; integration with the future canonical
  Artifact registry is DEPENDENCY OQ-SC-14).
```

## 3. State Machines

### ContentBrief

```text
DRAFT → VALIDATING → APPROVED
               └──→ REVIEW_REQUIRED → APPROVED
APPROVED → SUPERSEDED → RETIRED
```

### ContentPublication

```text
CONTENT_READY
→ DRAFT_CREATED
→ PREVIEW_READY
→ VALIDATED
→ APPROVED_IF_REQUIRED
→ SCHEDULED|PUBLISHED
→ VERIFIED

staged-only branch (no production publish requested):
PREVIEW_READY → VERIFIED(staged)     # verifies the preview render only; does NOT imply SCHEDULED|PUBLISHED occurred

failure:
VALIDATION_FAILED | REMOTE_CONFLICT | AUTH_FAILED | RATE_LIMITED | PUBLISH_FAILED | PARTIALLY_PUBLISHED | ROLLBACK_REQUIRED | ROLLED_BACK | VERIFY_FAILED
```

**2026-09-02 audit remediation 註記**（finding B4）：failure enum 原本此處只有 5 值，`PUBLISHING_ADAPTER_CONTRACT.md` §4 另有 9 值版本，兩者不一致。統一取 9 值（`PUBLISHING_ADAPTER_CONTRACT.md` 的版本較完整），此檔為 SSOT。另外補上 `staged-only branch`：`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` Step 12 明說不做 production publish（只到 `PREVIEW_READY`），但 Step 13 卻要求發出 `ContentPublicationVerified`——若不補這條分支，MVP 自己設計的路徑在原本的 state machine 裡走不到 `VERIFIED`。`VERIFIED(staged)` 與正式 `VERIFIED` 不是同一保證等級，consumer 不得混用。

**與平台 status code 的關係（`EV-STATUS`、`EV-ADR019`；驗證報告 M9）**：`publication_state` 是 **aggregate 狀態**，不是第二套執行狀態詞彙。每一次 publishing operation 的執行結果一律用平台的 `final_status`／legal side state／`reason_code`；兩者的對照固定如下，consumer 不得自行推導：

| `publication_state`（aggregate）| 對應執行結果（平台 `EV-STATUS`）|
|---|---|
| `VALIDATION_FAILED` | `final_status: FAILED`, `reason_code: CONFLICT_REQUIRES_HUMAN_REVIEW`（gate FAIL 時）|
| `REMOTE_CONFLICT` | side state `NEEDS_HUMAN_REVIEW`, `reason_code: CURRENT_STATE_DRIFT_DETECTED` |
| `AUTH_FAILED` / `RATE_LIMITED` / `PUBLISH_FAILED` | `final_status: FAILED`（provider error 進 audit record，不新增 reason_code）|
| `PARTIALLY_PUBLISHED` | side state `PARTIAL_SUCCESS`；**必須**在同一 execution 內轉為 `ROLLBACK_REQUIRED` 或以 idempotent retry 完成，不得停留 |
| `ROLLBACK_REQUIRED` | side state `NEEDS_HUMAN_REVIEW`（policy 允許時可自動 rollback）|
| `ROLLED_BACK` | side state `ROLLED_BACK`；rollback record 依 `EV-ROLLBACK` |
| `VERIFY_FAILED` | `final_status: FAILED` → 進 `ROLLBACK_REQUIRED` |

### SearchSnapshot

```text
REQUESTED → CAPTURED
         ├→ PARTIAL
         └→ FAILED
```

## 4. Database / Storage Mapping

不直接指定某 vendor database；依 Repository Contract：

```text
Structured metadata / refs     → Repository Tier 1
Raw page/AI/provider payloads   → Object Storage/CAS
Searchable text                → FTS derived index
Embeddings                     → Vector derived index
Relationships                  → Graph derived store
Events                         → Event store / Ledger
Performance time series        → Metrics/time-series derived store
```

任何 Tier-2 projection 可重建，不能成為唯一 truth。證據：`EV-REPOSITORY`。

## 5. Data Invariants

1. Every persisted vertical object has tenant/workspace scope. There is no "where applicable" exception — see the 2026-09-02 audit remediation (`agency-os/reports/audit/2026-09-02-search-content-pack-verification.md`, finding B3), which added `tenant_ref`/`workspace_ref` to every object in this file that lacked them.
2. Every externally captured object stores provider, adapter version, captured_at, raw hash/artifact ref.
3. Derived objects store method/policy version and execution ref.
4. Core references are refs, not copied core records.
5. Update does not erase historical evidence/observation; use new version/event/supersession.
6. No raw provider field is silently normalized without preserving original.
7. No Decision is hidden inside a score.
8. Every event / MethodResult / assessment carries the platform `provenance_record`（`EV-EPISTEMIC`；預設對照見 `SEARCH_CONTENT_PACK_COMMON.md` §4.4）；consumer 不得改標。
9. Every contract block in this pack declares `source_of_truth_for` + `decided_by`（`EV-AUDIT-0902` B2 root cause；驗證器 rule 2）。Example / metadata blocks carry `block_kind: EXAMPLE | ADR_METADATA` instead.
10. Every persisted vertical object stores the artifact type it applies to (from §2.17) whenever a gate is evaluated against it.
