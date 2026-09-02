# Search Source Profile and Authority Policy

**Document ID:** `search-content.source-authority-policy`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` v3  
**Critical review:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`  

**目的：** 定義 SearchSourceProfile overlay、claim-scope-aware AuthorityAssessment、FreshnessAssessment、政策版本與來源變更處理，避免 P0/P1 固定階級重新變成第二套 Evidence truth。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `specs/evidence/evidence.schema.yaml`
- `specs/evidence/evidence-graph.schema.yaml`

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
| EV-CONST | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md:L1-L84` — Scoped Authority、文件職責、machine-readable contract/ADR 優先序、ADR-006 提案流程。 |
| EV-REPO-ARCH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/REPOSITORY_ARCHITECTURE.md:L1-L220` — Shared Kernel、Knowledge engine、Recipe vertical、方法實作/registry 分層、路徑治理。 |
| EV-ADR006 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md:L1-L181` — physical path 是 architecture；母文件/高風險規格修改使用 `.ai/proposals/`、不可 AI 自我批准。 |
| EV-EVIDENCE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:L1-L180` — canonical Evidence、8 個 quality dimensions、domain-specific hierarchy、source/content 仍有 NEW_DESIGN 邊界。 |
| EV-CLAIM | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/claim.schema.yaml:L1-L178` — canonical Claim、supporting/contradicting Evidence、confidence/provenance。 |
| EV-EGRAPH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence-graph.schema.yaml:L1-L240` — Source/Evidence/Claim/Assumption/Decision/Entity graph；Entity/Relation 僅 minimal NEW_DESIGN；Source/Entity ID grammar 亦屬 NEW_DESIGN。 |
| EV-DECISION | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/decision/decision.schema.yaml:L1-L240` — canonical Decision，包含 criteria/evidence/assumptions/unknowns/recommendation/human judgment/reversal/monitoring/outcome。 |
| EV-METHOD | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/method.schema.yaml:L1-L220` — canonical Method Contract；ADR-005 bare `<family>.<name>` grammar。 |
| EV-CAPABILITY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/capability-contract.schema.yaml:L1-L280` — Capability ≠ Method；Capability Contract 與 ID grammar。 |
| EV-WORKFLOW | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/workflow/workflow-ir.schema.yaml:L1-L220` — Recipe/Method 與 executable Workflow IR 分層；IR node 嚴格區分 method/capability。 |
| EV-GATE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/gate.schema.yaml:L1-L240` — Gate Result；ADR-011 Global/High-risk ownership；method-specific gate namespace 可擴充。 |
| EV-EVENT | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/event-ledger.schema.yaml:L1-L260` — canonical Event Ledger；`ArtifactPublished` 已存在；event_type 為 open PascalCase；event replay/idempotency invariants。 |
| EV-AUTH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/authority.schema.yaml:L1-L230` — A0–A4；Capability ≠ Authority；A3/A4 的 policy/gate/approval 條件。 |
| EV-REPOSITORY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/repository-contract.schema.yaml:L1-L230` — Repository Contract；vector/graph/FTS/event/metrics/cache/queue 等 storage roles；app 不直接依賴 DB。 |
| EV-V3-BOUNDARY | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L68-L240` — v3 horizontal/vertical boundary、Core reuse、maturity model。 |
| EV-V3-AUTH | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L385-L651` — authority/freshness/retrieval policy。 |
| EV-V3-BRIEF | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L1028-L1163` — ContentBrief/EvidencePack。 |
| EV-V3-METHODS | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L3928-L4257` 與 `L4923-L5180` — domain Method/Capability catalogs、recipes/events/gates。 |
| EV-V3-PUBLISH | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L4337-L4484` — Publishing engine/safety/publication object。 |
| EV-V3-MEASURE | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L4485-L4680` — measurement/performance/refresh。 |
| EV-V3-SOURCE | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md:L4722-L4922` — SearchSourceProfile、ingestion、Knowledge Card、Hybrid Retrieval Router。 |
| EV-CRIT-H01 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L496-L585` — Method namespace collision 已確認。 |
| EV-CRIT-H02 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L586-L653` — ContentBrief `required_source_tiers` 與 claim-scope authority 衝突。 |
| EV-CRIT-H03 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L654-L715` — Live Web Search boundary 錯置。 |
| EV-CRIT-H04 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L716-L767` — Entity maturity 被寫得過高。 |
| EV-CRIT-H05 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L768-L868` — Event semantic ownership/duplicate 風險。 |
| EV-CRIT-H06 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L869-L914` — Method catalog 分裂。 |
| EV-CRIT-H07 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L915-L978` — Capability catalog 分裂。 |
| EV-CRIT-H08 | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L979-L1036` — ContentPerformance 太薄。 |
| EV-CRIT-M | `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md:L1037-L1455` — runtime wording、repo path、Source ID、SearchObservation Entity、domain method shape、publishing approval、evidence versioning、gate mapping、section numbering。 |
## 1. Confirmed Findings

### FINDING-SA-01 — Evidence 已擁有 source_authority / recency / hierarchy
**Evidence**：`EV-EVIDENCE`。  
**結果**：SearchContent 不得建立另一個 canonical evidence authority 欄位集合。

### FINDING-SA-02 — P0/P1 不可當 universal truth order
**Evidence**：`EV-EVIDENCE` 明文 `hierarchy_tier` 是 domain-specific；`EV-CRIT-H02` 已確認 v3 Brief 的固定 P0/P1 要求與 claim-scope 模型衝突。  
**結果**：P0–P3 只可作 source class / policy input，不可當全域比較公式。

### FINDING-SA-03 — Core Source standalone contract 尚未成熟
**Evidence**：`EV-EGRAPH` 記錄 Source/Entity 只有 minimal/new-design graph support；`EV-CRIT-M`（M-04）。  
**結果**：`source_ref` 必須 opaque；不得將 `SRC-*` 固化為 vertical API public contract。

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
```

Assessment：

```yaml
freshness_assessment:
  source_ref:
  evidence_ref:
  policy_ref:
  policy_version:
  evaluated_at:
  last_verified_at:
  next_review_at:
  state: CURRENT | REVIEW_DUE | STALE | SUPERSEDED | RETRACTED | UNKNOWN
  rationale:
```

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
