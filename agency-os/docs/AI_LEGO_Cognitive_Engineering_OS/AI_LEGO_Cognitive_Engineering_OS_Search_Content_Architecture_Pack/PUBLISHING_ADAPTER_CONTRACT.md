# Publishing Adapter Contract

**Document ID:** `search-content.publishing-adapter`  
**Status:** `PROPOSED`  
**Version:** `1.0.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md` v3  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`  
**Proposed repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/PUBLISHING_ADAPTER_CONTRACT.md`  

**目的：** 定義 provider-neutral Publishing Port、CMS/store adapter contract、state machine、idempotency、auth/least privilege、diff/approval、verification、rollback、partial failure。

**直接依賴：**
- `CONTENT_BRIEF_CONTRACT.md`
- `SEARCH_CONTENT_QUALITY_GATES.md`
- `Authority/Gate/Event Ledger contracts`

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
## 1. Architecture Boundary

```text
Approved Artifact / ContentBrief
→ Publishing Port
→ Provider Adapter
→ Remote Draft/Publication
→ Verification
→ ContentPublication aggregate
→ Measurement
```

Adapter 只負責 provider protocol，不負責 SEO strategy / content truth / approval policy。

## 2. Operation Contract

每個 adapter 宣告：

```yaml
publishing_adapter:
  provider:
  adapter_id:
  version:
  supported_operations: []
  auth_mode:
  idempotency:
  retry_policy:
  rate_limit_behavior:
  remote_conflict_behavior:
  rollback_support:
  webhook_support:
  max_payload_constraints:
  capability_contract_refs: []
```

## 3. Operations

### create_draft

Input：

```yaml
artifact_ref:
brief_ref:
target_ref:
title:
slug:
body_ref:
metadata:
media_refs: []
idempotency_key:
```

Output：

```yaml
publication_ref:
provider_object_id:
remote_version:
preview_url:
content_hash:
```

### update_draft

必須帶 `expected_remote_version`；版本不同時 `CONFLICT`，禁止 last-write-wins 靜默覆蓋人工修改。

### preview

read-only / staged，回傳 provider-rendered preview ref。

### diff

比較：

```text
current remote
approved artifact
proposed remote
metadata
schema
links
media
```

### schedule / publish / unpublish / rollback / verify

每個 operation 都要有獨立 capability ID 與 policy/authority mapping。

## 4. State Machine

```text
CONTENT_READY
→ DRAFT_CREATED
→ PREVIEW_READY
→ VALIDATED
→ APPROVED_IF_REQUIRED
→ SCHEDULED|PUBLISHED
→ VERIFIED
```

Failure：

```text
VALIDATION_FAILED
REMOTE_CONFLICT
AUTH_FAILED
RATE_LIMITED
PUBLISH_FAILED
PARTIALLY_PUBLISHED
ROLLBACK_REQUIRED
ROLLED_BACK
VERIFY_FAILED
```

## 5. Authority / Approval

Confirmed correction：Human approval 不是所有 operation 的無條件共同步驟。證據：`EV-AUTH`、`EV-CRIT-M`（M-08）。

Policy mapping record：

```yaml
publishing_operation_policy:
  operation:
  risk_tier:
  max_autonomy:
  required_domain_gates: []
  required_global_gates: []
  human_approval_required:
  rollback_required:
  external_impact_class:
```

不得用 `risk tier number == authority number` 自行推導。

## 6. Idempotency

所有 write operation：

```text
idempotency_key = tenant + target + operation + approved_artifact_hash + intended_version
```

同 key 重送：

```text
return previous result OR safe equivalent
```

不得建立重複文章/重複排程。

## 7. Remote Concurrency

採 optimistic concurrency：

```text
fetch remote version
compare expected version
if changed → BLOCK/CONFLICT
human/system decides merge
```

禁止自動覆蓋未知 remote edits。

## 8. Security

- credentials 不進 Artifact/Brief/Event payload。
- provider secret 使用 least-privilege account/token。
- draft capability 不應持有 delete-production scope。
- publish/rollback/unpublish scopes 分離，provider 支援時使用不同 credentials/permissions。
- webhook 驗證 signature/replay timestamp。
- outbound URLs / media fetch 需 SSRF policy。

## 9. Publish Validation

Hard checks：

```text
required fields
canonical/robots
hreflang when applicable
structured data syntax + visible-content consistency
internal links
media refs
alt requirements
slug/url
redirect implications
approval hash binding
```

## 10. Verification

Publish 之後不能只相信 API 200：

```text
fetch/read remote object
verify expected provider object id/version
verify content hash or approved semantic equivalence
verify published state
verify critical metadata
emit vertical publication event
```

Event 建議：

```text
ContentPublicationCreated
ContentPublicationVerified
ContentPublicationRolledBack
```

若 Core 發出 `ArtifactPublished`，vertical event 引用它，不用 `ContentPublished` 重複同一 semantic。證據：`EV-EVENT`、`EV-CRIT-H05`。

## 11. Rollback

每個 adapter 必須宣告：

```text
rollback type = native_version | inverse_operation | snapshot_restore | unsupported
```

`unsupported` 的 production operation 必須升高 policy/risk/human review，不得假裝可回滾。

## 12. Proposed Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/publishing-adapter.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/publishing.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/publishing/
```

Provider-specific implementation path 由 repo ADR 核准後建立；不得在此文件偷定永久 `/adapters/...` layout。
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
