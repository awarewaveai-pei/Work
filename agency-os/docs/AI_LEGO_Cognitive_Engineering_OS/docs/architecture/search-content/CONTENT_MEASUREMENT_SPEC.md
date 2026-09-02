# Content Measurement Specification

**Document ID:** `search-content.content-measurement`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/CONTENT_MEASUREMENT_SPEC.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 Search/AI visibility/engagement/conversion/lifecycle measurement、metric definitions、sampling、attribution、data quality、ContentPerformance projection 與 refresh feedback。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `PUBLISHING_ADAPTER_CONTRACT.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Confirmed Finding

### FINDING-MEAS-01 — v3 ContentPerformance 無法承接 v3 自己定義的 Measurement Contract

**Evidence**：`EV-CRIT-H08`、`EV-V3-MEASURE`。  
**Resolution**：raw measurement、metric definition、measurement run、ContentPerformance projection 分層。

## 2. Measurement Layers

```text
Search visibility
AI visibility / LLMO
Engagement / task completion
Conversion / revenue
Content lifecycle / decay
Experiment / causal outcome
```

Engagement 層目前只有敘事，沒有 MetricDefinition 實例：DEFERRED `OQ-SC-3`。Experiment / causal outcome 依賴 Core Experiment/Outcome 契約：DEPENDENCY `OQ-SC-15`。

## 3. MetricDefinition

```yaml
metric_definition:
  id:
  version:
  name:
  layer:
  numerator:
  denominator:
  unit:
  filters: []
  dimensions: []
  aggregation:
  attribution_window: null
  timezone_policy:
  currency_policy: null
  source_systems: []
  quality_rules: []
  interpretation_limits: []
  owner:
  effective_from:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §32.2 Metric Definition Contract (L3723-L3761)"
decided_by: >
  ADR-021 §D1; FINDING-MEAS-01 — same display name with a different denominator is a different
  metric id/version.
```

Metric name 相同但 denominator 不同 = 不同 metric version/ID，不能只靠顯示名稱。

## 4. MeasurementRun

```yaml
measurement_run:
  id:
  tenant_ref:
  workspace_ref:          # 2026-09-02 補（Domain Model §5 invariant 1）
  project_ref:
  publication_refs: []
  metric_definition_refs: []
  provider_adapter_refs: []
  period:
  timezone:
  collected_at:
  execution_ref:
  raw_snapshot_refs: []
  data_quality_results: []
  status: COMPLETE | PARTIAL | FAILED
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §32.1 Measurement Layers (L3664-L3722)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §41 Measurement Layer + §42 Measurement Adapters (L4455-L4510)"
decided_by: >
  ADR-021 §D1; FINDING-MEAS-01 (raw snapshot / run / projection split).
```

## 5. Raw / Normalized / Projection Layers

```text
Provider raw snapshot
→ normalized measurement facts
→ metric calculation
→ ContentPerformance projection
→ analysis Method
→ RefreshContext
→ Core Decision
```

不得把 GA/GSC/provider API response 直接當 `ContentPerformance` canonical object。

## 6. Search Metrics

最小 metrics：

```text
impressions
clicks
CTR
position/visibility metric
query coverage
URL coverage
qualified organic sessions
conversions
revenue/goal completion
```

每個 provider position semantics 必須在 adapter mapping 中說明，不能把不同平台的「position」直接合併（DEFERRED `OQ-SC-20`）。

**Publication ↔ provider data 的 join key（2026-09-02 裁決，`EV-AUDIT-0902` M13）**：`content_publication.published_url` 經 adapter 宣告的 URL canonicalization（scheme/host 小寫、去除 tracking 參數、尾斜線規則由 adapter mapping 定義）後的值 ＋ `provider_object_id`（若 provider 有）為唯一 join key；GSC/GA4 類 provider 的 URL 維度以同一 canonicalization 對齊。不以 title 或 slug join。

## 7. AI Visibility / LLMO Sampling

每個 aggregate metric 必須保存：

```text
prompt universe version
unique prompts
run count
provider/surfaces
market/locale
capture window
weights
denominator
search-enabled mode
```

示例：

```text
Weighted Mention Rate
= Σ(prompt_weight × mention_indicator) / Σ(prompt_weight)
```

公式只有在 sampling contract 固定時才有可比性。

## 8. Conversion / Attribution

支持多 attribution model：

```text
first touch
last non-direct
position based
provider data-driven metric
experiment-based causal estimate
custom business model
```

每個 report 必須顯示 attribution model；不得把 observational attribution 寫成 causal truth。

**AttributionModel contract（2026-09-02 新增，`EV-AUDIT-0902` M13）**：`attribution_model_ref` 先前是三份文件共用但 resolve 不到任何物件的參照型別。最小 contract：

```yaml
attribution_model:
  id:
  version:
  name:
  type: RULE_BASED | DATA_DRIVEN | EXPERIMENTAL | CUSTOM     # 上列 6 個模型名對應：first touch / last non-direct / position based → RULE_BASED；provider data-driven → DATA_DRIVEN；experiment-based → EXPERIMENTAL；custom business → CUSTOM
  rule_spec: null              # RULE_BASED：touchpoint 權重規則（機讀）
  provider_model_ref: null     # DATA_DRIVEN：provider 模型識別 + 版本
  experiment_ref: null         # EXPERIMENTAL：Core Experiment ref（DEPENDENCY OQ-SC-15）
  attribution_window:
  touchpoint_sources: []
  causal_claim_allowed: false  # 只有 EXPERIMENTAL 且 Core Outcome 支持時可為 true
  calibration_dataset_ref: null   # DEFERRED OQ-SC-2
  owner:
  effective_from:
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_MODEL.md §2.14 content_performance.attribution_model_ref, CONTENT_BRIEF_CONTRACT.md measurement_plan.attribution_model_ref — both resolve to this object"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §32.5 Attribution (L3810-L3828) — the 6 model names transcribed into `type`"
decided_by: >
  ADR-021 §D1 (measurement-layer objects); added 2026-09-02 per EV-AUDIT-0902 M13 so the reference
  type resolves; MVP uses RULE_BASED only.
```

## 9. Currency / Timezone

- 所有 period 使用明確 timezone。
- revenue 保存原幣 + normalized currency（若有），並保存 FX rate source/time/version。
- DST/locale boundary 必須由 canonical time handling 處理；不得用 server local time 默認。

## 10. Data Quality

Gate：

```text
missing data
duplicate events
timezone mismatch
currency mismatch
provider sampling/API gaps
tracking definition change
bot contamination
identity-resolution limitation
attribution limitation
```

Quality result 必須隨 measurement run 保存。

## 11. ContentPerformance Projection

**Schema SSOT 在 `SEARCH_CONTENT_DOMAIN_MODEL.md` §2.14 (ContentPerformance)**——本文件不重複宣告欄位。`baseline_refs` 是未定義的開放問題（`OQ-SC-1`），見該節的 OPEN_QUESTION 標記，本文件不代為解答。

它可重建；不是 raw provider SOR。

## 12. Decay Detection

Method：`measurement.content_decay_detection`

Inputs：

```text
search trend
AI visibility trend
conversion trend
source freshness
technical eligibility
competitor displacement
content age
entity consistency
```

Output 是 observation/analysis，不直接改文章：

```text
DecayObservation   # schema: SEARCH_CONTENT_DOMAIN_MODEL.md §2.16；event ContentDecayDetected（ADR-021 §D6）
→ RefreshContext
→ Core Decision
```

## 13. Causal Experiment

若要宣稱「改動造成提升」：

```text
hypothesis
control/treatment
primary metric
guardrails
sample/duration
stopping rule
analysis method
reversal criteria
```

AI-LEGO Experiment/Outcome machine contract 尚未成熟：DEPENDENCY `OQ-SC-15`；不得另建 SearchContent Experiment truth，且 `attribution_model.causal_claim_allowed` 在此之前恆為 false。

## 14. Proposed Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/metric-definition.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/measurement-run.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/content-performance.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/attribution-model.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/measurement-quality.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/measurement/
```
