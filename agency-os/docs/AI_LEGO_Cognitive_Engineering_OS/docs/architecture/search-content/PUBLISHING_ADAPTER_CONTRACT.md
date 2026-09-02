# Publishing Adapter Contract

**Document ID:** `search-content.publishing-adapter`  
**Status:** `PROPOSED`  
**Version:** `1.1.0-draft`  
**AI-LEGO baseline commit:** `4b26e83612caad72698271545ee1952058cc32dd`  
**Master architecture:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md` v3（敘事正本；Errata 見其文末附錄）  
**Critical review:** `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW.md`  
**Canonical repo path:** `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/search-content/PUBLISHING_ADAPTER_CONTRACT.md`（ADR-021 §D8，ACCEPTED 2026-09-02）  

**目的：** 定義 provider-neutral Publishing Port、CMS/store adapter contract、state machine、idempotency、auth/least privilege、diff/approval、verification、rollback、partial failure。

**直接依賴：**
- `CONTENT_BRIEF_CONTRACT.md`
- `SEARCH_CONTENT_QUALITY_GATES.md`
- `Authority/Gate/Event Ledger contracts`

> 此文件不得自行覆蓋更高權威的 ACTIVE schema、accepted ADR 或 Architecture Constitution。發現衝突時，必須依 Scoped Authority 進入 `CONFLICT_REQUIRES_HUMAN_REVIEW`，不可選對實作者最方便的版本。

> 共同段落（§1 工程身份與決策準則／§2 路徑治理／§3 共同證據基準／§4 狀態詞彙對照／§5 驗證指令）已抽出至 [SEARCH_CONTENT_PACK_COMMON.md](SEARCH_CONTENT_PACK_COMMON.md)，本文件不重複；`EV-*` 證據 ID 一律解析到該檔 §3，由 `tests/architecture/search_content_pack_check.py` 核對存在。

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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §31.3 Adapter Contract (L3500-L3530)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §38.1 Suggested Adapters (L4324-L4336)"
decided_by: >
  ADR-021 §D1 (publishing adapters are vertical-owned); provider-neutral port, adapter owns
  protocol only.
```

## 3. Operations

### create_draft

Input：

```yaml
create_draft_input:
  artifact_ref:
  brief_ref:
  target_ref:
  title:
  slug:
  body_ref:
  metadata:
  media_refs: []
  idempotency_key:          # §6
  expected_artifact_hash:   # approval binding（gate search_content.publishing.approval_binding）
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §38.2 Publishing Operations (L4337-L4351)"
decided_by: "ADR-021 §D1 / §D7; capability publishing.create_draft"
```

Output：

```yaml
create_draft_output:
  publication_ref:
  provider_object_id:
  remote_version:
  preview_url:
  remote_content_hash:      # 2026-09-02 更名自 content_hash：與 content_publication.content_hash（approved artifact hash）語意不同（EV-AUDIT-0902 task 3）
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §38.2 Publishing Operations (L4337-L4351)"
decided_by: "ADR-021 §D1 / §D7; capability publishing.create_draft"
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

**Schema SSOT 在 `SEARCH_CONTENT_DOMAIN_MODEL.md` §3 ContentPublication state machine**（含 staged-only branch 與 9 值 failure enum）——本文件不重複宣告，只描述本文件對它的實作責任：

```text
CONTENT_READY
→ DRAFT_CREATED
→ PREVIEW_READY
→ VALIDATED
→ APPROVED_IF_REQUIRED
→ SCHEDULED|PUBLISHED
→ VERIFIED
```

本文件是這條 state machine 主線的**執行者**（decided_by 此文件：實際觸發 SCHEDULED/PUBLISHED/VERIFIED 轉態的 adapter 邏輯）；staged-only 分支與 9 值 failure enum 的權威定義在 Domain Model，避免此處與 §5-§10 各自維護一份會再度分裂。

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
source_of_truth_for:
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §38.4 Publishing Authority Policy (L4369-L4384)"
  - "SEARCH_CONTENT_DOMAIN_ARCHITECTURE.md §39 Publishing Safety (L4385-L4412)"
decided_by: >
  ADR-021 §D7; risk_tier uses EV-RISKTIER R0-R4, max_autonomy uses EV-AUTH A0-A4 (never derived
  from each other); required_global_gates come from EV-MGATES, never restated here.
```

不得用 `risk tier number == authority number` 自行推導。

**MVP 預設 policy 表（2026-09-02，填補先前空的 `required_domain_gates: []`，`EV-AUDIT-0902` M11）**——正式 policy 檔落 `policies/search-content/publishing.policy.yaml`（§12），此表是它的 seed，不是第二份正本：

| operation | risk_tier | max_autonomy | required_domain_gates | human_approval_required | rollback_required |
|---|---|---|---|---|---|
| `create_draft` | R1 | A2 | `publishing.required_fields`, `publishing.metadata_validation`, `publishing.slug_url` | no | no（draft 可刪）|
| `update_draft` | R1 | A2 | 同上 + `publishing.remote_diff` | no | no |
| `preview` | R0 | A2 | — | no | no |
| `diff` | R0 | A2 | — | no | no |
| `schedule` | R3 | A3 | `bundle.publishing_production`（Quality Gates §10.5）+ brief 指定的 domain bundles + `evidence.*` 全部 | per policy | yes |
| `publish` | R3（regulated content → R4）| A3（R4 → A4）| 同 `schedule` | R3 per policy；R4 一律 yes | yes |
| `unpublish` | R3 | A3 | `publishing.approval_binding`, `publishing.rollback_readiness` | yes | yes |
| `rollback` | R2 | A2（policy 允許時自動）| `publishing.rollback_readiness` | no | n/a |
| `verify` | R0 | A2 | `publishing.remote_diff` | no | no |

Global 14 項 gate 不在此表——它們對每個 deliverable 無條件強制（`EV-GATE` `:238`），R3/R4 另加 6 項 high-risk gate（`EV-MGATES`）。gate id 前綴 `search_content.` 在表中省略。

## 6. Idempotency

所有 write operation：

```text
idempotency_key = SHA-256( JCS({ tenant_ref, target_ref, operation, approved_artifact_hash, intended_version }) )
```

**序列化與 hash 函數（2026-09-02 裁決，`EV-AUDIT-0902` task 11）**：欄位物件以 **JSON Canonicalization Scheme（RFC 8785, JCS）** 序列化（key 排序、UTF-8、無空白、數字正規化），再取 **SHA-256** 十六進位小寫。`approved_artifact_hash` = 對 approved artifact body 依同一 JCS 規則（純文字 body 則為 UTF-8 bytes）取 SHA-256；`content_publication.content_hash` 儲存此值，`metadata_hash` 對 metadata 物件同法。選 JCS + SHA-256 的理由：兩者皆為公開標準、無 provider 依賴、30 年內可重算；不用 provider 的 ETag／version 當 key（那是 `remote_version`，另存）。

**Partial failure（2026-09-02 裁決）**：多步 operation（例如 media 上傳 + body 寫入）任一步失敗 → `publication_state: PARTIALLY_PUBLISHED`（平台 side state `PARTIAL_SUCCESS`，`EV-STATUS`），**同一 execution 內**必須轉為 `ROLLBACK_REQUIRED` 或以同一 idempotency_key 重送完成；不得停留在 PARTIALLY_PUBLISHED 跨 execution，也不得發 `ContentPublicationVerified`。

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

Hard checks 與 `SEARCH_CONTENT_QUALITY_GATES.md` §8 的 gate id **一一對應**（2026-09-02，`EV-AUDIT-0902` M11：先前 10 條散文 check 對 8 個 gate，5 條無 gate、3 個 gate 無 check）。gate record（severity／NOT_APPLICABLE 規則／remediation）在 `SEARCH_CONTENT_GATE_RECORDS.yaml`，此表的 `publish_check` 欄位與其逐字相同：

| # | Hard check | Gate id |
|---|---|---|
| 1 | required fields | `search_content.publishing.required_fields` |
| 2 | page metadata（title/description/OG）valid | `search_content.publishing.metadata_validation` |
| 3 | canonical/robots | `search_content.publishing.canonical_robots` |
| 4 | hreflang when applicable | `search_content.publishing.hreflang` |
| 5 | structured data syntax + visible-content consistency | `search_content.publishing.structured_data_consistency` |
| 6 | internal links | `search_content.publishing.link_integrity` |
| 7 | media refs + alt requirements | `search_content.publishing.media_integrity` |
| 8 | slug/url | `search_content.publishing.slug_url` |
| 9 | redirect implications | `search_content.publishing.redirect_impact` |
| 10 | remote diff reviewed（`publishing.diff`）| `search_content.publishing.remote_diff` |
| 11 | approval hash binding | `search_content.publishing.approval_binding` |
| 12 | rollback declared | `search_content.publishing.rollback_readiness` |

發布**後**的驗證（remote 真的吐出來的頁面）在 §10，不在此表——驗證報告指出 master §31.7 的四項 post-publish check 曾被搬到發布前，此處明確分開。

## 10. Verification

Publish 之後不能只相信 API 200：

```text
fetch/read remote object
verify expected provider object id/version
verify content hash（exact SHA-256 match；"approved semantic equivalence" 尚無定義 → OPEN_QUESTION OQ-SC-5，暫行規則 fail-closed）
verify published state
verify critical metadata
emit vertical publication event
```

Event 建議：

```text
ContentPublicationCreated      # aggregate ContentPublication；producer publishing.create_draft
ContentPublicationVerified     # payload 必帶 verification_scope: STAGED | PRODUCTION
ContentPublicationRolledBack   # 2026-09-02 納入 ADR-021 §D6 registry；rollback record 依 EV-ROLLBACK
```

若 Core 發出 `ArtifactPublished`，vertical event 引用它，不用 `ContentPublished` 重複同一 semantic；但 `ArtifactPublished` 目前在 Core 無 payload contract（DEPENDENCY `OQ-SC-16`），vertical 的正確性不得依賴它存在。證據：`EV-EVENT`、`EV-CRIT-H05`。

## 11. Rollback

每個 adapter 必須宣告：

```text
rollback type = native_version | inverse_operation | snapshot_restore | unsupported
```

每次 rollback 產生的記錄依平台 `EV-ROLLBACK`（`specs/execution/rollback.schema.yaml`）；`ROLLED_BACK` 終態與 side state 對照見 `SEARCH_CONTENT_DOMAIN_MODEL.md` §3。

`unsupported` 的 production operation 必須升高 policy/risk/human review，不得假裝可回滾。

## 12. Proposed Paths

```text
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/search-content/publishing-adapter.schema.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/policies/search-content/publishing.policy.yaml
agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/tests/contracts/search-content/publishing/
```

Provider-specific implementation path 由 repo ADR 核准後建立；不得在此文件偷定永久 `/adapters/...` layout。
