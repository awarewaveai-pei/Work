# ADR — SearchContent Boundary and Ownership

**Document ID:** `adr.search-content-boundary-and-ownership`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` v3  
**Critical review:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md`  

**目的：** 把 SearchContent 是否為 AI-LEGO vertical、Core/vertical ownership、外部搜尋邊界、Method/Capability/Event ownership、repo path authority 一次裁決，避免未來 12 份文件各自決定。

**直接依賴：**
- `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md`
- `Architecture-Constitution-v1.md`
- `REPOSITORY_ARCHITECTURE.md`
- `ADR-006`

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
## 1. Status

```yaml
status: PROPOSED
approval_required: true
self_approval_by_ai: forbidden
```

此 ADR 文件目前是完整 draft；**不能因為文件已寫完就視為 ACCEPTED**。接受動作必須由 operator 明示核准，並依既有 ADR/提案流程落地。

## 2. Context

v3 已成功把 SearchContent 從「AI Writer」提升為 Search/Content Intelligence vertical，但 Critical Review 確認仍有 8 個 High findings，其中最危險的不是第二套 RAG，而是 machine semantic duplication：Method ID、Capability catalog、Event semantic ownership。證據：`EV-CRIT-H01`～`EV-CRIT-H08`。

如果不先用 ADR 裁決，下列狀況會在 implementation 階段形成不可逆重工：

```text
seo.search_intent_analysis vs search.intent_analysis
content.content_gap_analysis vs search.content_gap_analysis
ContentPublished vs ArtifactPublished
raw observed entity vs canonical Entity
live web provider vs Repository retrieval
```

## 3. Decision Drivers

權重由高到低：

1. Canonical truth uniqueness
2. Backward/forward compatibility
3. Reproducibility / replay
4. Failure containment / rollback
5. 30-year provider independence
6. Security / least privilege
7. Testability
8. Operational simplicity
9. Performance
10. Developer ergonomics

## 4. Options Considered

### Option A — SearchContent 建成獨立 mini-platform

內容：自己的 Source/Evidence/RAG/Workflow/Decision/Event/Artifact。  
**Reject**。直接違反 Shared Kernel 與既有 ACTIVE contracts。證據：`EV-REPO-ARCH`、`EV-EVIDENCE`、`EV-DECISION`、`EV-WORKFLOW`、`EV-EVENT`。

### Option B — SearchContent 完全不新增 domain objects，只用 generic Core

**Reject**。SearchQuery/SearchSnapshot/SearchObservation/ContentBrief/Publication/Performance 具有明確垂直語意；硬塞到 generic Core 會讓 Core 被 SEO/CMS/provider 細節污染。

### Option C — Thin vertical + canonical Core reuse（採用）

```text
Core owns invariants and cross-vertical truth
SearchContent owns vertical semantics / policy / adapters / observations
Recipes compile to existing Workflow IR
Writes pass existing Policy / Authority / Gate / Event mechanisms
```

## 5. Decision

### D1 — Bounded Context

SearchContent 是 **domain vertical**，不是新的 platform plane。

SearchContent 可擁有：

```text
SearchSourceProfile
AuthorityAssessment / FreshnessAssessment snapshots
SearchQuery
SearchSnapshot
SearchObservation
CompetitorObservation
AIAnswerObservation
CitationObservation
RankingObservation
TopicCluster
EvidencePack (retrieval snapshot only)
ContentBrief
ContentPublication
ContentPerformance projection
RefreshContext
Domain Method semantics
Domain Capability declarations
Domain Recipes
Domain/method-specific Gates
Publishing adapters
Measurement adapters
```

SearchContent 不得擁有 canonical：

```text
Source
Evidence
Claim
Decision
Artifact
Workflow IR
Event Ledger
Global / High-risk Gate catalog
Authority ladder
Repository storage substrate
```

### D2 — External Live Search Boundary

採雙路徑：

```text
A. Internal Knowledge Retrieval
   SearchContent query plan
   → AI-LEGO Knowledge/Repository ports
   → SQL/Vector/FTS/Graph

B. External Fresh Observation
   SearchContent request
   → Capability / Tool / Provider Adapter
   → raw provider snapshot
   → normalize + provenance
   → SearchObservation
   → optional Evidence promotion
```

External API 絕不成為 Repository Tier-0 truth。

### D3 — Entity Boundary

直到 canonical Core Entity contract 成熟：

```yaml
raw_observed_entity:
  provider_type:
  provider_value:
  raw_payload_ref:

entity_ref: null  # only populated after resolver succeeds
```

不得把 Evidence Graph 的 minimal `entity_node` 擴張成 SearchContent-specific Core Entity schema。

### D4 — Method Namespace

Canonical 方法 family 規則：

```text
search.*       = cross-surface collection/normalization/observation reasoning only
seo.*          = SEO analysis
geo.*          = GEO analysis
aeo.*          = AEO analysis
llmo.*         = LLM visibility/representation analysis
entity.*       = entity resolution/consistency
local.*        = local-search analysis
content.*      = content strategy / brief / lifecycle reasoning
sxo.* / cro.*  = experience/conversion reasoning
aso.*          = app-store analysis
measurement.*  = performance/decay analysis
```

已確認碰撞採下列裁決：

```text
KEEP seo.search_intent_analysis
RETIRE/DO_NOT_CREATE search.intent_analysis

KEEP content.content_gap_analysis
RETIRE/DO_NOT_CREATE search.content_gap_analysis

KEEP content.topic_clustering
RETIRE/DO_NOT_CREATE search.topic_clustering

KEEP seo.entity_coverage_analysis
DO NOT CREATE search.entity_gap_analysis unless a distinct cross-surface semantic is later ADR-defined
```

這些是本 ADR 的 architecture-level canonicalization；實際 registry 由文件 8 落地。

### D5 — Capability Boundary

「需要推理得出答案」預設為 Method；「執行外部/系統 action」為 Capability。

因此不建立：

```text
search.classify_intent capability
search.cluster_queries capability
search.detect_content_gap capability
```

其認知工作由 Method 執行；Capability 僅負責 fetch/store/generate/publish/measure 等 action。

### D6 — Event Ownership

保留 vertical events：

```text
SearchSnapshotCaptured
SearchObservationCreated
TopicClusterCreated
ContentOpportunityCreated
ContentBriefCreated
ContentBriefApproved
ContentPerformanceCaptured
ContentDecayDetected
RefreshContextCreated
```

重新裁決：

```text
ContentPublished → 不作 canonical Artifact lifecycle event。
                  採 ContentPublicationCreated / ContentPublicationVerified
                  並引用 core ArtifactPublished（若該 Core event 被發出）。

OfficialSourceChanged → 改 SearchSourceChangeObserved，表示 vertical observation。
ClaimSuperseded      → SearchContent 不擁有；只消費 Core Claim lifecycle event。
```

所有 event 都必須有 aggregate owner、schema version、idempotency key、replay-safe consumer。

### D7 — Publishing Authority

不採固定「publish = A4」。

```text
Create Draft / Preview → 依 policy 可 A1/A2 類型
Reversible Production Publish → 依 policy + Gate + Authority，通常落 A3 類語意
Regulated/irreversible/external high-impact → A4 + explicit human authority
```

實際 mapping 必須由 publishing policy 明文定義，不用數字相等推導。證據：`EV-AUTH`。

### D8 — Repo Namespace

採用 logical namespace：

```text
docs/architecture/search-content/
specs/search-content/
policies/search-content/
```

Method/Capability/Recipe 不建立 vertical 私有 registry：

```text
methods/contracts/
methods/registry/
capabilities/contracts/
recipes/validated/
```

仍使用 AI-LEGO 既有全域 machine registry。

physical path 只有在此 ADR 被接受後才成為正式決策。

## 6. Consequences

### Positive
- 消除第二套 platform 的 blast radius。
- ID semantics 在 contract 建置前收斂。
- Provider/CMS/model 可替換。
- 所有 vertical write 能 replay/audit/rollback。

### Costs
- 初期必須先做 integration convergence，不能直接開始寫 Writer/CMS connector。
- Source/Artifact/Entity Core maturity gap 需以 opaque ref/explicit dependency 管理。

## 7. Migration

若 repo 已出現任何被本 ADR 淘汰的 SearchContent ID：

```text
1. freeze new usage
2. inventory all refs with git grep
3. produce alias/deprecation map
4. migrate recipes/contracts
5. run full contract tests
6. leave tombstone/deprecation entry
7. only then delete implementation
```

禁止全域 find/replace 不留 compatibility map。

## 8. Rollback

此 ADR rollback 的條件只有：

```text
A. 證明 vertical 必須擁有某 Core object 才能滿足不可替代需求；或
B. AI-LEGO Core contract 本身被更高權威 ADR/contract 改寫。
```

Rollback 不代表回到 Option A；必須新 ADR 說明新的 ownership。

## 9. Acceptance Criteria

```text
[ ] Operator explicitly approves ADR
[ ] Integration Matrix has no UNRESOLVED ownership collision
[ ] Method catalog canonicalized
[ ] Capability catalog canonicalized
[ ] Event ownership table canonicalized
[ ] External live search uses Capability/Tool boundary
[ ] Entity maturity explicitly marked
[ ] Proposed physical paths accepted under ADR-006 governance
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
