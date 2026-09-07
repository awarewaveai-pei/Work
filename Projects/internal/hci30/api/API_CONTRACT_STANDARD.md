# HCI API Contract Standard (P0-06)

Cross-cutting conventions every future `/hci/v1/*` endpoint must follow. Not an endpoint inventory — no HCI API code exists yet (verified: `api/` did not exist before this file). Listing endpoints here would invent unshipped product scope. `openapi/hci-v1.yaml` and `asyncapi/hci-events-v1.yaml` prove these conventions are machine-readable via one worked example each, not a complete surface.

Status tags: **CLOSED** (reuses an already-ACCEPTED decision, cited) · **CONVENTION** (industry-standard mechanism, no product judgment needed) · **OPEN** (genuine undecided product/business call, not invented).

## Host & versioning — CLOSED

Single host `https://api.aware-wave.com`, HCI under `/hci/v1/` (ADR-0003, ACCEPTED). `openapi/hci-v1.yaml`'s `servers` array satisfies ADR-0003 gate 1 literally: exactly one entry, that host.

## Auth scopes — PARTIAL

Scope string shape `hci:<resource>:<action>` — CONVENTION. Gating scopes by minimum Permission tier (`P0`-`P6`, `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:100`) is the right axis — CLOSED, tiers already named. **Which resource requires which tier is OPEN**: P0-04 already found this mapping is "a business/risk-tolerance judgment, not a derivable formula" (`docs/intelligence/HCI_PERMISSION_SPEC.md`). Not invented here.

## Tenant context propagation — CLOSED (real mechanism, not assumed)

RLS resolves tenant via `hci.current_tenant_id()`, which reads the **active Postgres role** against `hci.app_tenant_bindings` (`database/migrations/0001_wave1_synthetic_up.sql:283-291`) — **not** a `SET LOCAL app.tenant_id` session variable. The API/worker layer must `SET ROLE` to the caller's bound tenant role (or hold a pre-scoped pooled connection) before any query. Real constraint on the still-unbuilt connection-pooling design; not itself a new decision.

## actor_id / service_account_id — PARTIAL (new finding this pass)

`hci.principals` (`database/migrations/0008_wave1_field_author_class_policy_up.sql:381-393`) is a real, shipped tenant-scoped identity stub (`id, tenant_id, display_name`), already used by ADR-0019's verifier FK. It is **not yet** the generic per-request actor concept `packages/contracts/tenant-context/TENANT_CONTEXT_STANDARD.md` left open: no `actor_class` (`agent`/`human`, required by ADR-0025) column, not wired to every table's write path. Closer than zero prior art; still OPEN as a general API concept.

## Pagination — CONVENTION

Cursor-based: `?cursor=&limit=`. Response envelope: `{data: [...], next_cursor: string|null}`. Default/max `limit` values are a load-testing question, not a contract blocker — left as an implementation detail.

## Idempotency — CONVENTION

`Idempotency-Key` request header (Stripe-style) required on every unsafe (`POST`/`PATCH`) write. Concretizes `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:72-74`'s already-decided-but-unmechanized aspiration ("write APIs should support idempotency keys").

## Concurrency — CLOSED (reuses an existing constraint)

Optimistic concurrency reuses the schema's own bitemporal-supersession uniqueness (`subject_records_supersedes_unique`, raises `H1008` as fallback, `database/ERROR_CODE_REGISTRY.md`) — two concurrent supersede attempts on the same row already collide at the DB (`23505` primary path, `H1008` defense-in-depth). The API's only job is translating that collision into `409 Conflict`. No new locking mechanism invented.

## Errors — CLOSED (reuses an existing registry)

Response shape: RFC 7807 `application/problem+json` — CONVENTION, shape only. Content: every domain error is a real `H1xxx` SQLSTATE already catalogued in `database/ERROR_CODE_REGISTRY.md` (SSOT for meaning — not duplicated here). `errors/ERROR_MAPPING.md` adds the one genuinely new artifact: an `H1xxx -> HTTP status` table.

## Versioning & deprecation — CONVENTION

URL-path major version (`/v1`, already fixed by ADR-0003). Deprecation signal: `Sunset` + `Deprecation` HTTP headers (RFC 8594) on an endpoint scheduled for removal. Minimum notice period before removal is OPEN — business decision, not invented.

## Webhook signatures — CONVENTION

`X-HCI-Signature: sha256=<HMAC-SHA256(body, per-tenant webhook secret)>` (GitHub/Stripe-style). Secret lifecycle reuses `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:80-82`'s already-decided creation/rotation/revocation/expiry requirement — no new secret-management model invented.

## Event naming & versioning — OPEN (convention proposed, not ratified)

`16_OPEN_DECISIONS_AND_NEXT_ARTIFACTS.md` item 11 marks this explicitly "Still open." Proposed convention, extending AI LEGO's own already-decided `cognitive.run.completed` pattern (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:87`): `hci.<entity>.<past_tense_event>` — e.g. `hci.data_subject_request.resolved`, reusing the real `event_type='RESOLVED'` enum value already shipped in `hci.data_subject_request_events` (`database/migrations/0001_wave1_synthetic_up.sql:176`). `asyncapi/hci-events-v1.yaml` demonstrates this one channel as a worked example; the full event catalog stays OPEN per the cited item — this is a proposal for the next decision-maker to ratify or reject, not a decision made here.

## Gateway logic-purity — CLOSED (restates ADR-0003 gate 3 as this file's own boundary)

No HCI/Cognitive domain term (`trust_score`, `risk_tier`, evidence/assessment/claim keywords) may appear in gateway/edge config. This standard governs the API service; the gateway (`api.aware-wave.com`) only routes.

## Schemas — no separate directory (reasoned deviation from the gap-analysis path list)

`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-06 names a `schemas/` directory alongside `openapi/`/`asyncapi/`/`errors/`. Type definitions instead live inline in each spec's own `components.schemas` (OpenAPI) / message `payload` (AsyncAPI) — standard practice for both formats, and avoids the same shape being maintained in two places. Disclosed here since it does not match the literal path, same disclosure pattern P0-09 used for its own path deviation.

## What this file does NOT close

Endpoint inventory (which resources/actions exist) — undecided product scope; inventing one would be speculative design, not documentation. ADR-0003's other 3 Wave-3 CI gates (negative routing smoke test, gateway logic-purity grep, service-placement inventory row) — infrastructure/CI work, not a documentation deliverable. Auth-scope-to-Permission-tier mapping, `actor_id` generic wiring, the full event catalog, pagination limit values, deprecation notice period — all named OPEN above, not silently dropped.
