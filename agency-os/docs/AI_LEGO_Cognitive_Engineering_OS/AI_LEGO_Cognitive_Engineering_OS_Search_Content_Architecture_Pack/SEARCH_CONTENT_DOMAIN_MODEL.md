# SearchContent Domain Model

**Document ID:** `search-content.domain-model`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md` v3  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_DOMAIN_MODEL.md`  

**目的：** 定義 SearchContent vertical 的 object model、aggregate、reference、state machine、cardinality 與 invariants；所有 Core object 僅引用、不複製。

**直接依賴：**
- `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md`
- `ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。
## 工程身份與決策準則

本文件假設所有執行者（人類、agent、subagent、code reviewer、operator）均以以下複合角色工作：**架構師 / DevOps / 資安 / DB / PM / Search-Content 技術專家**。任何單一角色的局部最佳化不得破壞全域一致性。

每個決策必須同時通過五個檢查：

1. **多角度優先**：功能、架構、資料、資安、營運、可觀測性、成本、產品、法遵、維運至少交叉檢查。
2. **30 年工程紀律**：不把 provider、模型、prompt、單一 CMS、單一 DB 寫成不可替換的核心真理。
3. **零重工原則**：先解 ownership / ID / contract / migration，再寫 runtime；不得先做後重構。
4. **完整閉環**：Input → Validate → Execute → Gate → Persist/Event → Measure → Decide → Rollback/Refresh 必須閉合。
5. **最小爆炸半徑**：所有 write 皆需 scope、idempotency、version、rollback 或明確不可回滾條件。

硬規則：

```text
MODEL IS DISPOSABLE
PROMPT IS DISPOSABLE
PROVIDER IS REPLACEABLE
CANONICAL CONTRACT / EVIDENCE / DECISION / EVENT HISTORY MUST SURVIVE
```
## 路徑治理

本套文件的**本次交付路徑**為：

```text
/mnt/data/search_content_architecture_pack_zh-TW/
```

建議 repo 目標 namespace：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/
```

但此目標 namespace 在 ADR 接受前只屬 `PROPOSED_PHYSICAL_PATH`。原因不是保守措辭，而是 AI-LEGO 已明文將 physical repo layout 視為 architecture，須經 Repository Architecture / ADR-006 治理。證據：`EV-REPO-ARCH`、`EV-ADR006`。

ADR 文件的正式 repo path 應在取得下一個 ADR 編號後改名為：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-0XX-search-content-boundary-and-ownership.md
```

不得自行猜一個未登記的 ADR number。
## 共同證據基準

本文件所有 `FINDING-*` 均只使用已驗證的檔案／行號；尚未被證據直接支持者必須標為 `OPEN_QUESTION`，不得寫成「可能」「應該已經」「看起來像」。

| ID | 證據 |
|---|---|
| EV-CONST | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md:L1-L90` — Scoped Authority、文件職責、machine-readable contract/ADR 優先序、ADR-006 提案流程。 |
| EV-REPO-ARCH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/REPOSITORY_ARCHITECTURE.md:L1-L220` — Shared Kernel、Knowledge engine、Recipe vertical、方法實作/registry 分層、路徑治理。 |
| EV-ADR006 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md:L1-L220` — physical path 是 architecture；母文件/高風險規格修改使用 `.ai/proposals/`、不可 AI 自我批准。 |
| EV-EVIDENCE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:L1-L180` — canonical Evidence、8 個 quality dimensions、domain-specific hierarchy、source/content 仍有 NEW_DESIGN 邊界。 |
| EV-CLAIM | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/claim.schema.yaml:L1-L180` — canonical Claim、supporting/contradicting Evidence、confidence/provenance。 |
| EV-EGRAPH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence-graph.schema.yaml:L1-L240` — Source/Evidence/Claim/Assumption/Decision/Entity graph；Entity/Relation 僅 minimal NEW_DESIGN；Source/Entity ID grammar 亦屬 NEW_DESIGN。 |
| EV-DECISION | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/decision/decision.schema.yaml:L1-L240` — canonical Decision，包含 criteria/evidence/assumptions/unknowns/recommendation/human judgment/reversal/monitoring/outcome。 |
| EV-METHOD | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/method.schema.yaml:L1-L220` — canonical Method Contract；ADR-005 bare `<family>.<name>` grammar。 |
| EV-CAPABILITY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/capability-contract.schema.yaml:L1-L280` — Capability ≠ Method；Capability Contract 與 ID grammar。 |
| EV-WORKFLOW | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/workflow/workflow-ir.schema.yaml:L1-L220` — Recipe/Method 與 executable Workflow IR 分層；IR node 嚴格區分 method/capability。 |
| EV-GATE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/gate.schema.yaml:L1-L240` — Gate Result；ADR-011 Global/High-risk ownership；method-specific gate namespace 可擴充。 |
| EV-EVENT | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/event-ledger.schema.yaml:L1-L260` — canonical Event Ledger；`ArtifactPublished` 已存在；event_type 為 open PascalCase；event replay/idempotency invariants。 |
| EV-AUTH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/authority.schema.yaml:L1-L230` — A0–A4；Capability ≠ Authority；A3/A4 的 policy/gate/approval 條件。 |
| EV-REPOSITORY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/repository-contract.schema.yaml:L1-L230` — Repository Contract；vector/graph/FTS/event/metrics/cache/queue 等 storage roles；app 不直接依賴 DB。 |
| EV-V3-BOUNDARY | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L68-L240` — v3 horizontal/vertical boundary、Core reuse、maturity model。 |
| EV-V3-AUTH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L385-L651` — authority/freshness/retrieval policy。 |
| EV-V3-BRIEF | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L1028-L1163` — ContentBrief/EvidencePack。 |
| EV-V3-METHODS | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L3928-L4257` 與 `L4923-L5180` — domain Method/Capability catalogs、recipes/events/gates。 |
| EV-V3-PUBLISH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4337-L4484` — Publishing engine/safety/publication object。 |
| EV-V3-MEASURE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4485-L4680` — measurement/performance/refresh。 |
| EV-V3-SOURCE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4722-L4922` — SearchSourceProfile、ingestion、Knowledge Card、Hybrid Retrieval Router。 |
| EV-CRIT-H01 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L496-L585` — Method namespace collision 已確認。 |
| EV-CRIT-H02 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L586-L653` — ContentBrief `required_source_tiers` 與 claim-scope authority 衝突。 |
| EV-CRIT-H03 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L654-L715` — Live Web Search boundary 錯置。 |
| EV-CRIT-H04 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L716-L767` — Entity maturity 被寫得過高。 |
| EV-CRIT-H05 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L768-L868` — Event semantic ownership/duplicate 風險。 |
| EV-CRIT-H06 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L869-L914` — Method catalog 分裂。 |
| EV-CRIT-H07 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L915-L978` — Capability catalog 分裂。 |
| EV-CRIT-H08 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L979-L1036` — ContentPerformance 太薄。 |
| EV-CRIT-M | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L1037-L1455` — runtime wording、repo path、Source ID、SearchObservation Entity、domain method shape、publishing approval、evidence versioning、gate mapping、section numbering。 |
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
  crawl_policy_ref:
  authority_policy_ref:
  freshness_policy_ref:
  status: ACTIVE | PAUSED | RETIRED
  created_at:
  updated_at:
  provenance:
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
```

`query_text` 保存原始字串；`normalized_query` 是 derived value，不覆蓋原始輸入。

### 2.3 SearchSnapshot

```yaml
search_snapshot:
  id:
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
  status: CAPTURED | PARTIAL | FAILED
```

Invariant：同一 request fingerprint + capture slot 的 retry 必須 idempotent。

### 2.4 SearchObservation

```yaml
search_observation:
  id:
  snapshot_ref:
  observation_type:
  position:
  raw_observed_entity:
    provider_type:
    provider_value:
  entity_ref: null
  url:
  title:
  text_excerpt_ref:
  feature_flags: []
  confidence:
  normalization_version:
  provenance:
```

**Confirmed design correction**：raw provider entity 與 canonical entity 必須分離。證據：`EV-CRIT-M`（M-05）、`EV-EGRAPH`。

### 2.5 CompetitorObservation

```yaml
competitor_observation:
  id:
  search_observation_ref:
  competitor_entity_ref:
  target_query_ref:
  observed_url:
  observed_position:
  content_type:
  features: []
  captured_at:
```

不保存「競爭者比我們強」這類推論為 raw observation；推論由 MethodResult 產生。

### 2.6 AIAnswerObservation

```yaml
ai_answer_observation:
  id:
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
```

### 2.7 CitationObservation

```yaml
citation_observation:
  id:
  ai_answer_observation_ref:
  cited_url:
  cited_source_ref: null
  claim_context_ref:
  citation_position:
  observed_at:
```

### 2.8 RankingObservation

```yaml
ranking_observation:
  id:
  query_ref:
  snapshot_ref:
  observed_url:
  rank_position:
  result_type:
  entity_ref: null
  captured_at:
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
```

### 2.10 AuthorityAssessment / FreshnessAssessment

它們是 **assessment snapshot**，不是 Evidence truth：

```yaml
authority_assessment:
  id:
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
```

```yaml
freshness_assessment:
  id:
  source_ref:
  evidence_ref:
  policy_ref:
  policy_version:
  last_verified_at:
  evaluated_at:
  next_review_at:
  state: CURRENT | REVIEW_DUE | STALE | SUPERSEDED | RETRACTED | UNKNOWN
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
  status: DRAFT | VALIDATING | REVIEW_REQUIRED | APPROVED | SUPERSEDED | RETIRED
  created_by_execution:
  created_at:
  updated_at:
```

### 2.13 ContentPublication

```yaml
content_publication:
  id:
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
  created_at:
  published_at:
  verified_at:
  rollback_ref: null
```

### 2.14 ContentPerformance

`ContentPerformance` 定義為 **projection**，不是 raw measurement truth：

```yaml
content_performance:
  id:
  publication_ref:
  metric_definition_set_ref:
  measurement_run_refs: []
  period:
  timezone:
  currency: null
  dimensions: {}
  metrics: {}
  data_quality_summary:
  attribution_model_ref: null
  generated_at:
  generated_by_execution:
  provenance:
```

此設計直接修正 `EV-CRIT-H08`。

### 2.15 RefreshContext

```yaml
refresh_context:
  id:
  publication_ref:
  performance_ref:
  trigger_refs: []
  source_change_refs: []
  search_observation_refs: []
  affected_claim_refs: []
  proposed_options: []
  decision_ref: null
  created_at:
  created_by_execution:
```

`decision_ref` 指向 Core Decision；此 vertical 不建立另一個 decision schema。

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

failure:
VALIDATION_FAILED | PUBLISH_FAILED | PARTIALLY_PUBLISHED | ROLLBACK_REQUIRED | ROLLED_BACK
```

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

1. Every persisted vertical object has tenant/workspace scope where applicable.
2. Every externally captured object stores provider, adapter version, captured_at, raw hash/artifact ref.
3. Derived objects store method/policy version and execution ref.
4. Core references are refs, not copied core records.
5. Update does not erase historical evidence/observation; use new version/event/supersession.
6. No raw provider field is silently normalized without preserving original.
7. No Decision is hidden inside a score.
## 實作與驗證通用指令

以下是**建立這套 SearchContent 文件／contract 時必須可重現的最低驗證**；它們不假設 repo 已存在尚未驗證的專用 validator。

```bash
# 1. 確認工作樹狀態；不得把無關修改一起帶入
git status --short

# 2. 找出同名／近義 machine IDs，防止重複 truth
git grep -nE 'seo\.|geo\.|aeo\.|llmo\.|content\.|search\.|publishing\.|measurement\.' --   agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods   agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities   agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/recipes   agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs || true

# 3. 檢查 whitespace / conflict marker
git diff --check

git grep -nE '^(<<<<<<<|=======|>>>>>>>)' -- agency-os/docs/AI_LEGO_Cognitive_Engineering_OS || true
```

**預期結果：**

```text
git status 僅列出本批次明確授權的檔案；
ID grep 不得出現未登記 alias/duplicate；
git diff --check exit 0；
不得有 merge conflict marker。
```

若要建立 machine-readable schema/contract，該文件必須同時新增：

```text
positive fixture
negative fixture
golden regression fixture
version / migration note
rollback or deprecation rule
```

不得只新增 YAML 而沒有測試樣本。
