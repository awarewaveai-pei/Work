# SearchContent × AI-LEGO Integration Matrix

**Document ID:** `search-content.integration-matrix`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md` v3  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md`  

**目的：** 建立 SearchContent 與 AI-LEGO Core 的唯一整合矩陣，逐物件、逐 contract、逐 runtime 邊界定義誰擁有 canonical truth、SearchContent 可以做什麼、禁止做什麼、缺口如何解鎖。

**直接依賴：**
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md`
- `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`
- `Architecture-Constitution-v1.md`
- `REPOSITORY_ARCHITECTURE.md`

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
| EV-CONST | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/Architecture-Constitution-v1.md:L1-L90` — Scoped Authority、文件職責、machine-readable contract/ADR 優先序、ADR-006 提案流程。 |
| EV-REPO-ARCH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/REPOSITORY_ARCHITECTURE.md:L1-L220` — Shared Kernel、Knowledge engine、Recipe vertical、方法實作/registry 分層、路徑治理。 |
| EV-ADR006 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md:L1-L220` — physical path 是 architecture；母文件/高風險規格修改使用 `.ai/proposals/`、不可 AI 自我批准。 |
| EV-EVIDENCE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence.schema.yaml:L1-L180` — canonical Evidence、8 個 quality dimensions、domain-specific hierarchy、source/content 仍有 NEW_DESIGN 邊界。 |
| EV-CLAIM | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/claim.schema.yaml:L1-L180` — canonical Claim、supporting/contradicting Evidence、confidence/provenance。 |
| EV-EGRAPH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/evidence/evidence-graph.schema.yaml:L1-L240` — Source/Evidence/Claim/Assumption/Decision/Entity graph；Entity/Relation 僅 minimal NEW_DESIGN；Source/Entity ID grammar 亦屬 NEW_DESIGN。 |
| EV-DECISION | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/decision/decision.schema.yaml:L1-L240` — canonical Decision，包含 criteria/evidence/assumptions/unknowns/recommendation/human judgment/reversal/monitoring/outcome。 |
| EV-METHOD | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/cognitive/method.schema.yaml:L1-L220` — canonical Method Contract；ADR-005 bare `<family>.<name>` grammar。 |
| EV-CAPABILITY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/capability-contract.schema.yaml:L1-L280` — Capability ≠ Method；Capability Contract 與 ID grammar。 |
| EV-WORKFLOW | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/workflow/workflow-ir.schema.yaml:L1-L220` — Recipe/Method 與 executable Workflow IR 分層；IR node 嚴格區分 method/capability。 |
| EV-GATE | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/gate.schema.yaml:L1-L240` — Gate Result；ADR-011 Global/High-risk ownership；method-specific gate namespace 可擴充。 |
| EV-EVENT | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/event-ledger.schema.yaml:L1-L260` — canonical Event Ledger；`ArtifactPublished` 已存在；event_type 為 open PascalCase；event replay/idempotency invariants。 |
| EV-AUTH | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/execution/authority.schema.yaml:L1-L230` — A0–A4；Capability ≠ Authority；A3/A4 的 policy/gate/approval 條件。 |
| EV-REPOSITORY | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/domain/repository-contract.schema.yaml:L1-L230` — Repository Contract；vector/graph/FTS/event/metrics/cache/queue 等 storage roles；app 不直接依賴 DB。 |
| EV-V3-BOUNDARY | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L68-L240` — v3 horizontal/vertical boundary、Core reuse、maturity model。 |
| EV-V3-AUTH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L385-L651` — authority/freshness/retrieval policy。 |
| EV-V3-BRIEF | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L1028-L1163` — ContentBrief/EvidencePack。 |
| EV-V3-METHODS | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L3928-L4257` 與 `L4923-L5180` — domain Method/Capability catalogs、recipes/events/gates。 |
| EV-V3-PUBLISH | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4337-L4484` — Publishing engine/safety/publication object。 |
| EV-V3-MEASURE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4485-L4680` — measurement/performance/refresh。 |
| EV-V3-SOURCE | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md:L4722-L4922` — SearchSourceProfile、ingestion、Knowledge Card、Hybrid Retrieval Router。 |
| EV-CRIT-H01 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L496-L585` — Method namespace collision 已確認。 |
| EV-CRIT-H02 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L586-L653` — ContentBrief `required_source_tiers` 與 claim-scope authority 衝突。 |
| EV-CRIT-H03 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L654-L715` — Live Web Search boundary 錯置。 |
| EV-CRIT-H04 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L716-L767` — Entity maturity 被寫得過高。 |
| EV-CRIT-H05 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L768-L868` — Event semantic ownership/duplicate 風險。 |
| EV-CRIT-H06 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L869-L914` — Method catalog 分裂。 |
| EV-CRIT-H07 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L915-L978` — Capability catalog 分裂。 |
| EV-CRIT-H08 | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L979-L1036` — ContentPerformance 太薄。 |
| EV-CRIT-M | `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md:L1037-L1455` — runtime wording、repo path、Source ID、SearchObservation Entity、domain method shape、publishing approval、evidence versioning、gate mapping、section numbering。 |
## 1. Integration Matrix — Canonical Ownership

| Concern / Object | Canonical owner | Baseline maturity | SearchContent role | 禁止事項 | Required integration |
|---|---|---|---|---|---|
| Tenant / Workspace / Project | AI-LEGO Core | Core architecture / Tenant ACTIVE | 只保存 ref 與 scope | 不建立 SearchContent tenant/workspace truth | 每個 persisted vertical object 必須攜帶 scope refs |
| Source | AI-LEGO Core | Core concept；standalone Source contract 尚未成熟 | `SearchSourceProfile` overlay、source observation | 不建立第二個 Source core；不把 `SRC-*` 當永久 universal grammar | opaque `source_ref`；等待 Core Source contract |
| Evidence | AI-LEGO Evidence | `ACTIVE_SCHEMA` | authority/freshness policy assessment、retrieval snapshot | 不複製 canonical evidence quality fields | `evidence_ref` + policy/version snapshot |
| Claim | AI-LEGO Evidence | `ACTIVE_SCHEMA` | 建立／引用 SearchContent claims；支援/反證分析 | 不建立 `SearchClaim` truth model | canonical Claim refs / Evidence Graph edges |
| Evidence Graph | AI-LEGO Knowledge/Evidence | `ACTIVE_SCHEMA` | 新增合法 graph edges / resolved entity refs | 不建立第二張 SEO/GEO graph 作 canonical truth | graph port / Repository Contract |
| Entity / Relation | AI-LEGO Core target / Evidence Graph minimal shape | `MINIMAL_NEW_DESIGN` | raw observed entity + optional resolved `entity_ref` | 不把 vertical entity shape 升格成 Core | entity resolution boundary + maturity flag |
| Decision | AI-LEGO Core | `ACTIVE_SCHEMA` | `RefreshContext`/priority context → Decision | 禁止 `RefreshDecision`、`ContentDecision` 第二真相 | `decision_ref` |
| Method | AI-LEGO Cognitive | Contract schema ACTIVE；SearchContent contracts 尚未建立 | 定義 domain Method semantics | 不另造 method runtime / 第二 ID 表 | canonical Method Registry + Method Contracts |
| Capability | AI-LEGO Core / Control Plane | Contract schema ACTIVE；SearchContent contracts 尚未建立 | 定義可執行 actions | 不把 reasoning method 假裝成 capability | Capability Contracts + resolver |
| Recipe | AI-LEGO Cognitive | schema ACTIVE | 組合 domain methods/capabilities | 不直接當 executable IR | validated recipe → compiler |
| Workflow IR | AI-LEGO platform | `ACTIVE_SCHEMA` | 只消費編譯結果 | 禁止 SearchContentWorkflowIR | compile/validate through existing IR |
| Gate Result | AI-LEGO Execution | `ACTIVE_SCHEMA` | method/domain-specific gate IDs | 不建立第二個 Global Gate catalog | Gate Result + ADR-011 global gates |
| Event Ledger | AI-LEGO Execution | `ACTIVE_SCHEMA` | 發出 vertical aggregate events | 不建立第二個 bus/ledger；不重複 Core lifecycle event | event ownership matrix + idempotency |
| Authority | AI-LEGO Execution | `ACTIVE_SCHEMA` | 宣告 publish/adapter operation 所需 policy/authority | 不自行推導 risk tier = authority level | A0–A4 + policy + approval |
| Repository | AI-LEGO Core | `ACTIVE_SCHEMA` | 透過 ports 使用 SQL/vector/graph/FTS/event/metrics | 不直連另一套 DB 成 canonical truth | Repository Contract |
| Live Web/Search API | AI-LEGO Capability/Tool/Provider boundary | provider-specific capability 尚待實作 | external fresh observation | 不把它畫成 Repository storage engine | provider capability → normalize → Evidence/Observation |
| Artifact | AI-LEGO Core concept | standalone canonical Artifact record 尚未成熟 | `artifact_ref`、Publication association | 不建立 SearchContent artifact core | opaque ref + Core dependency |
| Publishing | SearchContent vertical + AI-LEGO governance | adapter/policy 尚未建立 | provider adapters / publication aggregate | 不繞過 Authority/Gate/Policy | adapter contract + publish policy |
| Measurement | SearchContent vertical | vertical contract 尚未建立 | metrics definitions/snapshots/performance projection | 不與 platform observability 混成一套 | metric registry + provider adapters |
| Experiment / Outcome | AI-LEGO data-science/core target | architecture concept；machine maturity dependency | reuse | 不建 SearchExperiment | `experiment_ref` / `outcome_ref` when available |

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
**結果**：SearchObservation 必須同時保存 `raw_entity` 與 optional `entity_ref`，不得把 raw provider string 當 canonical entity。

### FINDING-IM-04 — Method / Capability catalog 必須在任何 contract 建置前收斂

**Evidence**：`EV-CRIT-H01`、`EV-CRIT-H06`、`EV-CRIT-H07`、`EV-METHOD`、`EV-CAPABILITY`。  
**判定**：`BLOCKING_CONVERGENCE`。  
**結果**：先完成文件 8；未完成前不得批次建立 SearchContent Method/Capability contracts。

### FINDING-IM-05 — Event namespace 開放，但 event semantic ownership 不是自由的

**Evidence**：`EV-EVENT`、`EV-CRIT-H05`。  
**判定**：`BLOCKING_CONVERGENCE`。`ArtifactPublished` 已存在，因此 `ContentPublished` 必須重新定義成 Publication aggregate event 或改為消費 Core event。

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
```

任何一項未通過：`BLOCKED`，不得用 local workaround 繞過。
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
