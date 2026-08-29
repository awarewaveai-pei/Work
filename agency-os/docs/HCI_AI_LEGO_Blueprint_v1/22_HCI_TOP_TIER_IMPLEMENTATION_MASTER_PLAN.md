> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md. See 00_README.md in this folder for why.

# 22 — HCI-30 Top-Tier Implementation Master Plan

## Goal

Move HCI-30 from architecture baseline to a production-verifiable, commercially deployable, LEGO-extensible, 30-year system without architectural rework.

## Dependency order

```text
Constitution
→ Domain semantics
→ Data model
→ Policy
→ Security boundaries
→ Contracts
→ Core workflow
→ Intelligence
→ Public Intelligence
→ Commercial controls
→ Enterprise controls
→ Optional AI integration
→ Scale/extensions
```

# Wave 0 — Freeze invariants

Path:

```text
D:\Work\agency-os\docs\ADR\
```

Create/lock ADR-0001 through ADR-0013 already identified in the baseline.

Expected result: later teams cannot collapse HCI/Cognitive, app/portal, DB boundaries, or trust semantics.

# Wave 1 — Domain foundation

Paths:

```text
D:\Work\agency-os\systems\hci30\docs\domain\
D:\Work\agency-os\systems\hci30\database\
D:\Work\agency-os\systems\hci30\domain\
```

Deliver:
- ERD
- entity dictionary
- state machines
- bitemporal model
- DB schema
- constraints/indexes
- fixtures

Acceptance:
- migration from empty DB passes
- tenant ownership enforced
- invalid state transitions fail
- history remains queryable
- “what was known at T” test passes

Expected result: stable core survives UI/AI/provider replacement.

# Wave 2 — Policy + security boundary

Paths:

```text
D:\Work\agency-os\systems\hci30\governance\
D:\Work\agency-os\shared\security\
D:\Work\agency-os\shared\platform\identity\
D:\Work\agency-os\shared\platform\tenants\
```

Deliver:
- machine-readable policies
- RBAC/ABAC
- tenant-context standard
- key hierarchy
- audit schema
- JIT/break-glass
- service accounts

Acceptance:
- cross-tenant access fails
- admin != unrestricted content access
- fail-closed policy
- high-risk export audited

Expected result: blast radius is bounded before sensitive data enters production.

# Wave 3 — Contract-first API/events

Paths:

```text
D:\Work\agency-os\systems\hci30\api\
D:\Work\agency-os\shared\contracts\
```

Deliver:
- OpenAPI
- AsyncAPI
- error model
- idempotency
- webhooks
- version/deprecation
- contract tests

Expected result: frontend/workers/portal/API integrations evolve independently.

# Wave 4 — Evidence/Claim/Assessment core

Paths:

```text
D:\Work\agency-os\systems\hci30\domain\evidence\
D:\Work\agency-os\systems\hci30\domain\claims\
D:\Work\agency-os\systems\hci30\domain\assessments\
D:\Work\agency-os\systems\hci30\security\evidence-integrity\
```

Acceptance trace:

```text
Decision
→ Assessment
→ Method
→ Claim
→ Evidence
→ Source
```

Expected result: explainability is structural.

# Wave 5 — Intelligence math v1

Paths:

```text
D:\Work\agency-os\systems\hci30\intelligence\
D:\Work\agency-os\systems\hci30\docs\intelligence\
```

Implement only from formal specs.

Acceptance:
- golden datasets
- property/invariant tests
- counterfactual tests
- insufficient-data state
- versioned outputs

Expected result: reproducible analysis, not arbitrary AI scoring.

# Wave 6 — Hardened Public Intelligence

Paths:

```text
D:\Work\agency-os\systems\hci30\public-intelligence\
D:\Work\agency-os\systems\hci30\security\threat-models\
```

Pipeline:

```text
Search
→ isolated fetch
→ malware/MIME checks
→ normalization
→ untrusted-content label
→ identity match
→ source quality
→ claim extraction
→ verification
→ admission gate
```

Acceptance:
- SSRF/malware/prompt-injection tests
- source poisoning tests
- false identity match tests
- allegation counter-search
- URL provenance

Expected result: the internet never becomes a trusted input channel.

# Wave 7 — HCI customer UI

Path:

```text
D:\Work\agency-os\systems\hci30\apps\web\
```

Host:

```text
hci.aware-wave.com
```

UI priority:
- evidence/claims
- relationship timeline
- trust domains
- unknowns
- contradictions
- why-this-conclusion
- permissions
- decisions
- sources
- review

Expected result: evidence and decision clarity come before chat UX.

# Wave 8 — Commercial control-plane integration

Future external:

```text
portal.aware-wave.com
```

Existing internal remains:

```text
app.aware-wave.com
```

Paths:

```text
D:\Work\agency-os\shared\platform\entitlements\
D:\Work\agency-os\shared\platform\licensing\
D:\Work\agency-os\shared\platform\billing\
```

Expected result: HCI can sell Personal→Enterprise without business logic contaminating domain core.

# Wave 9 — Enterprise readiness

Paths:

```text
D:\Work\agency-os\systems\hci30\enterprise\
D:\Work\agency-os\systems\hci30\privacy\
D:\Work\agency-os\shared\security\controls\
```

Deliver:
- SSO/SCIM
- retention/legal hold
- DLP
- audit export
- residency
- dedicated DB
- BYOK
- support access governance
- procurement/trust package

Expected result: standard enterprise due diligence becomes answerable.

# Wave 10 — Optional AI LEGO integration

Path:

```text
D:\Work\agency-os\systems\hci30\integrations\cognitive-os\
```

Acceptance:
- no direct DB
- timeout/failure graceful
- contract compatibility
- AI results cannot self-admit as HCI facts
- run references preserved
- convergence != evidence confidence

Expected result: advanced cognition is replaceable LEGO.

# Wave 11 — Scientific calibration

Paths:

```text
D:\Work\agency-os\systems\hci30\governance\methods\
D:\Work\agency-os\systems\hci30\tests\calibration\
D:\Work\agency-os\systems\hci30\tests\bias\
```

Deliver:
- validation lifecycle
- benchmark data
- outcome labels
- calibration
- false positive/negative analysis
- independent expert review

Expected result: HCI can measure whether it actually improves decisions.

# Wave 12 — 30-year resilience / ecosystem

Paths:

```text
D:\Work\agency-os\shared\platform\lego-runtime\
D:\Work\agency-os\shared\platform\capability-registry\
D:\Work\agency-os\systems\hci30\data-portability\
```

Deliver:
- signed LEGO manifests
- sandbox
- compatibility
- kill switch
- export/import versioning
- private/customer-cloud deployment
- region migration
- deprecation lifecycle

Expected result: future tools/models/methods can be swapped without rewriting HCI.

# Release gates

## Gate A — Prototype
Waves 0–3.

## Gate B — Internal dogfood
Waves 0–5 + backups/security baseline.

## Gate C — Paid Personal/Pro
Hardened public intelligence + export/delete + incident response + restore test.

## Gate D — Team/Business
RBAC/collaboration + tenant isolation tests + audit + commercial controls.

## Gate E — Enterprise
SSO/SCIM + privacy/compliance ops + external pen test + DR exercise + SLA/SLO.

## Gate F — Group/Private
Multi-region/residency + dedicated/private deployment + regional DR + migration tooling.

# Final top-tier proof

The system must prove:

```text
1. Why a conclusion exists.
2. What was known at the time.
3. Who was allowed to act.
4. How execution can be reproduced/explained.
5. How to recover or rollback when conclusion/code/provider/infrastructure is wrong.
```
