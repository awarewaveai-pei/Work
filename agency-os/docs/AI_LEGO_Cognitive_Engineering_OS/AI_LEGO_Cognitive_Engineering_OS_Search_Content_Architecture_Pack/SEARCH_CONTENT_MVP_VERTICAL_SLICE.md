# SearchContent MVP Vertical Slice

**Document ID:** `search-content.mvp-vertical-slice`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` v3  
**Critical review:** `AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture_Critical_Review.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_MVP_VERTICAL_SLICE.md`  

**目的：** 定義最小但完整的 end-to-end SearchContent slice，從外部/內部 evidence 到 Brief、Draft、Gate、staged publishing、measurement、refresh Decision，全程可驗證、可 replay、可 rollback。

**直接依賴：**
- `前 11 份 SearchContent 文件`
- `AI-LEGO Core contracts`

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
## 1. MVP Philosophy

MVP 不等於「先做能跑、之後再補治理」。本 slice 刻意縮小 provider/功能範圍，但保留完整 closed loop：

```text
Capture
→ Normalize
→ Evidence Retrieval
→ Brief
→ Draft
→ Gates
→ Staged Publish
→ Verify
→ Measure
→ RefreshContext
→ Decision
→ Replay/Rollback test
```

## 2. Scope

### Included

```text
1 market
1 locale
1 web-search provider adapter or deterministic fixture adapter
1 CMS staging adapter or fake deterministic provider
1 content type (article/landing page 擇一，由 fixture 固定)
internal Repository retrieval
external fresh snapshot path
ContentBrief
one SEO gate bundle
one GEO/AEO gate bundle
brand gate
publishing validation
search performance fixture + AI visibility fixture
RefreshContext → Core Decision
Event Ledger / audit trace
```

### Excluded

```text
multi-region active-active
all CMS providers
all search engines
production auto-publish
regulated content auto-publish
full Local/ASO expansion
advanced CRO experimentation
```

Excluded 不代表之後重寫核心 contract；只增加 adapters/methods/recipes。

## 3. Preconditions / Blocking Gates

開始 coding 前：

```text
[ ] ADR Boundary/Ownership accepted
[ ] Method registry canonicalized
[ ] Capability registry canonicalized
[ ] Event ownership matrix resolved
[ ] ContentBrief no unconditional P0/P1 tier
[ ] Live Web boundary separated
[ ] Entity raw/ref split defined
[ ] Publishing operation policy exists for staging operation
```

任何一項 false：MVP `BLOCKED`。

## 4. Slice Scenario

固定 test scenario：

```text
Business asks for one content opportunity in a known market/locale.
System captures current search snapshot,
retrieves internal evidence,
builds approved brief,
generates draft,
runs gates,
publishes to staging/fake CMS,
verifies remote content,
ingests deterministic performance snapshots,
detects refresh trigger,
creates RefreshContext,
and routes to canonical Decision.
```

## 5. Execution Steps

### Step 0 — Baseline Lock

Record：

```text
git commit baseline
AI-LEGO baseline contract versions
SearchContent document versions
fixture hashes
```

Expected：任何 run 可重建使用哪個 contract/policy/method。

### Step 1 — Create SearchSourceProfile

Input：known source refs + authority/freshness policies。  
Expected：vertical overlay created；沒有新 Source truth。

### Step 2 — Capture SearchSnapshot

Capability：`search.collect_snapshot`。  
Expected：raw artifact hash、provider/adapter version、captured_at、request fingerprint。

Emit：`SearchSnapshotCaptured`。

### Step 3 — Normalize Observations

Capability：`search.normalize_snapshot`。  
Expected：SearchObservation refs，raw entity/value 保留，optional entity_ref。

### Step 4 — Internal Evidence Retrieval

Repository channels：SQL/FTS/Vector/Graph。  
Expected：candidate set with channel scores；不建立第二 vector store。

### Step 5 — External Fresh Retrieval if policy requires

Provider Capability route。  
Expected：raw observation first；promotion to Evidence requires provenance/normalization/policy.

### Step 6 — Authority/Freshness Assessment

Expected：versioned assessment snapshots；沒有 Evidence field overwrite。

### Step 7 — EvidencePack

Expected：refs/ranks/policy versions/knowledge snapshot/execution ref frozen。

### Step 8 — Content Strategy Methods

Run canonical methods only：

```text
seo.search_intent_analysis
seo.search_surface_analysis
content.content_gap_analysis
content.topic_prioritization
```

Expected：typed MethodResults；不使用 retired `search.intent_analysis` aliases。

### Step 9 — ContentBrief

Capability/Recipe uses `content.brief_synthesis` method + `content.generate_brief` action as applicable。  
Expected：Brief validates；authority/freshness policy refs present；no `required_source_tiers: [P0,P1]`。

### Step 10 — Draft

Capability：`content.generate_draft`。  
Expected：draft Artifact ref；claim/evidence bindings preserved。

### Step 11 — Quality Gates

Run domain gates and required platform gates。  
Expected：canonical GateResult records with evidence/validator/timestamp。

### Step 12 — Staged Publishing

Capability：`publishing.create_draft` → `publishing.preview`。  
MVP 預設不直接 production publish。

Expected：remote object/version/preview URL + idempotency behavior。

### Step 13 — Verification

Capability：`publishing.verify`。  
Expected：remote version/content hash/critical metadata match；`ContentPublicationCreated` 事件，及 `ContentPublicationVerified` 事件標記為 `VERIFIED(staged)`（`SEARCH_CONTENT_DOMAIN_MODEL.md` §4 staged-only branch）——MVP 依 Step 12 只到 `PREVIEW_READY`，不觸發正式 `SCHEDULED|PUBLISHED→VERIFIED` 路徑，事件 payload 須能區分兩者，不得讓 staged 驗證看起來等同正式發布驗證。（2026-09-02 audit remediation, finding B4）

### Step 14 — Measurement

Collect deterministic fixtures or real read-only provider data。  
Expected：MeasurementRun + ContentPerformance projection。

### Step 15 — Decay / Trigger

Method：`measurement.content_decay_detection`。  
Expected：with supplied fixture, produce deterministic DecayObservation。

### Step 16 — RefreshContext → Core Decision

Expected：`decision_ref` points to canonical Decision；no RefreshDecision object。

### Step 17 — Replay Test

Replay event/projection to selected timestamps。  
Expected：same SearchContent state reconstructed from event history + canonical stores.

### Step 18 — Rollback Test

Rollback staged publication / restore previous remote draft version。  
Expected：idempotent, audited, final remote state verified。

## 6. Failure Injection Matrix

| Injection | Expected behavior |
|---|---|
| vector unavailable | degrade channel + mark partial; no silent full-confidence |
| web provider timeout | bounded retry; current-rule task BLOCK if freshness required |
| malformed provider payload | quarantine; no Evidence promotion |
| stale authority assessment | re-evaluate or BLOCK according policy |
| duplicate publish request | same idempotency result; no duplicate remote object |
| remote CMS edited concurrently | conflict; no overwrite |
| gate FAIL | no publish step |
| verify mismatch after publish | `VERIFY_FAILED`; rollback required |
| measurement missing denominator | measurement gate FAIL |
| cross-tenant ref | hard BLOCK |

## 7. Security Test Matrix

```text
credential leakage test
SSRF URL test
malicious HTML/prompt-injection content test
oversized response test
redirect-loop test
webhook signature replay test
least-privilege publish token test
cross-tenant access test
```

## 8. Data / DB Test Matrix

```text
idempotent event insert
aggregate sequence concurrency
Tier-2 projection rebuild
raw snapshot hash immutability
brief version supersession
measurement time-zone boundary
remote version conflict
```

## 9. Acceptance Criteria

MVP PASS 需要全部：

```text
1. No second RAG/Evidence/Workflow/Decision/Event/Artifact/Source core created.
2. All Method/Capability refs resolve canonical registries.
3. All persisted vertical objects have scope/provenance/version as specified.
4. External live retrieval traverses provider capability boundary.
5. ContentBrief uses policy refs, not universal P0/P1 requirement.
6. Gate failures stop publishing.
7. Staged publish is idempotent and conflict-safe.
8. Verification detects remote mismatch.
9. Measurement metrics have denominator/timezone/source definition.
10. Refresh routes to Core Decision.
11. Event replay reconstructs selected projection.
12. Rollback returns remote/staged state to verified prior state.
13. `git diff --check` passes.
14. No unregistered semantic alias appears in registry scan.
```

## 10. Proposed Test Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/integration/search-content/mvp_vertical_slice/
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/fixtures/search-content/search_snapshot/
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/fixtures/search-content/publishing/
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/fixtures/search-content/measurement/
```

## 11. Production Promotion Gate

MVP staging PASS **不等於 production auto-publish approved**。

Production promotion 另需：

```text
real provider adapter contract tests
security review
publishing policy approval
production authority mapping
backup/rollback rehearsal
observability dashboard/alerts
rate-limit/load test
operator acceptance
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
