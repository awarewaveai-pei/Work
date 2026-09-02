# SearchContent MVP Vertical Slice

**Document ID:** `search-content.mvp-vertical-slice`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/SEARCH_CONTENT_MVP_VERTICAL_SLICE.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義最小但完整的 end-to-end SearchContent slice，從外部/內部 evidence 到 Brief、Draft、Gate、staged publishing、measurement、refresh Decision，全程可驗證、可 replay、可 rollback。

**直接依賴：**
- `前 11 份 SearchContent 文件`
- `AI-LEGO Core contracts`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

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
bundle.evidence_core + bundle.seo_core          # SEARCH_CONTENT_QUALITY_GATES.md §10.5
bundle.geo_aeo_core
bundle.brand
bundle.publishing_staged（+ bundle.retrieval）
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
[x] ADR Boundary/Ownership accepted                          → ADR-021（2026-09-02）
[x] Method registry canonicalized（design）                  → Registry §3 + SEARCH_CONTENT_REGISTRY_RECORDS.yaml
[x] Capability registry canonicalized（design）              → Registry §5 + 同上
[x] Event ownership matrix resolved                          → ADR-021 §D6
[x] ContentBrief no unconditional P0/P1 tier                 → Brief §2；master Errata E-02
[x] Live Web boundary separated                              → ADR-021 §D2
[x] Entity raw/ref split defined                             → ADR-021 §D3
[x] Publishing operation policy exists for staging operation → Publishing §5 MVP 預設表
[x] Pack validator green（Gate H）                           → tests/architecture/search_content_pack_check.py
[ ] Phase 5 Research MVP exit gate passed                    → ADR-021 §D9；DEFERRED OQ-SC-17（本 slice 是 post-Phase-5 vertical）
[ ] Registry records promoted into methods/registry/*        → DEFERRED OQ-SC-19（per-id，與 contract 同批）
[ ] 3 recipes authored + validated + compiled to Workflow IR → DEFERRED OQ-SC-18
[ ] Method/Capability contracts for every id used in §5      → SC-Phase 1（Registry §8 contract paths）
```

前 9 項 2026-09-02 已達成；後 4 項是 coding 開工的硬前提，任何一項 false：MVP `BLOCKED`。

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
Expected：with supplied fixture, produce deterministic DecayObservation（schema `SEARCH_CONTENT_DOMAIN_MODEL.md` §2.16；emit `ContentDecayDetected`）。

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
13. `git diff --check -- docs/architecture/search-content` passes.
14. No unregistered semantic alias appears in registry scan (validator rule 3).
15. Every SearchContent Recipe validates against recipe.schema.yaml and compiles to Workflow IR (master §65 #8, L5654 — restored 2026-09-02, EV-AUDIT-0902 B7).
16. tests/run_golden_tests.py passes including check family 5 (pack validator, Gate H).
```

## 10. Proposed Test Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/architecture/search_content_pack_check.py          # 存在（Gate H）
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/**/*.fixtures.yaml         # Stage 1；走 EV-TESTS fixture 契約（schema_id / target_ref / valid / invalid）
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/mvp_vertical_slice/        # Stage 1 end-to-end fixture set（原提的 tests/integration/、tests/fixtures/ 不存在，改用既有 tests/contracts 樹；EV-AUDIT-0902 M2）
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

## 12. SC-Phase 對照（master §64，2026-09-02 補回）

master §64（`L5422-L5606`）定義 SC-Phase 0–8 的交付計畫，本包先前零引用（`EV-AUDIT-0902` M14）。對照：

| SC-Phase | 內容 | 本包對應 | 狀態（2026-09-02）|
|---|---|---|---|
| 0 AI-LEGO Integration & Ownership Convergence | ownership／ID／path／event 收斂 | 本包全部 12 份文件 + ADR-021 + 驗證器 | **DONE**（Gate H green）|
| 1 Domain Foundation | schemas、Method/Capability contracts、registry promotion | Registry §8 contract paths；`OQ-SC-19` | NOT_STARTED |
| 2 Search Intelligence | capture/normalize/observation | Steps 1–3；Intelligence spec | NOT_STARTED |
| 3 Content Strategy & Decision | retrieval、clustering、prioritization、Core Decision | Steps 4–8 | NOT_STARTED |
| 4 Brief & Production | brief、outline、draft、citation binding | Steps 9–10 | NOT_STARTED |
| 5 Quality | gate validators + fixtures | Step 11；`OQ-SC-6` | NOT_STARTED |
| 6 Publishing | adapter、staged publish、verify、rollback | Steps 12–13、18 | NOT_STARTED |
| 7 Measurement | runs、projection、attribution | Step 14 | NOT_STARTED |
| 8 Learning Loop | decay、refresh context、Decision、replay | Steps 15–17 | NOT_STARTED |

SC-Phase 1 開工前提 = §3 後 4 項。
