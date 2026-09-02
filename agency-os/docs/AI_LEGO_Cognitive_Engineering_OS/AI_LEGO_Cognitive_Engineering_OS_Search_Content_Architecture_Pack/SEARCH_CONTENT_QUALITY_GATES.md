# SearchContent Quality Gates

**Document ID:** `search-content.quality-gates`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` v3  
**Critical review:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_QUALITY_GATES.md`  

**目的：** 建立 SearchContent domain/method-specific Gate catalog、ID/display-name mapping、severity/blocking semantics、evidence requirement，以及與 ADR-011 Global/High-risk gates 的組合規則。

**直接依賴：**
- `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md`
- `specs/execution/gate.schema.yaml`

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
search_content.brand.fact_consistency
search_content.publishing.metadata_validation
```

Gate schema 本身是 open string；此命名是 SearchContent registry convention，不修改 Core enum。

## 3. Gate Record

```yaml
search_content_gate_definition:
  gate_id:
  display_name:
  owner:
  category: DOMAIN_METHOD_SPECIFIC
  applies_to_artifact_types: []
  method_refs: []
  severity: INFO | WARN | BLOCK
  evidence_required: true
  automated_validator_ref: null
  human_review_policy_ref: null
  not_applicable_rules: []
  remediation:
```

Runtime result 仍寫 canonical Gate Result：

```text
gate_id / status / evidence / validator / timestamp / rationale
```

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
search_content.geo.claim_evidence
search_content.geo.entity_clarity
search_content.geo.source_authority
search_content.geo.source_freshness
search_content.aeo.question_coverage
search_content.geo.passage_independence
search_content.aeo.structured_explanation
search_content.geo.contradiction
search_content.geo.unsupported_platform_claim
search_content.llmo.sampling_context
search_content.llmo.entity_representation
```

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
search_content.publishing.structured_data_consistency
search_content.publishing.link_integrity
search_content.publishing.remote_diff
search_content.publishing.approval_binding
search_content.publishing.rollback_readiness
```

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

## 11. Global Gate Composition

執行順序概念：

```text
Domain Gates
+
Risk-triggered Global/High-risk Gates from AI-LEGO
→ all required results evaluated
→ authority/policy decision
```

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
