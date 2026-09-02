# SearchContent × AI-LEGO Integration Matrix

**Document ID:** `search-content.integration-matrix`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 建立 SearchContent 與 AI-LEGO Core 的唯一整合矩陣，逐物件、逐 contract、逐 runtime 邊界定義誰擁有 canonical truth、SearchContent 可以做什麼、禁止做什麼、缺口如何解鎖。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`
- `Architecture-Constitution-v1.md`
- `REPOSITORY_ARCHITECTURE.md`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Integration Matrix — Canonical Ownership

| Concern / Object | Canonical owner | Baseline maturity（master §3.3 enum；`SEARCH_CONTENT_PACK_COMMON.md` §4.2）| SearchContent role | 禁止事項 | Required integration |
|---|---|---|---|---|---|
| Tenant / Workspace / Project | AI-LEGO Core | `ACTIVE_SCHEMA` | 只保存 ref 與 scope | 不建立 SearchContent tenant/workspace truth | 每個 persisted vertical object 必須攜帶 scope refs（Domain Model §5.1）|
| Source | AI-LEGO Core | `NARRATIVE_DEFINED`（standalone Source contract 尚無；DEPENDENCY `OQ-SC-13`）| `SearchSourceProfile` overlay、source observation | 不建立第二個 Source core；不把 `SRC-*` 當永久 universal grammar | opaque `source_ref` |
| Evidence | AI-LEGO Evidence | `ACTIVE_SCHEMA` | authority/freshness policy assessment、retrieval snapshot | 不複製 canonical evidence quality fields | `evidence_ref` + policy/version snapshot |
| Claim | AI-LEGO Evidence | `ACTIVE_SCHEMA` | 建立／引用 SearchContent claims；支援/反證分析 | 不建立 `SearchClaim` truth model | canonical Claim refs / Evidence Graph edges |
| Sentence-level provenance | AI-LEGO Evidence（`EV-SENTPROV`）| `ACTIVE_SCHEMA` | `content.bind_citations` 產生 link record；`evidence.citation_binding` gate 驗證 | 不另造 citation anchoring schema | sentence-provenance link records |
| Evidence Graph | AI-LEGO Knowledge/Evidence | `ACTIVE_SCHEMA` | 新增合法 graph edges / resolved entity refs | 不建立第二張 SEO/GEO graph 作 canonical truth | graph port / Repository Contract |
| Entity / Relation | AI-LEGO Core target / Evidence Graph minimal shape | `NARRATIVE_DEFINED`（minimal graph-node shape only；DEPENDENCY `OQ-SC-12`）| raw observed entity + optional resolved `entity_ref` | 不把 vertical entity shape 升格成 Core | entity resolution boundary + maturity flag（ADR-021 §D3）|
| Decision | AI-LEGO Core | `ACTIVE_SCHEMA` | `RefreshContext`/priority context → Decision | 禁止 `RefreshDecision`、`ContentDecision` 第二真相 | `decision_ref` |
| Method | AI-LEGO Cognitive | `ACTIVE_SCHEMA`（schema）／`NARRATIVE_DEFINED`（SearchContent contract instances；`OQ-SC-19`）| 定義 domain Method semantics | 不另造 method runtime / 第二 ID 表 | canonical Method Registry + Method Contracts |
| Capability | AI-LEGO Core / Control Plane | `ACTIVE_SCHEMA`（schema）／`NARRATIVE_DEFINED`（instances）| 定義可執行 actions | 不把 reasoning method 假裝成 capability | Capability Contracts + resolver |
| Recipe | AI-LEGO Cognitive | `ACTIVE_SCHEMA`（schema）／`NARRATIVE_DEFINED`（3 個 SearchContent recipes；`OQ-SC-18`）| 組合 domain methods/capabilities | 不直接當 executable IR | validated recipe → compiler |
| Workflow IR | AI-LEGO platform | `ACTIVE_SCHEMA` | 只消費編譯結果 | 禁止 SearchContentWorkflowIR | compile/validate through existing IR |
| Gate Result / gate catalog | AI-LEGO Execution（ADR-011）| `ACTIVE_SCHEMA` | method/domain-specific gate IDs（`search_content.*`）| 不建立第二個 Global Gate catalog；不自訂觸發規則 | Gate Result + `mandatory-gates.yaml`（`EV-MGATES`）|
| Event Ledger | AI-LEGO Execution | `ACTIVE_SCHEMA` | 發出 13 個 vertical aggregate events（ADR-021 §D6）| 不建立第二個 bus/ledger；不重複 Core lifecycle event | event ownership table + idempotency + `provenance_record` |
| Epistemic / authorship labels | AI-LEGO Governance（ADR-004）| `ACTIVE_SCHEMA`（`EV-EPISTEMIC`）| 每個 event/MethodResult/assessment 帶 `provenance_record` | 不自訂第五套成熟度／信任詞彙 | `SEARCH_CONTENT_PACK_COMMON.md` §4.4 對照表 |
| Authority | AI-LEGO Execution | `ACTIVE_SCHEMA` | 宣告 publish/adapter operation 所需 policy/authority | 不自行推導 risk tier = authority level | A0–A4 + policy + approval |
| Risk tier | AI-LEGO Execution（`EV-RISKTIER`）| `ACTIVE_SCHEMA` | `publishing_operation_policy.risk_tier` 用 R0–R4 | 不自訂 risk 詞彙 | R3∪R4 → high-risk gate injection |
| Status codes / reason codes | AI-LEGO Execution（ADR-019，`EV-STATUS`）| `ACTIVE_SCHEMA` | 執行結果用 `final_status`／side state／`reason_code`；`publication_state` 只是 aggregate 狀態 | 不把語意原因膨脹成 top-level state | Domain Model §3 對照表 |
| Audit record | AI-LEGO Execution（`EV-AUDIT`）| `ACTIVE_SCHEMA` | retrieval/publishing per-run telemetry 作 extension 欄位 | 不另立 telemetry schema | Retrieval §10 |
| Rollback record | AI-LEGO Execution（`EV-ROLLBACK`）| `ACTIVE_SCHEMA` | adapter 宣告 rollback type；每次 rollback 產生 record | 不自訂 rollback 終態 | Publishing §11 |
| Deprecation pipeline | AI-LEGO Execution（`EV-DEPRECATION`）| `ACTIVE_SCHEMA` | Method/Capability 退役走七步 | 不自訂較輕流程 | Registry §4 |
| Repository | AI-LEGO Core | `ACTIVE_SCHEMA` | 透過 ports 使用 SQL/vector/graph/FTS/event/metrics/cache | 不直連另一套 DB 成 canonical truth | Repository Contract |
| Live Web/Search API | AI-LEGO Capability/Tool/Provider boundary | `NARRATIVE_DEFINED`（provider capability 尚待實作）| external fresh observation | 不把它畫成 Repository storage engine | provider capability → normalize → Evidence/Observation |
| Artifact | AI-LEGO Core concept | `NARRATIVE_DEFINED`（canonical Artifact record 尚無；DEPENDENCY `OQ-SC-14`）| `artifact_ref`、Publication association、vertical artifact-type catalog（Domain Model §2.17）| 不建立 SearchContent artifact core | opaque ref + Core dependency |
| Publishing | SearchContent vertical + AI-LEGO governance | `NARRATIVE_DEFINED`（adapter/policy 尚未建立）| provider adapters / publication aggregate | 不繞過 Authority/Gate/Policy | adapter contract + publish policy |
| Measurement | SearchContent vertical | `NARRATIVE_DEFINED`（vertical contract 尚未建立）| metrics definitions/snapshots/performance projection/attribution model | 不與 platform observability 混成一套 | metric registry + provider adapters |
| Experiment / Outcome | AI-LEGO data-science/core target | `NARRATIVE_DEFINED`（DEPENDENCY `OQ-SC-15`）| reuse | 不建 SearchExperiment | `experiment_ref` / `outcome_ref` when available |
| Tests harness | AI-LEGO `tests/`（`EV-TESTS`）| `RUNTIME_IMPLEMENTED`（851 golden checks passing 2026-09-02）| 本包驗證器為第 5 個 check family；fixture 走同一契約 | 不另建 vertical test runner | `tests/run_golden_tests.py` |

## 2. 已確認 Findings

### FINDING-IM-01 — SearchContent 不應建立第二套 RAG/Knowledge storage

**Evidence**：`EV-REPO-ARCH`、`EV-REPOSITORY`、`EV-V3-BOUNDARY`。  
**判定**：`PASS`。Knowledge engine 與 vector/graph/FTS storage ownership 已有平台層 owner。  
**實作要求**：SearchContent 只提供 retrieval policy / query plan / domain filters。

### FINDING-IM-02 — Live Web Search 必須與 Repository retrieval 分流

**Evidence**：`EV-CRIT-H03`、`EV-REPOSITORY`、`EV-CAPABILITY`。  
**判定**：`REQUIRED_CORRECTION`。External provider call 是 executable capability/tool interaction，不是持久化 storage engine。  
**結果**：所有 live result 必須先成為 provider observation，再視需要 promote/normalize 成 Evidence。

### FINDING-IM-03 — Entity 目前沒有成熟 standalone Core contract

**Evidence**：`EV-EGRAPH`、`EV-CRIT-H04`。  
**判定**：`DEPENDENCY`。Evidence Graph 明確記錄 Entity/Relation 原先無 standalone schema，現有 shape 只足以作 minimal graph node/edge。  
**結果**：SearchObservation 必須同時保存 `raw_entity` 與 optional `entity_ref`，不得把 raw provider string 當 canonical entity。（DEPENDENCY `OQ-SC-12`）

### FINDING-IM-04 — Method / Capability catalog 必須在任何 contract 建置前收斂

**Evidence**：`EV-CRIT-H01`、`EV-CRIT-H06`、`EV-CRIT-H07`、`EV-METHOD`、`EV-CAPABILITY`。  
**判定**：`BLOCKING_CONVERGENCE`。  
**結果**：先完成文件 8；未完成前不得批次建立 SearchContent Method/Capability contracts。

### FINDING-IM-05 — Event namespace 開放，但 event semantic ownership 不是自由的

**Evidence**：`EV-EVENT`、`EV-CRIT-H05`。  
**判定**：`BLOCKING_CONVERGENCE` → **RESOLVED by ADR-021 §D6**：`ContentPublished` 改為三個 ContentPublication aggregate events；`ArtifactPublished` 在 Core 只有名稱無 payload contract（DEPENDENCY `OQ-SC-16`），只在 Core 真的發出時被引用。

## 3. Cross-document Ownership

| 文件 | 唯一權責 | 不得承擔 |
|---|---|---|
| 1 Integration Matrix | Core↔Vertical ownership/依賴 | Method 細節、domain object field 細節 |
| 2 Boundary ADR | 架構邊界、repo/path/event ownership decision | 詳細 schema |
| 3 Domain Model | Vertical object semantics / relations | Core object redefinition |
| 4 Source/Authority | Source overlay、authority/freshness policy | canonical Evidence rewrite |
| 5 Retrieval | retrieval request/rerank/evidence snapshot | second repository engine |
| 6 Search Intelligence | observation/snapshot/query models | ContentBrief/Publishing truth |
| 7 Content Brief | brief contract | canonical Decision |
| 8 Method/Capability Registry | machine ID SSOT | runtime workflow representation |
| 9 Quality Gates | domain gate catalog | Global/High-risk gate catalog |
| 10 Publishing Adapter | external publication port | content strategy / measurement truth |
| 11 Measurement | metrics/attribution/performance | platform logs/telemetry replacement |
| 12 MVP Slice | integration execution/test | redefine any upstream contract |
| 0 Pack Common | 共同段落（工程身份／路徑／證據表／詞彙對照／驗證指令）| 任何 object/gate/ID 定義 |
| R Registry Records / Gate Records / Open Questions（3 個 YAML）| 機器可讀記錄本體 | 敘事裁決 |

### 3.1 Field-level Schema SSOT（object → 唯一 schema 文件；其餘只准 by-reference）

`EV-AUDIT-0902` 任務 3 要求的權責表。驗證器 rule 2 要求每個 contract 區塊自帶 `source_of_truth_for`／`decided_by`，此表是人讀的索引：

| Object | Schema SSOT | 只准 by-reference 的文件 |
|---|---|---|
| search_source_profile | Domain Model §2.1 | Source Profile §2 |
| search_query / search_snapshot | Domain Model §2.2 / §2.3 | Intelligence §3（capture_request/result 是 operation IO，非 object）|
| search_observation / competitor / ai_answer / citation / ranking observation | Domain Model §2.4–§2.8 | Intelligence §5–§8 |
| topic_cluster | Domain Model §2.9 | Brief §2（topic refs）|
| authority_assessment / freshness_assessment | Domain Model §2.10 | Source Profile §5–§6（policy 定義判定規則，不定義欄位）|
| claim_scope（enum）| Source Profile §4 | Domain Model §2.10（nested copy）|
| authority_policy / freshness_policy | Source Profile §5 / §6 | — |
| evidence_pack | Domain Model §2.11 | Retrieval §7 |
| search_evidence_retrieval_request / retrieval_candidate / rerank_policy / conflict_analysis | Retrieval §2 / §4 / §5 / §6 | — |
| content_brief（full）| Brief §2 | Domain Model §2.12（identity/state subset）|
| content_publication + state machine + failure enum | Domain Model §2.13 / §3 | Publishing §4（executor）|
| publishing_adapter / create_draft_input / create_draft_output / publishing_operation_policy | Publishing §2 / §3 / §5 | — |
| content_performance | Domain Model §2.14 | Measurement §11、Brief measurement_plan |
| metric_definition / measurement_run / attribution_model | Measurement §3 / §4 / §8 | Brief measurement_plan |
| decay_observation | Domain Model §2.16 | Measurement §12、MVP Step 15 |
| refresh_context | Domain Model §2.15 | — |
| search_content_artifact_type（catalog）| Domain Model §2.17 | Gate Records `applies_to_artifact_types` |
| registry_entry（shape）／records | Registry §7 ／ `SEARCH_CONTENT_REGISTRY_RECORDS.yaml` | Registry §3–§6, §9（人讀目錄）|
| search_content_gate_definition（shape）／records | Quality Gates §3 ／ `SEARCH_CONTENT_GATE_RECORDS.yaml` | Quality Gates §4–§9（人讀目錄）、Publishing §9 |
| open questions | `SEARCH_CONTENT_OPEN_QUESTIONS.yaml` | 每份文件的 `OQ-SC-*` 標記 |

## 4. Integration Acceptance Gate

只有同時滿足下列條件，SearchContent 才能從 `PROPOSED` 進入 machine-contract implementation：

```text
NO_CORE_MODEL_DUPLICATION
AND ONE_CANONICAL_METHOD_CATALOG
AND ONE_CANONICAL_CAPABILITY_CATALOG
AND EVENT_AGGREGATE_OWNERSHIP_RESOLVED
AND LIVE_WEB_BOUNDARY_RESOLVED
AND ENTITY_MATURITY_EXPLICIT
AND CONTENT_BRIEF_AUTHORITY_POLICY_REF_ONLY
AND PHYSICAL_PATH_APPROVED
AND MEASUREMENT_CONTRACT_COMPLETE          # Gate G（2026-09-02 補回，EV-AUDIT-0902 M17）
AND DOCUMENT_COMPLETENESS_VERIFIED         # Gate H（同上；= 驗證器 exit 0）
```

任何一項未通過：`BLOCKED`，不得用 local workaround 繞過。每個 token 的定義與判定方式（先前每個 token 全包只出現一次、無人能評估）：

| Token | 判定 | 現況（2026-09-02）|
|---|---|---|
| `NO_CORE_MODEL_DUPLICATION` | §1 表每列的「禁止事項」無違反；Domain Model 無 Source/Evidence/Claim/Decision/Artifact/IR/Event 的第二定義 | PASS（FINDING-IM-01；ADR-021 §D1）|
| `ONE_CANONICAL_METHOD_CATALOG` | Registry §3 = 唯一 Method 目錄；`SEARCH_CONTENT_REGISTRY_RECORDS.yaml` 每 ID 一筆；驗證器 rule 3 | PASS |
| `ONE_CANONICAL_CAPABILITY_CATALOG` | Registry §5 同上 | PASS |
| `EVENT_AGGREGATE_OWNERSHIP_RESOLVED` | ADR-021 §D6 每個 event 有 aggregate owner；驗證器 rule 8 | PASS |
| `LIVE_WEB_BOUNDARY_RESOLVED` | ADR-021 §D2；Retrieval §1 路徑 B 走 Capability | PASS（FINDING-IM-02）|
| `ENTITY_MATURITY_EXPLICIT` | ADR-021 §D3；`OQ-SC-12` 登記 | PASS（FINDING-IM-03）|
| `CONTENT_BRIEF_AUTHORITY_POLICY_REF_ONLY` | Brief §2 無 `required_source_tiers`；master Errata E-02 | PASS |
| `PHYSICAL_PATH_APPROVED` | ADR-021 §D8 ACCEPTED | PASS |
| `MEASUREMENT_CONTRACT_COMPLETE`（Gate G）| Measurement §3/§4/§8 三個 contract 齊備；`attribution_model_ref` 可解析；`baseline_refs` 明標 `OQ-SC-1` | PASS（with OQ-SC-1 open）|
| `DOCUMENT_COMPLETENESS_VERIFIED`（Gate H）| `tests/architecture/search_content_pack_check.py` exit 0（9 條不變量，`SEARCH_CONTENT_PACK_COMMON.md` §5）| 見 WORKLOG 2026-09-02 REALTEST_EVIDENCE |
