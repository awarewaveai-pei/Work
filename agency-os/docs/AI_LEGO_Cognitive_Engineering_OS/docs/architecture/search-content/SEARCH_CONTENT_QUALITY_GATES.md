# SearchContent Quality Gates

**Document ID:** `search-content.quality-gates`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_QUALITY_GATES.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 建立 SearchContent domain/method-specific Gate catalog、ID/display-name mapping、severity/blocking semantics、evidence requirement，以及與 ADR-011 Global/High-risk gates 的組合規則。

**直接依賴：**
- `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md`
- `specs/execution/gate.schema.yaml`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Confirmed Boundary

Gate schema 明確保留 method-specific open namespace；Global/High-risk catalog 由 ADR-011 / platform owner 管理。證據：`EV-GATE`。  
因此本文件只定義：

```text
DOMAIN_METHOD_SPECIFIC_GATE
```

不定義第二套 Global Gates。

## 2. Gate ID Format

本 domain 統一：

```text
search_content.<domain>.<gate_name>
```

例：

```text
search_content.seo.search_intent
search_content.geo.citation_readiness
search_content.evidence.claim_evidence
search_content.brand.product_fact_consistency     # 2026-09-02 修正：原例 brand.fact_consistency 在 §6 不存在（EV-AUDIT-0902 M12）
search_content.publishing.metadata_validation
```

Gate schema 本身是 open string；此命名是 SearchContent registry convention，不修改 Core enum。

## 3. Gate Record

```yaml
search_content_gate_definition:
  gate_id:
  display_name:
  owner:
  category: DOMAIN_METHOD_SPECIFIC | DOMAIN_POLICY   # DOMAIN_POLICY = 無對應 Method family 的 policy-driven gate（brand/accessibility/evidence/publishing/measurement；M12）
  applies_to_artifact_types: []                      # 值域：SEARCH_CONTENT_DOMAIN_MODEL.md §2.17 artifact type catalog，"*" = 全部
  method_refs: []
  severity: INFO | WARN | BLOCK                       # MVP 預設；Recipe/Policy 可依 §10 提高
  threshold: null                                     # DEFERRED OQ-SC-6（與 automated_validator_ref 同批落地）
  evidence_required: true
  automated_validator_ref: null
  human_review_policy_ref: null
  not_applicable_rules: []
  remediation:
source_of_truth_for:
  - "SEARCH_CONTENT_GATE_RECORDS.yaml — every record instantiates this shape (59 gates)"
  - "specs/execution/gate.schema.yaml#/gate_catalog.method_specific — the open namespace this domain catalog lives in (EV-GATE :272-279)"
decided_by: >
  ADR-021 §D1 (domain/method-specific gates) and §D4 (DOMAIN_POLICY category); record values per
  EV-AUDIT-0902 task 10.
```

Runtime result 仍寫 canonical Gate Result：

```text
gate_id / status / evidence / validator / timestamp / rationale
```

## 3.5 Retrieval Gates

**2026-09-02 audit remediation 新增**（finding B7）：`SEARCH_EVIDENCE_RETRIEVAL_SPEC.md` §9 Failure Modes 列了 6 種 BLOCK/degradation 行為，先前全部是散文、沒有對應 gate ID 可供機器判定或稽核。補上：

```text
search_content.retrieval.channel_availability      # 對應 §9「Vector index unavailable」，degraded channel 需記錄不得假裝完整召回
search_content.retrieval.live_freshness_required   # 對應 §9「Live provider timeout」，要求 current 驗證時不得用 stale cache
search_content.retrieval.authority_required        # 對應 §9「Authority assessment missing」，rule/high-risk claim FAIL_CLOSED
search_content.retrieval.tenant_scope              # 對應 §9「Tenant scope missing」，硬 BLOCK
```

四筆 record（severity／applies_to_artifact_types／NOT_APPLICABLE 規則／remediation）已在 `SEARCH_CONTENT_GATE_RECORDS.yaml`；threshold 與 validator 實作 DEFERRED `OQ-SC-6`。

## 4. SEO Gates

```text
search_content.seo.search_intent
search_content.seo.title_meta
search_content.seo.heading_structure
search_content.seo.crawlability
search_content.seo.indexability
search_content.seo.canonical
search_content.seo.internal_linking
search_content.seo.structured_data
search_content.seo.entity_coverage
search_content.seo.duplication
search_content.seo.cannibalization
search_content.seo.freshness
```

## 5. GEO/AEO/LLMO Gates

```text
search_content.geo.direct_answerability
search_content.geo.citation_readiness
search_content.geo.entity_clarity
search_content.geo.passage_independence
search_content.aeo.question_coverage
search_content.aeo.structured_explanation
search_content.llmo.sampling_context
search_content.llmo.entity_representation
```

## 5.5 Evidence Gates（跨領域，2026-09-02 自 `geo.*` 拉出）

`EV-AUDIT-0902` M11：v3 的 flat 命名把 claim-evidence／source-authority／freshness／contradiction／unsupported-platform-claim 五個**跨領域**檢查放進 `search_content.geo.*`，導致純 SEO、純 brand、純 local 的內容沒有任何 claim-evidence gate。master §57（`L5147-L5188`）本來就把 `evidence`／`source_authority`／`freshness`／`citation` 列為獨立 bundle 項目。改為獨立 family，`applies_to_artifact_types: ["*"]`：

```text
search_content.evidence.claim_evidence               # was geo.claim_evidence
search_content.evidence.source_authority             # was geo.source_authority
search_content.evidence.source_freshness             # was geo.source_freshness
search_content.evidence.citation_binding             # 新增：每個 rendered citation 解析到 sentence-provenance link（EV-SENTPROV）
search_content.evidence.contradiction                # was geo.contradiction
search_content.evidence.unsupported_platform_claim   # was geo.unsupported_platform_claim
```

舊 `geo.*` 五個 id 記錄於各 record 的 `retired_alias`（本包內無其他消費者，不需 migration tool；未來若出現引用依 `EV-DEPRECATION` 七步）。

`unsupported_platform_claim` 是重要 hard gate：heuristic 不得被寫成 official ranking rule。

## 6. Brand Gates

```text
search_content.brand.voice
search_content.brand.product_fact_consistency
search_content.brand.pricing_fact_consistency
search_content.brand.prohibited_claim
search_content.brand.entity_naming
```

## 7. SXO/CRO Gates

```text
search_content.sxo.message_match
search_content.cro.cta_clarity
search_content.cro.friction
search_content.cro.quantitative_claim_evidence
search_content.cro.dark_pattern
search_content.accessibility.minimum
```

## 8. Publishing Gates

```text
search_content.publishing.required_fields
search_content.publishing.metadata_validation
search_content.publishing.canonical_robots
search_content.publishing.hreflang                      # 2026-09-02 新增（M11：check 無 gate）
search_content.publishing.structured_data_consistency
search_content.publishing.link_integrity
search_content.publishing.media_integrity               # 新增：media refs + alt requirements
search_content.publishing.slug_url                      # 新增
search_content.publishing.redirect_impact               # 新增
search_content.publishing.remote_diff
search_content.publishing.approval_binding
search_content.publishing.rollback_readiness
```

與 `PUBLISHING_ADAPTER_CONTRACT.md` §9 的 12 條 hard check 一一對應（該表 `#1-#12` ↔ 此 12 個 id；record 的 `publish_check` 欄位逐字相同）。

## 9. Measurement Gates

```text
search_content.measurement.metric_definition
search_content.measurement.timezone_currency
search_content.measurement.source_completeness
search_content.measurement.data_quality
search_content.measurement.attribution_declared
search_content.measurement.llmo_denominator
```

## 10. Blocking Policy

Gate definition 不自行決定所有場景 hard/soft；Recipe/Policy 根據 risk/content type 注入。

範例：

```text
crawlability failure on SEO landing page → BLOCK
missing LLMO sample-size note on non-LLMO content → NOT_APPLICABLE + rationale
brand voice deviation → WARN or BLOCK per brand policy
regulated claim evidence failure → BLOCK + high-risk platform gates
```

每個 gate 的 MVP 預設 severity 在 `SEARCH_CONTENT_GATE_RECORDS.yaml`（`severity` 欄）；Recipe/Policy 只能**提高**，不能降低。

## 10.5 Gate Bundles

`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` §2 以「bundle」為納入單位，但先前沒有定義（`EV-AUDIT-0902` M11）。bundle = 具名的 gate id 集合，只是 recipe 的簡寫，不是新的 gate 種類：

| bundle | gate ids（前綴 `search_content.` 省略）|
|---|---|
| `bundle.evidence_core` | `evidence.claim_evidence`, `evidence.source_authority`, `evidence.source_freshness`, `evidence.citation_binding`, `evidence.unsupported_platform_claim` |
| `bundle.seo_core` | `seo.search_intent`, `seo.title_meta`, `seo.heading_structure`, `seo.canonical`, `seo.internal_linking`, `seo.structured_data`, `seo.duplication`, `seo.cannibalization` |
| `bundle.geo_aeo_core` | `geo.direct_answerability`, `geo.citation_readiness`, `geo.entity_clarity`, `aeo.question_coverage` |
| `bundle.brand` | `brand.voice`, `brand.product_fact_consistency`, `brand.pricing_fact_consistency`, `brand.prohibited_claim`, `brand.entity_naming` |
| `bundle.publishing_staged` | `publishing.required_fields`, `publishing.metadata_validation`, `publishing.slug_url`, `publishing.media_integrity`, `publishing.link_integrity` |
| `bundle.publishing_production` | 全部 12 個 `publishing.*` |
| `bundle.measurement` | 全部 6 個 `measurement.*` |
| `bundle.retrieval` | 全部 4 個 `retrieval.*` |

## 11. Global Gate Composition

執行順序概念：

```text
Domain Gates（本目錄，依 recipe/policy 注入的 bundle）
+
Global Gates（14 項，對每個 deliverable 無條件強制，與 risk tier 無關 — EV-GATE :238）
+
High-risk Gates（6 項，只在 risk_tier ∈ {R3, R4} 時追加 — EV-GATE :255-258 / EV-RISKTIER）
→ all required results evaluated
→ authority/policy decision
```

**2026-09-02 更正**（`EV-AUDIT-0902` M10）：先前寫「Risk-triggered Global/High-risk Gates」，會讓實作漏跑 14 個無條件 Global gate。「哪些 gate 在哪些條件下強制」的 policy-as-code 正本是 `policies/ai-execution/mandatory-gates.yaml`（`EV-MGATES`，ACTIVE）；本文件只引用，不自訂觸發規則。

SearchContent 不可把 platform gate pass 狀態複製到自家 aggregate 當另一個 truth；只引用 GateResult refs。

## 12. Tests

每個 BLOCK gate 至少：

```text
1 positive fixture
1 direct negative fixture
1 NOT_APPLICABLE fixture where legal
1 stale/ambiguous input fixture
1 regression fixture for previously found defect
```

`NOT_APPLICABLE` 必須 rationale，遵守 canonical Gate schema。
