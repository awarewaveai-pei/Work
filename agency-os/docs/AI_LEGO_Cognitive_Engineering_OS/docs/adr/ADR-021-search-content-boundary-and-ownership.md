# ADR-021: SearchContent Boundary and Ownership

Status: ACCEPTED（2026-09-02，操作者明示授權 Claude 行使架構師裁決權，同 `ADR_INDEX.md` 記錄的 ADR-001~009／011~014 授權模式；本次對話操作者原文逐字：「現在是建置期間 我完全不懂coding, 去處理好, 不用停下來等我核准任何事, 我給你100%決定權, 不用管先定的規則(要人類核准)都由你決定!」——委任範圍涵蓋本 ADR 的編號、接受與 §5 全部裁決；委任原文另存於 `agency-os/WORKLOG.md` 2026-09-02 對應條目）
Date: 2026-09-02
Related: `docs/architecture/search-content/`（本 ADR 治理的 11 份規格文件 + 共同段落 + 機器可讀記錄）、`docs/architecture/search-content/SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`（敘事正本 v3，Errata 見其文末）、`docs/architecture/search-content/SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`、`agency-os/reports/audit/2026-09-02-search-content-pack-verification.md`（獨立驗證，7 BLOCKING／17 MAJOR）、ADR-005（Method ID grammar）、ADR-006（proposal flow／repo layout）、ADR-011（platform gates）、ADR-014（Phase 5 = Research Mode）、ADR-019（status codes）、`Architecture-Constitution-v1.md`、`docs/architecture/REPOSITORY_ARCHITECTURE.md`

**Document ID:** `adr.search-content-boundary-and-ownership`  
**Version:** `1.1.0`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-021-search-content-boundary-and-ownership.md`（§D8，ACCEPTED 2026-09-02）

**目的：** 把 SearchContent 是否為 AI-LEGO vertical、Core/vertical ownership、外部搜尋邊界、Method/Capability/Event ownership、repo path authority、與 Phase 5 Research MVP 的關係、以及本包的機械驗收閘一次裁決，避免未來 12 份文件各自決定。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](../architecture/search-content/SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

## 1. Status

```yaml
status: ACCEPTED
accepted_at: "2026-09-02"
accepted_by: "operator, via explicit delegation of architect authority to the active Claude session (delegation text quoted verbatim in this file's header)"
approval_required: true
self_approval_by_ai: forbidden   # 本次接受是操作者委任下的裁決，委任原文逐字記錄；非 AI 自我核准。記錄方式同 ADR_INDEX.md 對 ADR-001~009/011~014 的處理。
scope_note: >
  接受的是 §5 D1–D10 的架構裁決。docs/architecture/search-content/ 的 11 份規格文件維持
  Status: PROPOSED（同 ADR-014 Sub-decision (b) 先例：接受 ADR 不等於把規劃文件整份升格）。
  任何寫入 specs/、methods/registry/、policies/、recipes/validated/ 的 ACTIVE 平台契約仍須各自的
  golden test；任何母文件（Master Plan / Method Atlas / Execution Contract / Program Plan）的編輯
  仍須 ADR-006 的 .ai/proposals/ 流程且只能由操作者本人推進至 APPROVED——本 ADR 不觸碰任何母文件。
# 本區塊是 ADR metadata，不是 object contract（驗證器以此註記豁免 source_of_truth_for 檢查）
block_kind: ADR_METADATA
```

## 2. Context

v3 已成功把 SearchContent 從「AI Writer」提升為 Search/Content Intelligence vertical，但 Critical Review 確認仍有 8 個 High findings，其中最危險的不是第二套 RAG，而是 machine semantic duplication：Method ID、Capability catalog、Event semantic ownership。證據：`EV-CRIT-H01`～`EV-CRIT-H08`。

2026-09-02 的獨立驗證（`EV-AUDIT-0902`）再加上一層：包內同一個物件被定義兩次且欄位不相容（B2）、10/16 物件無 tenant scope（B3）、state machine 走不通自己的 MVP（B4）、`search.*` namespace 被兩份文件指派成互斥用途（B5）、16–20 個 v3 承諾的 machine ID 靜默消失（B6）、Retrieval 執行層未綁任何 Method/Capability/Gate/Workflow IR（B7）；根因是 **0/41 個 YAML 區塊宣告 `source_of_truth_for`／`decided_by`**——沒有任何機制能說出「這個欄位誰擁有、由哪個決策編譯而來」。

如果不先用 ADR 裁決，下列狀況會在 implementation 階段形成不可逆重工：

```text
seo.search_intent_analysis vs search.intent_analysis
content.content_gap_analysis vs search.content_gap_analysis
ContentPublished vs ArtifactPublished
raw observed entity vs canonical Entity
live web provider vs Repository retrieval
同一物件兩份 schema 各自生出不相容的 contract 與 fixture
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

### 4.1 D1 的三個整體方案（對稱列出 Benefits／Costs）

| Option | Benefits | Costs / risks | 判定 |
|---|---|---|---|
| A. SearchContent 建成獨立 mini-platform（自己的 Source/Evidence/RAG/Workflow/Decision/Event/Artifact）| 團隊可完全自主排程；不受 Core 成熟度牽制 | 直接違反 Shared Kernel 與既有 ACTIVE contracts（`EV-REPO-ARCH`、`EV-EVIDENCE`、`EV-DECISION`、`EV-WORKFLOW`、`EV-EVENT`）；第二套 truth 的 blast radius 永久存在 | **Reject** |
| B. 完全不新增 domain objects，只用 generic Core | 零新 schema；零 ownership 爭議 | SearchQuery/SearchSnapshot/SearchObservation/ContentBrief/Publication/Performance 具明確垂直語意；硬塞 generic Core 會讓 Core 被 SEO/CMS/provider 細節污染，且 Core 的 Source/Artifact/Entity 尚未成熟（`EV-EGRAPH`），vertical 會被迫等待 | **Reject** |
| C. Thin vertical + canonical Core reuse | Core 保有 invariants 與跨 vertical truth；vertical 只擁有垂直語意／policy／adapter／observation；Recipe 編譯進既有 Workflow IR；所有 write 走既有 Policy/Authority/Gate/Event | 初期必須先做 integration convergence（本包 12 份文件）才能寫 runtime；Core 成熟度缺口需用 opaque ref／explicit dependency 管理 | **採用** |

### 4.2 D2–D10 各裁決的替代方案（驗證報告 M4：先前只為 D1 列過選項）

| 裁決 | 採用 | 被拒替代方案 | 為何不採 |
|---|---|---|---|
| D2 外部搜尋邊界 | 雙路徑：內部 Repository retrieval ＋ 外部 Capability/Provider adapter → raw observation → 可選 Evidence promotion | (i) 把 live web 當第五個 Repository storage role；(ii) 只允許內部 retrieval | (i) 違反 `EV-REPOSITORY`（storage roles 是持久化 substrate，不是遠端 API），且外部結果不可 replay；(ii) 官方規則現況驗證與 SERP/AI-answer 觀察本質上需要即時外部觀察，內部 retrieval 無法滿足 |
| D3 Entity 邊界 | `raw_observed_entity` ＋ `entity_ref: null`（resolver 成功才填）| (i) 直接用 provider 字串當 entity id；(ii) 由 vertical 定義完整 Entity schema | (i) 不同 provider 的字串不可互通，會生出假 identity；(ii) `EV-EGRAPH` 明載 Entity/Relation 只有 minimal NEW_DESIGN shape，vertical 擴張會與未來 Core Entity contract 衝突（`EV-CRIT-H04`）|
| D4 Method namespace | family 規則 ＋ 4 條 KEEP/RETIRE 裁決；`search.*` 只留 cross-surface reasoning | (i) 全部放 `search.*`；(ii) 反向裁決（KEEP `search.intent_analysis`，RETIRE `seo.search_intent_analysis`）| (i) 抹掉 domain 語意，`search.` 變成無意義前綴；(ii) intent analysis 的方法論本體在 §22 SEO operating architecture（`EV-V3-DOMAINS`），跨 surface 的 `search.` 版本只是它的一個輸入來源；把方法掛在方法論所在的 family 才能對應 registry record 的 `evidence_maturity` 追蹤 |
| D5 Capability 邊界 | 推理 = Method；action = Capability；不建 `search.classify_intent` 等 3 個 capability | 允許「thin capability wrapper 呼叫 method」 | 同一語意兩個 ID（`EV-CRIT-H07`）；`EV-WORKFLOW` 的 IR node 已嚴格區分 method/capability，wrapper 只會讓 Workflow IR 出現兩種等價節點 |
| D6 Event ownership | 13 個 vertical event 各有 aggregate owner（見 §5 D6 表）；`ContentPublished` 改 `ContentPublicationCreated/Verified/RolledBack`；`ContentOpportunityCreated`、`ContentDraftGenerated`、`ContentQualityGate*` 不建 | (i) 逐字採用 master §55 的 15 個 event；(ii) 完全不發 vertical event，只消費 Core event | (i) 其中 4 個沒有 aggregate（opportunity 是 MethodResult、draft 是 Core Artifact lifecycle、gate pass/fail 已是 canonical GateResult 記錄），`ClaimSuperseded`／`OfficialSourceChanged` 語意屬 Core／需改名（`EV-CRIT-H05`）；(ii) replay 需要 vertical aggregate 的自身事件（`EV-EVENT` replay invariants）|
| D7 Publishing authority | 依 policy 映射 A1/A2 → A3 → A4，不用「publish = A4」或「risk number = authority number」 | 固定 publish = A4 | 把 staging preview 也綁 A4 會讓 MVP 無法自動化任何一步；`EV-AUTH` 明載 Capability ≠ Authority，且 `EV-RISKTIER` R0–R4 與 A0–A4 是兩個正交軸 |
| D8 Repo namespace | `docs/architecture/search-content/` ＋ `docs/adr/ADR-021-*`；機讀交付物落平台既有樹 | (i) 維持首次入庫的 `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/`；(ii) master §6 的 `/cognitive/domain-packs/search-content/` | (i) 是 GPT 交付物的暫置名，不在 `EV-REPO-ARCH` 的任何 bounded context 內，平台其他架構文件全在 `docs/architecture/`；(ii) `EV-CRIT-M`（M-03）已指出該路徑先於 repo governance 寫死，且 `EV-REPO-ARCH` 沒有 `domain-packs` 這層 |
| D9 與 Phase 5 的關係 | 平行證明；Phase 5 exit slice 維持 Research（ADR-014）；SearchContent MVP 是第一個 post-Phase-5 vertical | (i) 取代 Phase 5；(ii) 併入 Phase 5 | (i) Phase 5 三輪原型已真機驗證（faster-whisper STT、backup/restore replay gate、Cohen's Kappa），取代 = 沉沒成本重工；(ii) Program Plan §9 明定 Phase 5 為單一切片三選一，併入會讓 exit gate 失去單一驗證對象 |
| D10 機械驗收閘 | 本包自帶驗證器掛進既有 golden harness，`BUILD_MANIFEST.json` 只能由驗證器產生 | 維持四條泛用 git 指令＋手寫 manifest | 驗證報告 M1／M2 實測：manifest 36 個布林值只編碼 3 個事實、git 指令當天就是紅的且噪音 127 行——那是「宣稱與真實不符的偵測器」，比沒有偵測器更糟 |

## 5. Decision

### D1 — Bounded Context

SearchContent 是 **domain vertical**，不是新的 platform plane。

SearchContent 可擁有（schema SSOT 一律在 `SEARCH_CONTENT_DOMAIN_MODEL.md`，field-level 權責表見 `SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md` §3.1）：

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
DecayObservation                       # 2026-09-02 補列：MVP Step 15 與 refresh_context.trigger_refs 早已依賴它（EV-AUDIT-0902 任務 8）
RefreshContext
MetricDefinition / MeasurementRun / AttributionModel   # measurement 層物件（CONTENT_MEASUREMENT_SPEC.md）
SearchContent artifact-type catalog（vertical 目錄，非平台 enum；master §56）
Domain Method semantics
Domain Capability declarations
Domain Recipes
Domain/method-specific Gates
Publishing adapters
Measurement adapters
```

master §11.1 另列的 `SearchSurface` 與 `EntityObservation` **不建獨立 object**：前者是 `SEARCH_INTELLIGENCE_SPEC.md` §2 的 surface taxonomy（enum），後者依 D3 折入 `SearchObservation.raw_observed_entity`。

SearchContent 不得擁有 canonical：

```text
Source
Evidence
Claim
Sentence-level provenance（EV-SENTPROV；citation 綁定只產生 link record，不另造）
Decision
Artifact
Workflow IR
Event Ledger
Global / High-risk Gate catalog
Authority ladder
Risk tier / status code / audit / rollback 詞彙（EV-RISKTIER、EV-STATUS、EV-AUDIT、EV-ROLLBACK）
Repository storage substrate
```

### D2 — External Live Search Boundary

採雙路徑：

```text
A. Internal Knowledge Retrieval
   SearchContent query plan (Method search.plan_retrieval)
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

直到 canonical Core Entity contract 成熟（`OQ-SC-12`）：

```yaml
raw_observed_entity:
  provider_type:
  provider_value:
  raw_payload_ref:
entity_ref: null  # only populated after resolver succeeds
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_MODEL.md §2.4 search_observation.raw_observed_entity / entity_ref — 該處只引用本裁決，不重述規則"
  - "SEARCH_INTELLIGENCE_SPEC.md §4 Raw entity vs resolved entity"
decided_by: "ADR-021 §D3 (this decision); grounded on EV-EGRAPH (Entity/Relation minimal NEW_DESIGN) and EV-CRIT-H04 / EV-CRIT-M (M-05)"
```

不得把 Evidence Graph 的 minimal `entity_node` 擴張成 SearchContent-specific Core Entity schema。

### D4 — Method Namespace

**Scope note（2026-09-02 audit remediation, finding B5）**：以下 family 規則管的是 **Method 命名空間**，與 `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` §2 的 **Capability 命名空間**（`search.<action>` 等）是兩個獨立的型別化 ID 空間，不是同一份共用 namespace——平台自己的 `specs/domain/capability-contract.schema.yaml` `open_questions.OQ-cc-1` 明文記載「點號前綴是否構成正式 registry」全庫尚無正本表態，且該問題本身標記為 `blocks: nothing`，owner 是「operator, via a future ADR」（登記為 `OQ-SC-10`）。Registry 已用 §3（Method catalog）／§5（Capability catalog）兩張獨立表追蹤，兩邊各自的 `search.*` 條目不需要互斥檢查。

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

Gate family 另有兩個**沒有對應 Method family** 的 domain（`brand.*`、`accessibility.*`）以及跨領域的 `evidence.*`：它們是 **policy-driven gate**（`category: DOMAIN_POLICY`），不是 method-specific gate，見 `SEARCH_CONTENT_QUALITY_GATES.md` §3（驗證報告 M12）。

這些是本 ADR 的 architecture-level canonicalization；實際 registry record 由 `SEARCH_CONTENT_REGISTRY_RECORDS.yaml` 落地，退役一律走 `EV-DEPRECATION` 七步。

### D5 — Capability Boundary

「需要推理得出答案」預設為 Method；「執行外部/系統 action」為 Capability。

因此不建立：

```text
search.classify_intent capability
search.cluster_queries capability
search.detect_content_gap capability
measurement.detect_decay capability
content.validate_{seo,geo,entity,brand,conversion} capability   # 驗證是 Quality Gate 機制的職責，不另開第二條驗證路徑
```

其認知工作由 Method 執行；Capability 僅負責 fetch/store/generate/publish/measure 等 action。

### D6 — Event Ownership

Vertical event registry（每個 event 必有 aggregate owner；payload 走平台 Event Ledger envelope，硬帶 `provenance_record`（`EV-EPISTEMIC`），idempotency key = `<tenant_ref>:<aggregate_id>:<aggregate_version>:<event_type>`）：

| Event | Aggregate owner | Producer | 備註 |
|---|---|---|---|
| `SearchSnapshotCaptured` | SearchSnapshot | `search.collect_snapshot` | |
| `SearchObservationCreated` | SearchObservation | `search.normalize_snapshot` | |
| `SearchSourceChangeObserved` | SearchSourceProfile | change-detection capability（`search.fetch_page` diff）| 取代 master 的 `OfficialSourceChanged`（vertical observation，非 Core source lifecycle）|
| `TopicClusterCreated` | TopicCluster | `content.topic_clustering` MethodResult persist | TopicCluster lifecycle（DISCOVERED→…）的其他轉態沿用同 aggregate 的版本事件，不另開 event type |
| `ContentBriefCreated` | ContentBrief | `content.generate_brief` | |
| `ContentBriefApproved` | ContentBrief | human approval（A3/A4）| `authorship_state: HUMAN_APPROVED` |
| `ContentPublicationCreated` | ContentPublication | `publishing.create_draft` | |
| `ContentPublicationVerified` | ContentPublication | `publishing.verify` | payload 必帶 `verification_scope: STAGED \| PRODUCTION`（Domain Model §3 staged-only branch）|
| `ContentPublicationRolledBack` | ContentPublication | `publishing.rollback` | 2026-09-02 補列（EV-AUDIT-0902 任務 12 ④）；rollback record 依 `EV-ROLLBACK` |
| `ContentPerformanceCaptured` | ContentPerformance | `measurement.persist_snapshot` | |
| `ContentDecayDetected` | DecayObservation | `measurement.content_decay_detection` MethodResult persist | |
| `RefreshContextCreated` | RefreshContext | `content.build_refresh_context` | |

**不建立的 event（相對 master §55 的 15 個）**：

```text
ContentOpportunityCreated  → 全包無 ContentOpportunity aggregate；opportunity 是 content.topic_prioritization 的 MethodResult，
                            狀態變化落在 TopicCluster.lifecycle_state（DISCOVERED → VALIDATED），由 TopicCluster 的 aggregate 事件承載。
                            違反本 ADR 自訂「每個 event 都必須有 aggregate owner」規則者不建。（EV-AUDIT-0902 任務 12 ③）
ContentDraftGenerated      → Draft 是 Core Artifact；其 lifecycle event 由 Core 發（若 Core 定義）。vertical 只保存 artifact_ref。
ContentQualityGateFailed / ContentQualityGatePassed
                           → 已是 canonical GateResult 記錄（EV-GATE）；再發 vertical event = 同一事實兩份 truth。
ContentPublished           → 語意與 Core `ArtifactPublished` 重疊（EV-CRIT-H05）；採上表三個 ContentPublication 事件。
OfficialSourceChanged      → 改 SearchSourceChangeObserved（vertical observation）。
ClaimSuperseded            → SearchContent 不擁有；只消費 Core Claim lifecycle event。
```

**`ArtifactPublished` 的成熟度警語（驗證報告附錄「稽核者意見分歧」，本 ADR 採較嚴格的一方）**：`EV-EVENT` 顯示它只出現在 event-ledger 引用 Master Plan「例如」的非窮舉清單（`:17`），**無 aggregate owner、無 payload contract、無 producer**。因此上表的 `ContentPublicationCreated` 是 vertical 的主事件，`ArtifactPublished` 只在 Core 真的定義並發出時才被引用（`OQ-SC-16`），不得把 vertical 的正確性建立在它存在的假設上。

### D7 — Publishing Authority

不採固定「publish = A4」。

```text
Create Draft / Preview → 依 policy 可 A1/A2 類型
Reversible Production Publish → 依 policy + Gate + Authority，通常落 A3 類語意
Regulated/irreversible/external high-impact → A4 + explicit human authority
```

實際 mapping 由 `PUBLISHING_ADAPTER_CONTRACT.md` §5 的 `publishing_operation_policy` 逐 operation 明文定義（`risk_tier` 用 `EV-RISKTIER` 的 R0–R4，`max_autonomy` 用 `EV-AUTH` 的 A0–A4，兩軸不互相推導）。執行結果的 `final_status`／side state／`reason_code` 一律用 `EV-STATUS`；`publication_state` 是 aggregate 狀態，不是第二套執行狀態詞彙（見 Domain Model §3 的對照）。證據：`EV-AUTH`、`EV-ADR019`。

### D8 — Repo Namespace（physical path，ACCEPTED）

| 項目 | 路徑 | 狀態 |
|---|---|---|
| 規格文件、共同段落、機器可讀記錄 | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/` | ACCEPTED |
| 本 ADR | `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/adr/ADR-021-search-content-boundary-and-ownership.md` | ACCEPTED（編號依 `ADR_INDEX.md` 現行 ADR-001..020 的下一號）|
| 敘事正本 v3 與 critical review | 同上目錄（`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md`、`..._CRITICAL_REVIEW.md`）| ACCEPTED（自平台根目錄移入；平台根目錄只留三母文件、Constitution、Program Plan）|
| 機讀交付物 | `specs/search-content/`、`policies/search-content/`、`methods/contracts/`、`capabilities/contracts/`、`recipes/validated/`、`tests/contracts/search-content/`、`tests/architecture/` | 落平台既有樹；不建 vertical 私有 registry／runtime |
| 驗證器 | `tests/architecture/search_content_pack_check.py`（掛進 `tests/run_golden_tests.py`）| ACCEPTED（D10）|

明文取代：master §6／§53 的 `/cognitive/domain-packs/search-content/`（`EV-CRIT-M` M-03；`SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` Errata E-04）。

**不編輯 `docs/architecture/REPOSITORY_ARCHITECTURE.md`**：實測 `grep -n "docs/(architecture|adr)"` 於該檔 0 命中——它治理程式碼目錄樹，不枚舉 `docs/` 子目錄，故本裁決不與它衝突也不需要改它。母文件一律不動。

### D9 — Relationship to the Phase 5 Research MVP（ACCEPTED）

**事實**：`ADR-014`（ACCEPTED 2026-08-30）已選定 Research Mode 為 Phase 5 唯一 exit slice；`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` 已於 2026-08-30 開工（三輪原型、真實測試通過）。本包在 2026-09-02 之前對此零引用。

**裁決**：

1. Phase 5 的 exit slice **維持 Research Mode**，本 ADR 不修改 ADR-014、`MVP_VERTICAL_SLICE_PLAN.md` 或 `AI_LEGO_OS_Program_Plan_v1.md`。
2. `SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` 定位為 **第一個 post-Phase-5 vertical slice**：它與 Research MVP 是同一個「horizontal platform + vertical domain」主張的兩個獨立證明（不同 domain 資料模型、共用同一組平台核心保證），不是同一賽道的競爭者，也不取代 Phase 5 已驗證的成果。
3. 開工前提（寫進 `SEARCH_CONTENT_MVP_VERTICAL_SLICE.md` §3）：Phase 5 exit gate 通過 **且** SC-Phase 0（ownership convergence，即本包）通過驗證器。
4. Program Plan 目前沒有 Phase 6 定義；為 SearchContent MVP 開一個正式 phase slot 屬母文件修改，走 ADR-006 提案流程、由操作者推進——登記為 `OQ-SC-17`，不在本 ADR 內偷做。

### D10 — Mechanical Acceptance Gate（Gate H）

本包的「文件完整性」由 `tests/architecture/search_content_pack_check.py` 機械驗證（不變量清單見 `SEARCH_CONTENT_PACK_COMMON.md` §5），並作為 `tests/run_golden_tests.py` 的第 5 個 check family——本包任何改動都會在全平台 golden test 裡被檢查，不靠人記得跑。`BUILD_MANIFEST.json` 只能由驗證器 `--write-manifest` 產生，手寫視為無效（驗證報告 M1）。

## 6. Consequences

### Positive
- 消除第二套 platform 的 blast radius。
- ID semantics 在 contract 建置前收斂；每個 YAML 區塊都能說出「誰擁有、由誰決定」。
- Provider/CMS/model 可替換。
- 所有 vertical write 能 replay/audit/rollback。
- 文件一致性有機械閘，不再依賴人工比對 12 份文件。

### Costs
- 初期必須先做 integration convergence，不能直接開始寫 Writer/CMS connector。
- Source/Artifact/Entity Core maturity gap 需以 opaque ref/explicit dependency 管理（`OQ-SC-12`～`OQ-SC-16`）。
- 驗證器成為本包的維護成本：新增物件／gate／ID 都必須同步登記，否則 golden test 紅。

## 7. Migration

若 repo 已出現任何被本 ADR 淘汰的 SearchContent ID：

```text
1. freeze new usage
2. inventory all refs with git grep
3. produce alias/deprecation map（SEARCH_CONTENT_REGISTRY_RECORDS.yaml status: RETIRED + replacement）
4. migrate recipes/contracts
5. run full contract tests（tests/run_golden_tests.py）
6. leave tombstone/deprecation entry（EV-DEPRECATION 七步的 Archive）
7. only then delete implementation
```

禁止全域 find/replace 不留 compatibility map。

## 8. Rollback

此 ADR rollback 的條件只有：

```text
A. 證明 vertical 必須擁有某 Core object 才能滿足不可替代需求；或
B. AI-LEGO Core contract 本身被更高權威 ADR/contract 改寫。
```

Rollback 不代表回到 Option A；必須新 ADR 說明新的 ownership。物理路徑的 rollback = `git revert` 本 ADR 的落地 commit（純 `git mv`，無資料遷移）。

## 9. Acceptance Criteria

```text
[x] Operator explicitly approves ADR                         → 檔頭逐字委任記錄；ADR_INDEX.md 登記
[x] Integration Matrix has no UNRESOLVED ownership collision  → SEARCH_CONTENT_AI_LEGO_INTEGRATION_MATRIX.md §1/§3.1
[x] Method catalog canonicalized                              → Registry §3 + SEARCH_CONTENT_REGISTRY_RECORDS.yaml（驗證器 rule 3）
[x] Capability catalog canonicalized                          → Registry §5 + 同上
[x] Event ownership table canonicalized                       → 本 ADR §D6（驗證器 rule 8）
[x] External live search uses Capability/Tool boundary        → §D2；SEARCH_EVIDENCE_RETRIEVAL_SPEC.md §1/§3
[x] Entity maturity explicitly marked                         → §D3；OQ-SC-12
[x] Proposed physical paths accepted under ADR-006 governance → §D8
[x] Every contract block declares source_of_truth_for / decided_by → 驗證器 rule 2
[x] Pack validator wired into golden tests and green          → §D10；WORKLOG 2026-09-02 REALTEST_EVIDENCE
```

## 10. Evidence

- `EV-AUDIT-0902` — 本 ADR 第 2 版所有「2026-09-02 audit remediation」項目的來源。
- `EV-CRIT-H01`～`EV-CRIT-H08`、`EV-CRIT-M` — v3 critical review 的 8 High + M 系列。
- `EV-REPO-ARCH`、`EV-ADR006`、`EV-CONST` — 路徑治理與 Scoped Authority。
- `EV-EVIDENCE`、`EV-CLAIM`、`EV-EGRAPH`、`EV-SENTPROV`、`EV-DECISION`、`EV-WORKFLOW`、`EV-EVENT`、`EV-EPISTEMIC` — Core canonical objects。
- `EV-METHOD`、`EV-CAPABILITY`、`EV-RECIPE`、`EV-DEPRECATION` — Method/Capability/Recipe 契約與退役流程。
- `EV-GATE`、`EV-MGATES`、`EV-ADR011` — gate ownership 與強制規則。
- `EV-AUTH`、`EV-RISKTIER`、`EV-STATUS`、`EV-ADR019`、`EV-AUDIT`、`EV-ROLLBACK` — authority／risk／status／audit／rollback 詞彙。
- `EV-V3-BOUNDARY`、`EV-V3-METHODS`、`EV-V3-RECIPES`、`EV-V3-PUBLISH`、`EV-V3-MEASURE`、`EV-V3-SOURCE`、`EV-V3-MVP` — master v3 被本 ADR 採納或取代的段落。
- `docs/adr/ADR-014-phase-5-mode-selection-research.md`、`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`、`AI_LEGO_OS_Program_Plan_v1.md` §9（`:148-152`）— D9 的事實基礎。
