# SearchContent Method and Capability Registry

**Document ID:** `search-content.method-capability-registry`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 提供 SearchContent 唯一 canonical Method/Capability catalog，消除 v3 兩份清單與語意碰撞；定義 contract status、owner、input/output 與 deprecation。

**直接依賴：**
- `ADR-021-search-content-boundary-and-ownership.md`
- `specs/cognitive/method.schema.yaml`
- `specs/domain/capability-contract.schema.yaml`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Blocking Findings

### FINDING-MC-01 — Method semantic collision
**Evidence**：`EV-CRIT-H01`、`EV-CRIT-H06`、`EV-METHOD`。  
**Resolution**：本文件以下 catalog 是唯一 SearchContent Method naming SSOT；v3 其他清單降為 narrative reference。

### FINDING-MC-02 — Capability catalog 分裂且混入 Method-like reasoning
**Evidence**：`EV-CRIT-H07`、`EV-CAPABILITY`、`EV-WORKFLOW`。  
**Resolution**：`classify/cluster/analyze/detect` 若核心價值是 reasoning，定義成 Method；Capability 是可執行 action。

## 2. Naming Rules

### Method

必須符合 ADR-005：

```regex
^[a-z_]+\.[a-z_]+$
```

禁止 version 塞進 ID。

### Capability

**Scope note（2026-09-02 audit remediation, finding B5）**：本節的 `search.<action>` 等前綴是 **Capability 命名空間**，與 `ADR-021-search-content-boundary-and-ownership.md` §D4 的 **Method 命名空間**是兩個獨立型別的 ID 空間（見該節同一次補的 scope note，含 `OQ-cc-1` 引用）。§3／§5 分開建表就是為了讓兩邊各自的 `search.*` 條目不必互斥檢查。

使用 canonical Capability Contract grammar `^[a-z_]+(\.[a-z_]+)?$`（`EV-CAPABILITY` `:555`；點號前綴是否構成正式 registry 是平台開放問題 → DEPENDENCY `OQ-SC-10`）；SearchContent 新 ID 統一採一層 namespace：

```text
search.<action>
content.<action>
publishing.<action>
measurement.<action>
knowledge.<action>  # only if Core owner approves/exists
```

## 3. Canonical Method Catalog

每個 ID 的 record（owner／status／purpose／input_types／output_types／contract_path／`evidence_maturity`）在 **`SEARCH_CONTENT_REGISTRY_RECORDS.yaml`**（機器可讀，驗證器 rule 3 核對本節每個 ID 都有 record）。本節只是人讀的目錄。**所有 domain Method 的 `evidence_maturity` 目前皆為 `DOMAIN_PROPOSAL`**（`EV-CRIT-M` M-07；DEFERRED `OQ-SC-11`）——契約可以齊備（`status`），領域效力仍未經本平台證實，兩軸不互推（`SEARCH_CONTENT_PACK_COMMON.md` §4.3）。

### SEO

```text
seo.query_discovery
seo.search_intent_analysis
seo.search_surface_analysis
seo.crawlability_analysis
seo.indexability_analysis
seo.canonical_analysis
seo.redirect_analysis
seo.sitemap_analysis
seo.robots_analysis
seo.hreflang_analysis
seo.rendering_analysis
seo.status_code_analysis
seo.duplicate_url_analysis
seo.faceted_navigation_analysis
seo.pagination_analysis
seo.information_architecture_analysis
seo.internal_link_analysis
seo.orphan_page_analysis
seo.anchor_context_analysis
seo.cannibalization_analysis
seo.structured_data_analysis
seo.entity_coverage_analysis
```

### GEO

```text
geo.answerability_analysis
geo.citation_readiness_analysis
geo.passage_independence_analysis
geo.entity_clarity_analysis
geo.question_coverage_analysis
```

### AEO

```text
aeo.question_discovery
aeo.question_classification
aeo.answer_type_selection
aeo.direct_answer_analysis
aeo.structured_answer_eligibility_analysis
```

### LLMO

```text
llmo.prompt_set_design
llmo.answer_snapshot_analysis
llmo.brand_mention_analysis
llmo.citation_analysis
llmo.entity_representation_analysis
```

### Entity / Local

```text
entity.resolve_identity
entity.consistency_analysis
local.intent_analysis
local.profile_consistency_analysis
local.landing_page_analysis
local.reputation_observation
```

### Search (cross-surface reasoning)

**2026-09-02 audit remediation 新增**（finding B6）：master architecture §53 提出但先前未落地的 4 個方法，set-diff 重算後確認全包其他文件已在依賴其中 2 個（見下方個別註記），非投機新增：

```text
search.query_clustering
search.competitor_content_analysis
search.source_conflict_analysis          # SEARCH_EVIDENCE_RETRIEVAL_SPEC.md §7 conflict_analysis 的 method_ref 依賴此 ID
search.evidence_authority_analysis       # SOURCE_PROFILE/AUTHORITY 產出 AuthorityAssessment 依賴此 ID 當 producer
search.plan_retrieval                    # finding B7；SEARCH_EVIDENCE_RETRIEVAL_SPEC.md §1 RetrievalPlanner 的 canonical Method ID
```

### Content Strategy / Lifecycle

```text
content.topic_discovery
content.topic_clustering
content.topic_hierarchy_analysis
content.content_gap_analysis
content.topic_prioritization
content.brief_synthesis
content.refresh_analysis                 # OPEN_QUESTION OQ-SC-7（與下一行的關係）
content.refresh_prioritization           # master §53 原提 ID；登記為 PROPOSED + distinct_from 以免靜默消失；OQ-SC-7 解決前不得寫 contract
content.internal_link_planning           # 2026-09-02 audit remediation 新增，finding B6，master architecture §53
```

**OPEN_QUESTION `OQ-SC-7`**（2026-09-02 audit remediation, finding B6）：master architecture §53 提的是 `content.refresh_prioritization`，本 catalog 只有 `content.refresh_analysis`。全包 grep 兩個名稱皆無其他文件引用，無法判斷是同一方法改名、還是「先分析要不要 refresh」與「refresh 排優先序」兩個不同階段的方法。本次不強行合併或改名，兩者皆保留現狀，留待實際需要時依真實用例決定。

### SXO/CRO

```text
sxo.message_match_analysis
cro.friction_analysis
cro.cta_analysis
```

### ASO

```text
aso.query_research
aso.metadata_analysis
aso.competitor_listing_analysis
aso.creative_analysis
aso.review_theme_analysis
aso.localization_analysis
aso.listing_conversion_analysis
```

### Measurement

```text
measurement.content_decay_detection
measurement.ai_visibility_analysis
measurement.search_performance_analysis
measurement.conversion_analysis
```

## 4. Explicitly Retired / Never Create Aliases

```text
search.intent_analysis          → seo.search_intent_analysis
search.content_gap_analysis     → content.content_gap_analysis
search.topic_clustering         → content.topic_clustering
search.entity_gap_analysis      → seo.entity_coverage_analysis (unless future distinct semantic ADR)
```

若 repo 內已存在引用，不能直接刪；依平台 `EV-DEPRECATION`（`specs/execution/deprecation-pipeline.schema.yaml`）七步執行：Notice → Replacement → Compatibility Matrix → Migration Tool → Usage Scan → Deadline → Archive。本節不自訂較輕的流程（`EV-AUDIT-0902` M9）。record 的 `status: RETIRED` + `replacement` 欄位是 Replacement 步驟的機讀形式。

## 5. Canonical Capability Catalog

### Search / External Observation

```text
search.collect_snapshot
search.fetch_page
search.fetch_site_crawl
search.collect_query_metrics
search.collect_ai_answer_snapshot
search.normalize_snapshot
search.store_raw_snapshot
search.extract_observations      # 2026-09-02 audit remediation 新增，finding B6，master architecture §52
search.detect_cannibalization    # 同上；對應既有 Method seo.cannibalization_analysis 的執行面
search.compare_competitors       # 同上
search.build_evidence_pack       # 同上；SEARCH_EVIDENCE_RETRIEVAL_SPEC.md §7 已產出 EvidencePack 卻先前無 capability ID 可綁
```

### Knowledge / Evidence actions

若 Core 已提供相同 capability，SearchContent **引用 Core ID，不新建 alias**。垂直需要但 Core 尚無 contract 時先記 `DEPENDENCY_REQUEST`，不自行接管 Core namespace。

**2026-09-02 audit remediation 新增**（finding B6）：master architecture §52（`:4163-4165`）提了 3 個 `knowledge.*` 但從未真的路由給 Core：

```text
DEPENDENCY_REQUEST: knowledge.retrieve_evidence      — owner=Core, status=UNCONFIRMED, requested_by=SearchContent
DEPENDENCY_REQUEST: knowledge.resolve_entity         — owner=Core, status=UNCONFIRMED, requested_by=SearchContent
DEPENDENCY_REQUEST: knowledge.retrieve_brand_fact    — owner=Core, status=UNCONFIRMED, requested_by=SearchContent
```

在 Core owner 確認/建立這 3 個 capability 之前，SearchContent 不得假設它們已存在並直接呼叫（DEPENDENCY `OQ-SC-9`；MVP 走 Repository ports）。

### Content Production

```text
content.generate_brief
content.generate_outline
content.generate_draft
content.bind_citations
content.render_preview
content.build_strategy          # 2026-09-02 audit remediation 新增，finding B6，master architecture §52
content.build_refresh_context   # 同上；MVP Step 16 已需要此 capability 但先前無 ID 可綁
```

### Publishing

```text
publishing.create_draft
publishing.update_draft
publishing.preview
publishing.diff
publishing.schedule
publishing.publish
publishing.unpublish
publishing.rollback
publishing.verify
```

### Measurement

```text
measurement.collect_search_performance
measurement.collect_ai_visibility
measurement.collect_analytics
measurement.collect_conversion
measurement.persist_snapshot
```

## 6. Rejected Capability Names

以下 reasoning 不建 capability alias：

```text
search.classify_intent      → 對應 Method: seo.search_intent_analysis（見 ADR §D4 KEEP 列表）
search.cluster_queries      → 對應 Method: content.topic_clustering（本次推論，非既有正本逐字轉錄——見下方註記）
search.detect_content_gap   → 對應 Method: content.content_gap_analysis（見 ADR §D4 KEEP 列表）
measurement.detect_decay    → 對應 Method: measurement.content_decay_detection（見 §3 Canonical Method Catalog）
```

改用相對應 Method；若需要執行 Method，透過 AI-LEGO method execution mechanism，而不是建同語意 Capability。

**2026-09-02 audit remediation 新增**（finding B6）：master architecture §52 另提了 5 個 `content.validate_*` capability（seo/geo/entity/brand/conversion），set-diff 重算後判定不建：

```text
content.validate_seo         → 由 SEARCH_CONTENT_QUALITY_GATES.md 的 search_content.seo.* gate family 涵蓋
content.validate_geo         → 由 search_content.geo.* gate family 涵蓋
content.validate_entity      → 由 search_content.entity.* gate family 涵蓋
content.validate_brand       → 由 search_content.brand.* gate family 涵蓋
content.validate_conversion  → 由 search_content.conversion.* gate family 涵蓋
```

理由：「驗證內容是否符合某維度」正是 Quality Gate 機制存在的目的（gate 本身就是可執行的驗證判定），另建一組同語意 capability 會製造第二套驗證路徑，違反 README 核心原則 #2。若未來發現 gate 機制無法涵蓋某個 validate_* 的實際需求（例如需要非 gate 語意的獨立呼叫），需要重新開一個具體案例討論，不在本次一次性判定範圍。

**2026-09-02 audit remediation 註記**（finding B6）：`search.cluster_queries` 先前只說「改用相對應 Method」卻沒指名是哪一個——ADR §D4 的 KEEP/RETIRE 列表只解了另外 3 個，唯獨這個沒有。`content.topic_clustering` 是目前 catalog 裡語意最接近的既有 Method（對查詢做主題分群，與對內容做主題分群是同一種分群推理，只是輸入物件不同）；但這是本次的**推論配對**，不是 D4 原本就寫明的裁決。若「查詢分群」與「內容主題分群」在實作上其實需要不同演算法/輸入 schema，這個配對需要重新檢視，屬 `OPEN_QUESTION` `OQ-SC-8`，不強行斷言等同（query-level 的既有 Method 是 `search.query_clustering`）。

## 7. Registry Record

每個 ID 必須有：

```yaml
registry_entry:
  id:
  kind: METHOD | CAPABILITY | RECIPE | DEPENDENCY_REQUEST
  owner:
  status: PROPOSED | CONTRACTED | VALIDATED | RUNTIME_IMPLEMENTED | DEPRECATED | RETIRED | REJECTED | UNCONFIRMED
  evidence_maturity: DOMAIN_PROPOSAL | LITERATURE_SUPPORTED | EMPIRICALLY_VALIDATED | NOT_APPLICABLE   # 2026-09-02 新增第二軸（M6）
  version:
  purpose:
  input_types: []
  output_types: []
  contract_path:
  implementation_path: null
  test_path: null
  aliases: []
  distinct_from: []
  risk_notes: []
  provenance:
source_of_truth_for:
  - "SEARCH_CONTENT_REGISTRY_RECORDS.yaml — every record instantiates this shape (122 records: 71 methods, 4 retired, 32 capabilities, 9 rejected, 3 dependency requests, 3 recipes)"
  - "methods/registry/method-inventory.yaml + contract-backlog.yaml — the ACTIVE global registries this shape must promote into (OQ-SC-19)"
decided_by: >
  ADR-021 §D4 / §D5 / §D10; evidence_maturity axis added per EV-CRIT-M (M-07) and EV-AUDIT-0902
  M6.
```

## 8. Contract Paths

Method：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/contracts/<method_id>.contract.yaml
```

Capability：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/capabilities/contracts/<capability_id>.capability.yaml
```

Registry 不建立第二份 SearchContent-only runtime registry；若需要 domain index，只能是 derived view pointing to canonical global registry。

**Promotion rule（2026-09-02）**：`SEARCH_CONTENT_REGISTRY_RECORDS.yaml` 是 **staging** 記錄集——目前 ACTIVE 的 `methods/registry/method-inventory.yaml`（289 entries）不含任何 SearchContent ID。每個 ID 在其 contract 檔寫成時**同批**升入全域 registry（`phase_3_additions` 樣式）與 `contract-backlog.yaml`，升入前不得出現在任何 Workflow IR（DEFERRED `OQ-SC-19`；MVP 驗收 #2 以此為前提）。

## 9. Domain Recipes

master §54（`L4994-L5084`）的 3 個 recipe 先前在包內消失（`EV-AUDIT-0902` M14）。Recipe id 依 `EV-RECIPE` grammar `^[a-z][a-z0-9-]*$`：

```text
search-content-new-content-v1                 # §54.1 New Content
search-content-refresh-existing-content-v1    # §54.2 Refresh Existing Content
search-content-platform-rule-change-v1        # §54.3 Platform Rule Change
```

Recipe 是 author-facing declarative orchestration，必須 validate against `specs/cognitive/recipe.schema.yaml` 並編譯進 Workflow IR 才可執行（master §54 normative rule；`EV-WORKFLOW`）。recipe 實例、編譯與 golden test 是 Stage 1 交付物（DEFERRED `OQ-SC-18`）；record 已在 `SEARCH_CONTENT_REGISTRY_RECORDS.yaml`（kind `RECIPE`）。

## 10. Validation / Collision Test

Validation deliverable（2026-09-02 落地；取代先前提議但不存在的 `tests/architecture/search-content/id-collision-registry.yaml`——canonical ID + forbidden alias 已由 `SEARCH_CONTENT_REGISTRY_RECORDS.yaml` 的 `status: RETIRED|REJECTED` + `replacement` 承載，不另建第二份清單）：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/architecture/search_content_pack_check.py   # 掛進 tests/run_golden_tests.py
```

它現在就檢查（rule 3）：

```text
same semantic fingerprint cannot have two ACTIVE IDs
no Method ID is also registered as Capability with same semantic
all Workflow IR method/capability refs resolve
all deprecated IDs have migration target
```
