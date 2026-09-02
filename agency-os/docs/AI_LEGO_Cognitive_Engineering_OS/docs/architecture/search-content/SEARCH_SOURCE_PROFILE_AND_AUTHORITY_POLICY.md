# Search Source Profile and Authority Policy

**Document ID:** `search-content.source-authority-policy`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 SearchSourceProfile overlay、claim-scope-aware AuthorityAssessment、FreshnessAssessment、政策版本與來源變更處理，避免 P0/P1 固定階級重新變成第二套 Evidence truth。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `specs/evidence/evidence.schema.yaml`
- `specs/evidence/evidence-graph.schema.yaml`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Confirmed Findings

### FINDING-SA-01 — Evidence 已擁有 source_authority / recency / hierarchy
**Evidence**：`EV-EVIDENCE`。  
**結果**：SearchContent 不得建立另一個 canonical evidence authority 欄位集合。

### FINDING-SA-02 — P0/P1 不可當 universal truth order
**Evidence**：`EV-EVIDENCE` 明文 `hierarchy_tier` 是 domain-specific；`EV-CRIT-H02` 已確認 v3 Brief 的固定 P0/P1 要求與 claim-scope 模型衝突。  
**結果**：P0–P3 只可作 source class / policy input，不可當全域比較公式。

### FINDING-SA-03 — Core Source standalone contract 尚未成熟
**Evidence**：`EV-EGRAPH` 記錄 Source/Entity 只有 minimal/new-design graph support；`EV-CRIT-M`（M-04）。  
**結果**：`source_ref` 必須 opaque；不得將 `SRC-*` 固化為 vertical API public contract。（DEPENDENCY `OQ-SC-13`）

## 2. SearchSourceProfile

`SearchSourceProfile` 只記 SearchContent 所需的 domain overlay。**Schema SSOT 在 `SEARCH_CONTENT_DOMAIN_MODEL.md` §2.1**——本文件不重複宣告欄位，只描述本政策文件對這個 object 的使用限制與權限來源：

- `search_domains` / `crawl_policy_ref` / `authority_policy_ref` / `freshness_policy_ref` / `legal_or_terms_constraints` / `active_from` / `active_to`：本政策文件是這些欄位語意的**權威內容來源**（decided_by 此文件），但欄位本身的 schema 位置在 Domain Model。
- `tenant_ref` / `workspace_ref` / `created_at` / `updated_at`：平台既有 scoping 慣例，不在本文件重述。

不得複製：

```text
canonical source identity
canonical source body
canonical evidence quality
canonical claim truth
```

## 3. Source Classification

建議分類不是權威排序：

```text
OFFICIAL_PLATFORM
OFFICIAL_REGULATOR
OFFICIAL_VENDOR
STANDARD_BODY
PEER_REVIEWED
PRIMARY_RESEARCH
EMPIRICAL_INDUSTRY_RESEARCH
FIRST_PARTY_DATA
THIRD_PARTY_DATA
EXPERT_ANALYSIS
COMMUNITY_OBSERVATION
COMPETITOR_CONTENT
MODEL_GENERATED_OBSERVATION
```

P0/P1/P2/P3 如需保留，只能做 UI shorthand：

```yaml
source_class_label: P0
policy_semantics: null  # label 本身不決定 claim authority
block_kind: EXAMPLE   # UI shorthand only; not a contract — label never decides claim authority
```

## 4. Claim Scope

AuthorityAssessment 的最小 scope：

```yaml
claim_scope:
  domain: SEO | GEO | AEO | LLMO | CRO | ASO | LOCAL | BRAND | PRODUCT | POLICY
  platform: null
  jurisdiction: null
  assertion_type: RULE | ELIGIBILITY | BEHAVIOR | PERFORMANCE | UX | FACT | OPINION
  effective_at: null
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §7.3 Proposed Authority Assessment (L447-L489)"
  - "SEARCH_CONTENT_DOMAIN_MODEL.md §2.10 authority_assessment.claim_scope — nested copy of this enum; this block is the enum SSOT"
decided_by: >
  ADR-021 §D1; FINDING-SA-02 (P0-P3 are source classes, never a universal truth order).
```

例：

```text
Google official documentation
→ 對「Google 的官方 eligibility / policy」可高權威
→ 對「哪個 UX pattern 提升轉換率」不自動高於 peer-reviewed/experimental evidence
```

## 5. AuthorityAssessment Policy

```yaml
authority_policy:
  id: search_content.authority.v1
  version: 1.0.0
  dimensions:
    - claim_scope_match
    - officialness_for_scope
    - directness
    - method_quality
    - independence
    - geography_match
    - recency
    - contradiction_state
  missing_value_behavior: FAIL_CLOSED_FOR_RULE_CLAIMS
  output:
    tier:
    weight:
    rationale_required: true
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §7 Search-domain Evidence Authority Policy (L381-L489)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §47.2 Initial Authority Sources (L4730-L4744)"
decided_by: >
  ADR-021 §D1; FINDING-SA-01 / SA-02; the score formula is deliberately a versioned policy
  contract, not architecture.
```

Score formula 不寫死在 architecture。若用 weighted model，必須有：

```text
normalization
weight version
missing behavior
calibration dataset
offline evaluation
rollback version
```

## 6. Freshness Policy

Freshness 是「何時要重新驗證」而不是「越新一定越真」。

```yaml
freshness_policy:
  id: search_content.freshness.v1
  version: 1.0.0
  rules:
    - match:
        source_class: OFFICIAL_PLATFORM
        domain: POLICY   # 統一自誤植的 assertion_type: POLICY（2026-09-02 audit remediation, finding B4）——POLICY 是 §1 domain enum 的值，不在 assertion_type enum 內
      review_interval:
      change_detection:
      stale_behavior: BLOCK_FOR_POLICY_CLAIMS
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §8 Search-domain Freshness Policy (L490-L566)"
decided_by: >
  ADR-021 §D1; `domain: POLICY` corrected from the mis-typed `assertion_type: POLICY` per
  EV-AUDIT-0902 B4.
```

Assessment：**Schema SSOT 在 `SEARCH_CONTENT_DOMAIN_MODEL.md` §2.10 (`freshness_assessment`)**——本文件不重複宣告欄位（2026-09-02 移除此處的重複區塊；它比 Domain Model 多的 `rationale` 與缺的 `execution_ref` 已合併進 SSOT，屬 `EV-AUDIT-0902` B2 同類的第四個實例）。本政策文件只定義 `state` 的判定規則：`CURRENT`／`REVIEW_DUE`／`STALE` 由 `review_interval` 與 `last_verified_at` 推得；`SUPERSEDED`／`RETRACTED` 只能由 `SearchSourceChangeObserved` → Evidence supersession 流程（§7）產生，不得由時間推得。

## 7. Source Change

外部來源變更只先形成 observation：

```text
Provider/Crawler detects change
→ SearchSourceChangeObserved event
→ compare content hash / semantic diff
→ identify affected Evidence/Claims
→ create new Evidence/Claim version or supersession request
→ recompute affected Brief/Publication refresh contexts
→ Core Decision where material
```

不得直接「Update Evidence」抹掉舊狀態。證據：`EV-CRIT-M`（M-09）、`EV-EVENT`。

## 8. Policy Files — Proposed Machine Paths

待 ADR path approval 後：

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/authority-assessment.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/freshness.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/search-source-profile.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/authority-assessment.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/freshness-assessment.schema.yaml
```

政策檔不得重複定義 Evidence schema fields；只定義 assessment semantics。

## 9. Tests

必須有：

```text
official policy claim → official source wins when scope matches
conversion claim → official search doc does not automatically win
stale official rule → BLOCK / REVIEW_DUE per policy
fresh competitor article → does not outrank official rule merely due recency
missing jurisdiction → fail closed for jurisdiction-sensitive rule
contradicting evidence → authority result includes contradiction state
```
