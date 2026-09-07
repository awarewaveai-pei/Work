# Media LEGO capability adoption and promotion catalog

**狀態：規劃映射；沒有 media capability contract 或 registry record 被建立為 ACTIVE。**
**日期：2026-09-06**

## 目的

這份文件是影片平台與既有 AI LEGO catalog 的採用映射，避免影片文件自行形成第二個 registry。全域 resolver 的不變量是：只有 contract file 存在、ID 相符且 `status: ACTIVE` 的能力可解析與執行，見 `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-023-capability-resolution-fail-closed.md:19-35`。

因此下表的 `PLANNED` 不可被程式、UI、workflow 或 operator 當作可執行能力。它只指定未來 contract、實作與 promotion 必須對齊的穩定身份。

## Canonical ID 規則

所有 media ID 必須符合既有 grammar：`^[a-z_]+(\.[a-z_]+)?$`，來源是 `SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md:32-50`。因此 public ID 只允許一個 namespace dot，例如 `media.transcribe_local`；多段點式 `media.transcribe.local`、`media.delivery.social.postiz` 和動詞順序不一致的 `media.deliver.*` 都不是合法的 capability ID。

實作 block、route、Postiz adapter 或 provider 名稱可以使用自己的路徑／名稱，但它們是 implementation mapping，不能取代 canonical public ID。

## Planned catalog

| Canonical ID | Domain | Typed intent | Initial implementation mapping | Promotion prerequisite |
|---|---|---|---|---|
| `media.story_bible_plan` | workbench | brief + approved references → Bible candidate | future Director service | Bible schema, continuity fixtures, owner / policy / rollback. |
| `media.story_bible_validate` | Core | Bible version → validation findings | future validator | immutable reference / state-delta proof. |
| `media.timeline_plan` | Core | Bible or EDP → Timeline candidate | future planner adapter | provenance / capability-resolution evidence. |
| `media.timeline_validate` | Core | Timeline v1 → structural and repository validation report | isolated Timeline v1 validator | repository resolver, ownership / rights / source-bound tests. |
| `media.asset_ingest` | production | upload → normalized source asset | future ingest worker | hash, MIME, duration, rights and tenant proof. |
| `media.asset_generate` | production | governed prompt → generated asset | provider adapter | allowlist, cost reservation, provenance and rollback. |
| `media.transcribe_local` | production | approved source asset → timed transcript | meeting-service worker adapter | transcript schema, resource limits, confidence policy, durable job. |
| `media.caption_compose` | production | approved transcript → caption renditions | future caption worker | SRT/VTT/ASS fixture, safe area and reading-speed QA. |
| `media.edit_plan_create` | workbench | authorized footage + brief → EDP candidate | future editor adapter | source range / proxy / ownership validation. |
| `media.edit_plan_validate` | Core | EDP version → validation findings | future validator | range, overlap, frame-alignment and rights tests. |
| `media.render_quick` | production | validated Timeline → Quick Engine candidate | existing Quick Engine adapter | Phase 1B durable job, idempotency, output finalization. |
| `media.render_remotion` | production | validated Timeline → Remotion candidate | existing `dynamic-slideshow` adapter | durable job, artifact resolver, restart recovery. |
| `media.qa_technical` | production | candidate asset → technical evidence | future QA worker | detector fixtures, profile version and report-only calibration. |
| `media.qa_editorial` | production | candidate + source context → review findings | future review workbench | reviewer identity, waiver policy and immutable report. |
| `media.release_create` | production | approved artifacts + QA → Release | future Release service | reference pin, required-QA transaction and rollback pointer. |
| `media.delivery_website` | delivery | Release → WordPress receipt | wp-bridge adapter | draft/replace/verify/revision rollback proof. |
| `media.delivery_social` | delivery | Release → Postiz receipt | Postiz adapter | destination policy, idempotency, external-ID verification. |
| `media.delivery_verify` | delivery | delivery attempt → verified outcome | delivery verifier | destination evidence, unknown/retry classification. |
| `media.collect_outcomes` | delivery | delivery evidence → append-only metric snapshot | outcome collector | tenant policy, API scope, retention and privacy proof. |

## Alias quarantine

The following historical labels must not be registered, invoked or copied into new code. They are documentation aliases only; each is replaced by the canonical row above.

| Rejected label | Reason | Replacement |
|---|---|---|
| `media.transcribe.local` | more than one dot; fails grammar | `media.transcribe_local` |
| `media.delivery.social.postiz` | more than one dot; adapter name embedded in public identity | `media.delivery_social` with Postiz mapping |
| `media.deliver.wordpress` | verb family differs from delivery contract | `media.delivery_website` |
| `media.deliver.social` | verb family differs from delivery contract | `media.delivery_social` |
| `media.story_develop` | ambiguous output and conflicts with Bible contract | `media.story_bible_plan` |
| `media.edit_plan` | ambiguous create/validate behavior | `media.edit_plan_create` or `media.edit_plan_validate` |

## Promotion packet for one capability

Before a listed ID can become ACTIVE, submit one package containing all of the following:

1. `capabilities/contracts/<canonical-id>.capability.yaml` with matching ID, version, typed input/output, owner, risk class, policy preconditions and rollback.
2. schema fixtures and contract test that prove malformed input, unknown / disabled ID and policy failure do not invoke an adapter.
3. implementation mapping through typed ports only; no page import, provider secret, private table or raw browser-controlled provider name.
4. durable job / artifact / audit evidence when the operation has spend, compute, storage, renderer, QA or delivery side effects.
5. staging evidence, healthcheck, retry classification, operational owner and an independently executable rollback.
6. update to this mapping, the global registry, platform phase receipt and worklog in one reviewable change.

Until that packet passes, callers must receive an explicit unresolved / inactive capability result and stop before provider, renderer, R2, WordPress or Postiz side effects.
