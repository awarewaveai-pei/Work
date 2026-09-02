# Search Evidence Retrieval Specification

**Document ID:** `search-content.evidence-retrieval`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_EVIDENCE_RETRIEVAL_SPEC.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 SearchContent 如何規劃 SQL/Vector/FTS/Graph internal retrieval 與 external live provider retrieval、rerank、EvidencePack snapshot、cache/failure/observability，而不建立第二套 Repository/RAG。

**直接依賴：**
- `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`
- `SEARCH_CONTENT_DOMAIN_MODEL.md`
- `Repository Contract`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §9 Search Evidence Retrieval & Reranking (L567-L643)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §51 Hybrid Retrieval Router (L4866-L4892)"
decided_by: >
  ADR-021 §D2 (dual path); live_external typed as boolean per EV-AUDIT-0902 B4; planned by Method
  search.plan_retrieval.
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

## 3.5 Ingestion & Chunking Policy（2026-09-02 補，`EV-AUDIT-0902` M14）

master §48 Ingestion Flow（`L4745-L4787`）定義了 Source → Fetch → Parse → Chunk → Entities → Embeddings → Evidence Graph → Index 的 ingestion leg，並明文「Avoid blind fixed-length chunking where source structure is available」（`:4775`）；本包先前完全沒有這一段，MVP Step 1 直接從「known source refs」開始。補上規則：

1. **Ingestion 走 Core**：`SearchSourceProfile.ingestion_modes` 只宣告模式（`crawl | fetch | feed | manual`）；fetch 由 capability `search.fetch_page`／`search.fetch_site_crawl` 執行（SSRF／size／redirect policy，§11），parse／chunk／embed／index 由 AI-LEGO Knowledge engine 的既有 ports 執行，vertical 不自建 ingestion pipeline（FINDING-IM-01）。
2. **Structure-aware chunking**：有結構的來源依 Document → Heading → Section → Paragraph 切分（master `:4779-4784`）；只有無結構純文字才允許固定長度切分，且必須在 chunk provenance 記錄 `chunking_policy_version`。
3. **Chunk provenance 保留定位資訊**：每個 chunk 帶 page／region／timestamp locator，使 `content.bind_citations` 能產生 `EV-SENTPROV` 的 sentence-level provenance link（否則 `search_content.evidence.citation_binding` gate 無法 PASS）。
4. **規模**：master §63 MVP 以 30–50 個 sources 為量級；MVP Step 1 的「known source refs」必須是已經過此 ingestion leg 的 sources，fixture 需宣告 ingestion 完成狀態。

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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §9 (L567-L643)"
decided_by: >
  ADR-021 §D2; a LIVE_EXTERNAL candidate may lack evidence_ref before promotion — Evidence ids are
  never fabricated.
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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §9 reranking dimensions (L567-L643)"
decided_by: >
  ADR-021 §D1 (vertical retrieval policy); dimensions fixed, formula versioned — never hard-coded
  in architecture.
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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §10 Contradiction / Conflict Analysis (L644-L701)"
decided_by: >
  ADR-021 §D1; producer Method search.source_conflict_analysis; never overwrites Claim/Evidence
  truth.
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

這些是 operational telemetry；canonical content truth 仍在 Evidence/Claim/Repository。承載方式：作為平台 canonical audit record（`EV-AUDIT`，`specs/execution/audit.schema.yaml`）的 extension 欄位寫入，不另立一套 per-run telemetry schema（`EV-AUDIT-0902` M9）。

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
