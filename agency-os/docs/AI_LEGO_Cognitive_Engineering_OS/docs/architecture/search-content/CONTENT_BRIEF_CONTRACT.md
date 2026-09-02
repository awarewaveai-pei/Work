# Content Brief Contract

**Document ID:** `search-content.content-brief-contract`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/CONTENT_BRIEF_CONTRACT.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 把 ContentBrief 定義成可驗證、可版本化、可審批、可追溯的 production contract；修正固定 P0/P1 source-tier 問題。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`
- `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Confirmed Finding

### FINDING-CB-01 — v3 `required_source_tiers: [P0, P1]` 與 claim-scope-aware authority 衝突

**Evidence**：`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md:L1028-L1090`、`EV-CRIT-H02`、`EV-EVIDENCE`。  
**Resolution**：移除 unconditional `required_source_tiers`；改 policy refs + per-claim evidence requirements。

## 2. Contract

```yaml
content_brief:
  id:
  version:
  status:

  scope:
    tenant_ref:
    workspace_ref:
    project_ref:
    market:
    locale:
    language:

  objective:
    business_goal_refs: []
    audience_refs: []
    journey_stage:
    primary_conversion_goal_ref: null

  topic:
    topic_cluster_ref:
    primary_topic:
    target_query_refs: []
    target_question_refs: []
    entity_refs: []

  search_requirements:
    intent_analysis_ref:
    expected_content_types: []
    expected_formats: []
    search_surface_refs: []
    existing_url_refs: []
    cannibalization_analysis_ref: null

  evidence:
    evidence_pack_ref:
    authority_policy_ref:
    freshness_policy_ref:
    claim_requirements:
      - requirement_id:
        claim_scope:
        evidence_required: true
        minimum_directness: null
        minimum_authority_result: null
        freshness_state_allowed: []
        minimum_independent_sources: null
        official_source_required_for_rule_claim: false

  content_requirements:
    must_cover: []
    must_not_claim: []
    required_questions: []
    required_entities: []
    required_internal_links: []
    structured_data_eligibility_ref: null

  geo_aeo_llmo:
    direct_answer_requirements: []
    citation_readiness_requirements: []
    passage_requirements: []
    entity_clarity_requirements: []

  brand:
    voice_profile_ref:
    product_fact_refs: []
    prohibited_claims: []

  conversion:
    message_match_requirements: []
    cta_requirements: []
    guardrail_requirements: []

  publication:
    target_channel:
    publication_profile_ref:
    metadata_requirements:
    approval_policy_ref:

  measurement_plan:
    metric_definition_refs: []
    baseline_refs: []      # 未定義型別：OPEN_QUESTION OQ-SC-1（SEARCH_CONTENT_DOMAIN_MODEL.md §2.14）
    attribution_model_ref: null   # → CONTENT_MEASUREMENT_SPEC.md §8 attribution_model
    observation_windows: []
    refresh_trigger_policy_ref:

  provenance:
    knowledge_snapshot_ref:
    method_versions: []
    policy_versions: []
    generated_by_execution:
    created_at:
    approved_by: null
    approved_at: null
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §17 Content Brief as a Contract (L1020-L1082) — `required_source_tiers` removed (master Errata E-02)"
  - "SEARCH_CONTENT_DOMAIN_MODEL.md §2.12 content_brief — identity/state/reference subset of this contract, references by name"
decided_by: >
  ADR-021 §D1; FINDING-CB-01 (EV-CRIT-H02): unconditional P0/P1 tiers replaced by policy refs +
  per-claim evidence requirements.
```

## 3. State Machine

```text
DRAFT
→ VALIDATING
→ REVIEW_REQUIRED ──human/policy resolution──► APPROVED
             └───────────────────────────────► REJECTED
VALIDATING → APPROVED (only when policy permits no human review)
APPROVED → SUPERSEDED
SUPERSEDED → RETIRED
```

`APPROVED` 綁定 `brief hash/version`；內容改動後不得沿用舊 approval。

## 4. Validation Rules

Hard failures：

```text
missing scope refs
missing evidence_pack_ref for factual production
rule/policy claim without authority policy result
stale/retracted evidence used where policy blocks it
required query/question with no section/coverage mapping
conflicting requirements unresolved
missing measurement plan
provider-specific hard claim without official evidence classification
```

Soft warnings：

```text
low evidence diversity
high competitor similarity
long maintenance burden
uncertain conversion hypothesis
```

## 5. Conflict Resolution

若 SEO/GEO/Brand/CRO requirements 衝突：

```text
requirement conflict
→ identify governing policy/evidence
→ scope authority evaluation
→ Method analysis
→ unresolved => human review / Core Decision
```

不得由 Writer 自己挑一條。

## 6. Versioning

Semver policy：

```text
major: contract-breaking field/semantic change
minor: additive optional requirement
patch: clarification / validator bug fix with no semantic expansion
```

Brief instance version 與 schema version 分開。

## 7. Diff & Regeneration

Brief regeneration 必須輸出：

```text
old_brief_ref
new_brief_ref
changed source/evidence/policy refs
requirements added/removed/changed
reason
execution_ref
```

禁止 silent overwrite。

## 8. Proposed Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/content-brief.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/content-brief/positive.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/content-brief/negative.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/content-brief/regression.yaml
```
