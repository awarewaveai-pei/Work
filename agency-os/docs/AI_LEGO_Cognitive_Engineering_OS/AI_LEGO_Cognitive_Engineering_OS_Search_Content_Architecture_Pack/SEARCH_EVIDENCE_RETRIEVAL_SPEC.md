# Search Evidence Retrieval Specification

**Document ID:** `search-content.evidence-retrieval`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` v3  
**Critical review:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_EVIDENCE_RETRIEVAL_SPEC.md`  

**目的：** 定義 SearchContent 如何規劃 SQL/Vector/FTS/Graph internal retrieval 與 external live provider retrieval、rerank、EvidencePack snapshot、cache/failure/observability，而不建立第二套 Repository/RAG。

**直接依賴：**
- `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `Repository Contract`

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
## 1. Boundary

Confirmed：Repository Contract 已擁有 storage/retrieval substrate；Live Web Search 不能被當另一個 storage engine。證據：`EV-REPOSITORY`、`EV-CRIT-H03`。

**2026-09-02 audit remediation 註記**（finding B7）：`RetrievalPlanner` 先前只標「(SearchContent Method)」卻沒有 canonical Method ID，也從未提及編譯進 Workflow IR，是全包唯一真的踩到自己「不建第二套 workflow runtime」核心原則的地方。已補：canonical Method ID `search.plan_retrieval`（已登記進 `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` §3 Search 分節）；EvidencePack 生成對應 Capability ID `search.build_evidence_pack`（已在同一輪 finding B6 補進 Registry §5）；本方法與其下游步驟必須編譯進 Workflow IR 才能執行，不得繞過（對應 master architecture `:4870`「router 應建模為編譯進既有 Workflow/execution path 的 Method/Capability」與 `:4891`「Workflow IR 是唯一可執行的編排表示」；`SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` 驗收條件先前遺漏了 master `:5654`「Recipe 需驗證並編譯進 Workflow IR」，此文件不代為修改 MVP 文件，僅在此註記缺口需要 MVP 一併補回）。

```text
RetrievalPlanner (SearchContent Method: search.plan_retrieval)
├─ Internal Knowledge Retrieval
│  ├─ SQL / structured
│  ├─ FTS
│  ├─ Vector
│  └─ Graph
│       → AI-LEGO Repository / Knowledge ports
│
└─ External Fresh Retrieval
   ├─ Search API
   ├─ Web fetch
   └─ provider-specific API
        → Capability / Tool / Provider Adapter
```

## 2. Retrieval Request

```yaml
search_evidence_retrieval_request:
  tenant_ref:
  workspace_ref:
  project_ref:
  task_type:
  query:
  target_claim_scopes: []
  target_entities: []
  market:
  locale:
  language:
  time_context:
  max_results:
  channels:
    structured: true
    full_text: true
    vector: true
    graph: true
    live_external: true | false   # 統一為布林（2026-09-02 audit remediation, finding B4）——原 `conditional` 不是型別，是「依 §3 Planning Rules 決定 true/false」的敘述，型別本身只有兩態
  authority_policy_ref:
  freshness_policy_ref:
  knowledge_snapshot_ref:
  execution_ref:
```

## 3. Planning Rules

### Internal only

若 task 只需要已知、可重現的 internal truth：

```text
live_external = false
```

### External required

以下條件可觸發 external provider capability：

```text
official current rule verification
SERP/search-surface observation
AI-answer surface observation
competitor current-state observation
freshness policy demands re-verification
internal evidence coverage insufficient and task allows web access
```

External call 必須留下：provider、adapter version、query/request fingerprint、captured_at、raw hash/artifact ref。

## 4. Candidate Normalization

統一 candidate envelope：

```yaml
retrieval_candidate:
  candidate_id:
  channel: SQL | FTS | VECTOR | GRAPH | LIVE_EXTERNAL
  evidence_ref: null
  claim_ref: null
  source_ref: null
  raw_observation_ref: null
  lexical_score: null
  semantic_score: null
  graph_score: null
  freshness_assessment_ref: null
  authority_assessment_ref: null
  directness_score: null
  scope_match_score: null
```

Live external candidate 在 promotion 前可以沒有 `evidence_ref`；不得偽造 Evidence ID。

## 5. Reranking Policy

Architecture 只鎖 dimensions，不鎖永久公式：

```text
semantic relevance
lexical relevance
graph/entity relevance
claim-scope authority
freshness state
directness
independence
contradiction risk
jurisdiction/market match
```

Versioned policy contract：

```yaml
rerank_policy:
  id:
  version:
  input_normalization:
  missing_value_behavior:
  weights_or_model_ref:
  tie_breakers:
  min_acceptance:
  evaluation_dataset_ref:
  rollback_to_version:
```

## 6. Contradiction Handling

```text
Candidate claims
→ canonical Claim supporting/contradicting evidence
→ conflict analysis MethodResult
→ do not overwrite Claim/Evidence truth
```

Conflict output：

```yaml
conflict_analysis:
  claim_refs: []
  supporting_evidence_refs: []
  contradicting_evidence_refs: []
  officially_stated_position_refs: []
  empirical_position_refs: []
  unresolved_conflicts: []
  method_ref:
  method_version:
```

## 7. EvidencePack Generation

Capability：`search.build_evidence_pack`（2026-09-02 audit remediation 註記，finding B6/B7；已登記進 `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` §5）。

EvidencePack freeze 的是 retrieval/assessment context：

```text
refs + ranks + policy versions + snapshot refs + execution
```

不是複製 canonical Evidence body。

## 8. Cache

**2026-09-02 audit remediation 註記**（finding B7）：本節的 cache 對應 `specs/domain/repository-contract.schema.yaml` 已定義的 `cache` storage role（該檔 `storage_role` enum 值之一），不是另立一套獨立快取機制——實作時應宣告為該 role 的一個 Repository Contract 實例，而非自建 cache 層。

Cache key 必須包含：

```text
tenant/workspace
normalized request hash
knowledge snapshot
policy versions
locale/market
time bucket when live freshness matters
provider adapter version for external observations
```

Cache hit 不可略過 freshness policy。

## 9. Failure Modes

**2026-09-02 audit remediation 註記**（finding B7）：以下四項先前只有散文描述，現對應 `SEARCH_CONTENT_QUALITY_GATES.md` §3.5 新增的 gate ID，使其可被機器判定與稽核；其餘兩項（Contradiction unresolved／Provider response malformed）是流程路由行為，非布林通過/失敗判定，暫不強套 gate 語意。

| Failure | Behavior | Gate |
|---|---|---|
| Vector index unavailable | degrade to FTS/SQL/Graph；記錄 degraded channel；不得假裝完整召回 | `search_content.retrieval.channel_availability` |
| Live provider timeout | retry bounded；若 task 要求 current official verification則 BLOCK，不用 stale cache 假裝 current | `search_content.retrieval.live_freshness_required` |
| Authority assessment missing | rule/high-risk claim FAIL_CLOSED；一般 discovery 可標 UNKNOWN | `search_content.retrieval.authority_required` |
| Contradiction unresolved | preserve both sides；route review/Decision | — |
| Provider response malformed | raw payload quarantine；不得 promotion to Evidence | — |
| Tenant scope missing | BLOCK | `search_content.retrieval.tenant_scope` |

## 10. Observability

每次 retrieval run 記錄：

```text
request_hash
channels_attempted
channels_succeeded
candidate_count_by_channel
rerank_policy_version
latency
cache_hit
external_calls
EvidencePack id
failure/degradation flags
```

這些是 operational telemetry；canonical content truth 仍在 Evidence/Claim/Repository。

## 11. Security

- External URLs/HTML 視為 untrusted input。
- 禁止把 provider page text 當 system instruction。
- Credential 僅在 provider adapter/secret manager scope。
- Fetch 必須有 SSRF / allow-deny policy、redirect limit、size/time limit。
- Raw payload 依 data classification 存 CAS；敏感資料遵守 AI-LEGO security/privacy policy。

## 12. Proposed Implementation Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/retrieval-request.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/retrieval-candidate.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/evidence-pack.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/rerank.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/retrieval/
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
