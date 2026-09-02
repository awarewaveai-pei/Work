# Search Intelligence Specification

**Document ID:** `search-content.search-intelligence`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_INTELLIGENCE_SPEC.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 SearchQuery、SearchSnapshot、SearchObservation、SERP/AI-answer/competitor/citation/ranking observations 的 capture/normalization/provenance/event/retention contract。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `SEARCH_EVIDENCE_RETRIEVAL_SPEC.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Core Principle

Search Intelligence 保存的是：

```text
WHAT WAS OBSERVED
WHEN
WHERE / WHICH SURFACE
BY WHICH ADAPTER VERSION
WITH WHICH RAW PAYLOAD
```

不是直接保存：

```text
WHY IT RANKED
WHAT THE ALGORITHM "WANTS"
WHAT AN LLM "PREFERS"
```

後者只能是 Method inference + Evidence。

## 2. Surface Taxonomy

```text
WEB_SEARCH
AI_SEARCH
AI_ANSWER
LOCAL
IMAGE
VIDEO
NEWS
SHOPPING
APP_STORE
MAP
OTHER_PROVIDER_SURFACE
```

Taxonomy 是 SearchContent-owned observation classification，不宣稱 provider 官方 API enum。

## 3. Capture Contract

```yaml
capture_request:
  query_ref:
  provider:
  surface:
  market:
  locale:
  language:
  device_profile: null
  authenticated_state: false
  search_enabled: null
  captured_at:      # 統一自 capture_at（2026-09-02 audit remediation, finding B4）
  raw_response_required: true
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.4 SearchSnapshot (L767-L796) request side"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §25.3 Sampling Contract (L2420-L2441) for AI_ANSWER surfaces"
decided_by: >
  ADR-021 §D2 (external observation path B); captured_at unified from capture_at per EV-AUDIT-0902
  B4.
```

```yaml
capture_result:
  snapshot_ref:
  request_fingerprint:
  raw_artifact_ref:
  content_hash:
  provider_adapter_version:
  captured_at:
  outcome: CAPTURED | PARTIAL | FAILED   # 統一自布林 `partial: false`（2026-09-02 audit remediation, finding B4）——布林無法表示 FAILED，改對齊 SEARCH_CONTENT_DOMAIN_MODEL.md 的 search_snapshot.status enum
  errors: []
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §11.4 SearchSnapshot (L767-L796)"
  - "SEARCH_CONTENT_DOMAIN_MODEL.md §2.3 search_snapshot.status — `outcome` mirrors that enum minus REQUESTED"
decided_by: >
  ADR-021 §D2; boolean `partial` replaced by the outcome enum per EV-AUDIT-0902 B4 (a boolean
  cannot express FAILED).
```

## 4. Normalization

Normalizer 必須是 versioned capability；不得 in-place 改 raw payload。

Output observations 必須可反查 raw snapshot。

### Raw entity vs resolved entity

Confirmed correction：`raw_observed_entity` 與 `entity_ref` 分開。證據：`EV-CRIT-M`、`EV-EGRAPH`。

## 5. SERP/Search Surface Observation

可觀察欄位：

```text
position
result_type
url
title
snippet/excerpt ref
host/domain
visible entities
feature presence
answer box / AI surface presence
```

不得將 `position` 跨不同 surface 直接比較而不帶 surface dimension。每個 provider 的 position 語意由其 adapter mapping 宣告（DEFERRED `OQ-SC-20`）。

## 6. AI Answer Observation

每個 snapshot 至少保存：

```text
provider/product surface
model/surface version if observable
prompt/query
market/locale
capture time
search-enabled state if observable
answer raw artifact
citations
mentioned entities
competitor co-mentions
```

一個 snapshot 不是 stable truth；LLMO measurement 必須 longitudinal sampling。

## 7. Competitor Intelligence

CompetitorObservation 必須區分：

```text
observed fact
normalized attribute
derived comparison
strategic recommendation
```

前三層之外的 recommendation 進 Method/Decision，不寫回 raw observation。

## 8. Citation Observation

**Schema SSOT 在 `SEARCH_CONTENT_DOMAIN_MODEL.md` §2.7 (CitationObservation)**——本文件不重複宣告欄位。此處只記錄本 spec 對它的產生方式：由本文件的 AI answer 擷取流程產生每筆 citation，欄位對應為 `ai_answer_observation_ref`（本文件流程輸出）、`cited_url`、`cited_source_ref`（`target_source_ref` 只有 resolver 成功才填；URL 本身不等於 canonical Source）、`context_span_ref`、`claim_context_refs[]`、`citation_position`、`observed_at`。

## 9. Event Ownership

採 ADR 決策後的 vertical events：

```text
SearchSnapshotCaptured        # aggregate: SearchSnapshot
SearchObservationCreated      # aggregate: SearchObservation
SearchSourceChangeObserved    # aggregate: SearchSourceProfile
```

完整 event registry（13 個，含 payload 要求與 idempotency key）見 `ADR-021-search-content-boundary-and-ownership.md` §D6。

不發：

```text
ClaimSuperseded   # Core Claim owner
ArtifactPublished # Core Artifact lifecycle if applicable
```

## 10. Deduplication

Snapshot dedupe key：

```text
provider + surface + normalized query + market + locale + capture window + request options
```

Observation identity 不以 title/url alone 判斷，避免同 URL 在不同位置/surface 被錯誤合併。

## 11. Retention

```text
raw provider payload      → retention policy + CAS hash
normalized observations   → event/version history
aggregated metrics         → measurement store
```

刪除 raw payload 時仍需保留合法 audit metadata/hash，若 privacy policy 要求真正刪除則依 Core redaction/deletion mechanism。各資料類別的保存期限是法遵／產品決策：DEFERRED `OQ-SC-4`（MVP 期間不刪除 raw payload）。

## 12. Data Quality Gates

```text
snapshot has raw artifact/hash
provider adapter version present
locale/market present
capture time present
normalizer version present
raw→observation trace exists
no cross-tenant refs
entity resolution does not erase raw value
```

## 13. Proposed Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/search-query.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/search-snapshot.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/search-observation.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/ai-answer-observation.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/citation-observation.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/ranking-observation.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/intelligence/
```
