# ADR-0003 — `api.aware-wave.com` Is the Unified External Gateway

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; this ADR does not create, modify, or deploy any gateway routing config, DNS record, nginx vhost, or production infrastructure.

## Context

`ADR_INDEX.md:21` listed ADR-0003 as `PLANNED` at drafting time (since updated to `ACCEPTED` in the same batch), sourced against `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md` and `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`, and had never been written — no ADR file for it existed in `governance/` before this one. In the meantime the blueprint text already assumes the outcome informally: `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md:31` records `api.aware-wave.com` as the "Unified external API gateway — LIVE"; `:51-53` states it "Must remain a routing/security boundary, not a business-logic host"; `:135-144` recommends product-first namespaces `/hci/v1/...`, `/cognitive/v1/...`, `/platform/v1/...`, `/integrations/v1/...` all preserved under that one host; and `:148-152` lists the routing/security concerns the gateway may carry versus the product logic it may not.

`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:73-83` independently proposes `POST /cognitive/v1/workflows/execute` style endpoints for the HCI↔Cognitive-OS contract without naming which host serves them, and `:85` ("Transport — decided in V2") commits to a submit+webhook/poll transport built on that same unnamed-host namespace. Nothing already-ACCEPTED closes the gap this leaves open: a future implementer could read `10_...md` alone and stand up `cognitive.aware-wave.com/v1/...` as its own API host, which would contradict `03_...md`'s already-stated gateway role without any binding text forcing a choice.

`12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:7` confirms the operative infrastructure baseline this decision must fit: HCI-30 "ships as a new bounded context inside the existing modular-monolith pattern, reusing `sg-deploy.sh` + host-nginx + `lobster-nginx` routing already proven for `next-admin`" on a single OVH dedicated server operated solo. `12_...md:135` already models `api` as its own one-line "Public Integration Plane," structurally separate from the "Customer Product Plane" (`hci` / `cognitive` / `portal`) — but this plane model is descriptive prose, not a ratified constraint, until an ADR says so.

This ADR formalizes the constitutional principle the system already lives by (`api.aware-wave.com` is live and already routes external traffic per `03_...md:31`); it does not introduce new infrastructure.

## Decision

`api.aware-wave.com` is the single external gateway for every Aware Wave product, present and future. HCI-30 exposes its external API surface as `/hci/v1/...` under that host (`03_...md:138`). Cognitive OS's already-specified `/cognitive/v1/...` contract (`10_...md:73-83`) resolves under the same host — `https://api.aware-wave.com/cognitive/v1/...` — not under `cognitive.aware-wave.com` or any other hostname; this ADR closes the host-naming gap `10_...md` left open. No current or future Aware Wave product may publish a second public API host. `hci.aware-wave.com`, `cognitive.aware-wave.com`, and `portal.aware-wave.com` remain product/UI surfaces (`03_...md:73-85`), never independent API hosts.

The gateway's responsibility is bounded to routing/security concerns only, per the allowed/forbidden split already written at `03_...md:150-152`: authentication enforcement, tenant-context validation, routing, WAF/security controls, rate limiting, API version routing, request IDs, and observability hooks are allowed; HCI trust logic, HCI risk logic, Cognitive method logic, billing business rules, and any other product-specific domain behavior are forbidden.

**Alternatives considered and why they lose:**

- **Option B — per-product API host** (e.g. `hci-api.aware-wave.com`, or letting `10_...md`'s `/cognitive/v1/...` resolve at `cognitive.aware-wave.com`). This duplicates TLS/WAF/auth/rate-limit configuration across N hosts on the single-operator, single-dedicated-box baseline `12_...md:7` documents as the actual operating reality — there is no platform team to carry that multiplied surface. It also multiplies the DNS-reservation/subdomain-takeover exposure class the project already treats as a live discipline for `hci.aware-wave.com` specifically (`03_...md:79`, citing `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md` §1e), and it re-merges the "Public Integration Plane" back into the "Customer Product Plane" that `03_...md:156-172` and `12_...md:135` both keep structurally separate — reopening the exact class of plane-boundary gap the MainWP `default_server` incident already exposed once (`03_...md:174`).
- **Option C — no gateway; products call each other or clients directly over their own hosts.** This discards the Independence requirement at `10_...md:15` (HCI must remain usable when AI LEGO is unavailable) by removing the one place a boundary could fail closed, and it discards the already-decided submit+callback/poll transport at `10_...md:85`, which only forms a coherent, versionable contract when addressed through one gateway's routing table — not when each product independently owns and evolves its own host-level API surface.

## Required implementation gates

Wave 3 — "Contract-first API/events" (`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:67-71`, paths `Projects/internal/hci30/api/`, `packages/contracts/`) is where HCI's first real API surface ships. This ADR does not authorize that surface to ship until all of the following are implemented and reviewed:

1. **OpenAPI single-host constraint.** The Wave 3 OpenAPI spec (`Projects/internal/hci30/api/openapi.yaml` or equivalent) must declare exactly one `servers` entry, `https://api.aware-wave.com`, with all HCI paths rooted at `/hci/v1/`. CI-blocking check: a contract-test step parses the `servers` array and fails the build if any entry's host is not `api.aware-wave.com`.
2. **Negative routing test at the edge.** A named smoke check, e.g. `SMOKE_HCI_NO_DIRECT_HOST_API`, added to the existing sg-deploy Step 7 HTTP smoke-check family (per `CLAUDE.md`'s per-service deploy SOP), curls `https://hci.aware-wave.com/v1/...` once that host's DNS is reserved (gated separately by `03_...md:79`) and asserts it does **not** return an HCI API response — 404/no-route or a redirect to `api.aware-wave.com` only. Failure blocks deploy.
3. **Gateway-layer logic-purity check.** A CI grep/lint step over the nginx/`lobster-nginx` routing config path fails the build if HCI or Cognitive-OS domain terms (e.g. `trust_score`, `risk_tier`, evidence/assessment/claim keywords) appear anywhere in gateway/edge config — enforcing the forbidden list at `03_...md:152` as a machine-checked property, not a convention. Lands with Wave 3's contract tests (`packages/contracts/`).
4. **Service-placement inventory row.** `12_...md:155` already flags `docs/infrastructure/CURRENT_SERVICE_PLACEMENT.md` as cited-but-missing. This ADR does not create that file — that gap belongs to whichever change closes `12_...md`'s own D-01 finding — but it blocks Wave 3's HCI API deploy on a reviewed row existing in that file (or its superseding artifact) mapping `api.aware-wave.com → /hci/v1/* → HCI service`. CI check: file exists and contains the literal string `/hci/v1`.

Until all four gates pass, no HCI or Cognitive-OS endpoint may be deployed under any host other than `api.aware-wave.com`, synthetic or production.

## Consequences

- `api.aware-wave.com` remains the only public API host for all current and future Aware Wave products; HCI and Cognitive OS share its routing/security boundary, never its business logic.
- This ADR is cross-product, not HCI-only: it also binds Cognitive OS's `/cognitive/v1/...` contract (`10_...md:73-83`) to the same host, resolving the host-naming ambiguity that contract left open.
- `hci.aware-wave.com` and `cognitive.aware-wave.com` remain product/UI surfaces, not API hosts; this ADR does not change `03_...md:79`'s separate DNS-reservation-timing gate for `hci.aware-wave.com`.
- A later change to this decision requires a new HCI change proposal and an explicit superseding ADR, per the lifecycle rule at `ADR_INDEX.md:11`.

**This ADR does not authorize:** any DNS record change, nginx/vhost config change, or production deployment (it is documentation-only, per Scope above); reservation of `hci.aware-wave.com` DNS (separately gated at `03_...md:79`); any HCI or Cognitive-OS business-logic, real-person-data-processing, or legal-claim decision; or any change to the still-open gates in ADR-0009, ADR-0010, ADR-0011, ADR-0014, ADR-0015, or ADR-0016.

## Verification and rollback

- Verification recorded here is documentation-only: the gateway role and namespace convention are cross-linked to `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md`, `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md`, `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md`, and `governance/ADR_INDEX.md`.
- The OpenAPI single-host check, the negative routing smoke test, the gateway logic-purity check, and the service-placement inventory row have not been implemented; all four Wave 3 gates remain open. No HCI or Cognitive-OS `/v1` endpoint may ship to any environment, synthetic or production, until they pass.
- Before implementation, rollback is to supersede this ADR with a new explicit human decision. After implementation, rollback must be a reviewed routing-config change (not an ad hoc nginx edit) that either restores a prior host mapping or formally approves a second public API host via a superseding ADR — it must not silently reopen a second host while this ADR's Status still reads ACCEPTED.

## Evidence

- `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md:31, 51-53, 73-85, 135-144, 148-152, 156-174` — gateway LIVE status, role definition, product-host boundaries, namespace recommendation, allowed/forbidden gateway responsibilities, plane-separation model and the MainWP incident precedent.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:15, 73-83, 85` — Independence requirement, the host-unspecified `/cognitive/v1/...` contract this ADR resolves, and the already-decided async transport built on it.
- `12_DEPLOYMENT_API_AND_MULTI_TENANCY.md:7, 135, 153-155` — single-dedicated-box operating baseline, the existing "Public Integration Plane" model, and the cited-but-missing `CURRENT_SERVICE_PLACEMENT.md` gap this ADR's gate 4 depends on.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:67-71` — Wave 3 "Contract-first API/events" scope and paths, where these gates land.
- `governance/ADR_INDEX.md:11, 21` — ADR lifecycle rule and the prior `PLANNED` entry this ADR fulfills.
