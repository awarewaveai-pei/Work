# 02 — Product Boundaries

## Purpose

Define the permanent separation between HCI-30 and AI LEGO Cognitive Engineering OS.

---

# HCI-30

## Product identity

**Human Collaboration Intelligence**

HCI answers:

- Who is this Subject (Person, and pending the decision below, Organization)?
- What is known and unknown?
- What has this Subject done?
- What is the quality of the evidence?
- What patterns appear across time and context?
- What is trustworthy, and in which domain?
- What are the incentives?
- What power and dependency structures exist?
- What collaboration depth is safe?
- What controls are required?
- Should we proceed, limit, pause, review, or exit?

> ✅ **RESOLVED (`HD-00` / `DOM-12`, 2026-09-01) — ADR-0011**: V1 assessment functionality is Person-only. Wave 1 must reserve a nullable, forward-compatible `subject_type`/`subject_id` shape with `subject_type` defaulting to `PERSON`; it is not permission to assess Organizations. An Organization remains an attribute or relationship node until a future explicit ADR authorizes independent Organization Evidence, Assessment, and TrustDomain behavior. The ERD/table matrix, Person-default constraint, and non-Person negative test remain open implementation gates in `governance/ADR-0011-hci-subject-type-scope.md`.

## Core domain objects

```text
Person
Organization
Relationship
Interaction
Observation
Evidence
Claim
PublicEvent
Hypothesis
Assessment
TrustDomain
Risk
Permission
Collaboration
Decision
Outcome
Review
Consent
Case / Engagement          -- new in V2, see 07 §Case Aggregate
DataSubjectRequest         -- new in V2, see 07 §Data Subject Rights
PersonMergeLog / PersonSplitLog  -- new in V2, see 07 §Identity Correction
```

**Terminology note (new in V2)**: `Relationship` in this list means the *type of connection* between two entities (e.g., "employed by," "introduced by," "supplier to"). It is distinct from `Collaboration`, which means the *lifecycle and depth* of an active working engagement (see `04_HCI30_PRODUCT_SPEC.md` §Collaboration Stages). V1 used these terms adjacently without a stated distinction; naming them separately here removes an ambiguity a graph-schema implementer would otherwise have to guess at (`HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-07).

**Permission vs. Data Classification (new in V2, clarifying an ambiguity in V1)**: `Permission` (see `19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md` §Permission UI, tiers P0-P6) governs *who inside a tenant may see or act on a given piece of HCI content* — it is an access-control axis. `Data Classification` (see `11_SECURITY_PRIVACY_GOVERNANCE.md` §Data Classification, PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) governs *how sensitive the content itself is* and drives encryption/audit/export requirements — it is a data-sensitivity axis. The two are orthogonal: a P0 (Public-tier) permission item can still be RESTRICTED-classified data if it concerns a real person, and a P6 (Governance-tier) permission item might be only INTERNAL-classified. V1 used overlapping vocabulary between the two lists without stating this distinction, which risks producing an incorrect authorization model if an implementer treats them as the same axis (`HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-08). Keep them as two separate, independently-set fields on every governed entity.

---

# AI LEGO Cognitive Engineering OS

See `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` for full detail. Core domain objects: Problem, Method, Workflow, ExecutionRun, ModelRoute, ConvergenceMatrix.

---

# The peer-product boundary

**Confirmed correct after independent re-derivation against six criteria** (domain ownership, failure independence, commercial independence, data ownership, deployment independence, evolution independence) — not merely carried forward from V1's own framing. See `HCI30_RESEARCH_REVIEW/05_DOMAIN_ARCHITECTURE_REVIEW.md` DOM-11 (KEEP, High confidence) and the independence-verdict synthesis referenced there.

**One qualification, not a reversal**: 5 of 6 criteria cleanly support full independence. The sixth — data ownership — does not, because HCI's evidence/epistemic vocabulary and AI LEGO's already-built equivalent independently reinvent the same concepts under the same names with different shapes. The resolution is a small, versioned, shared Foundation-layer kernel (see `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` §Shared Kernel) — not merging the two products, and explicitly not building a "Shared God Platform." HCI must remain fully usable when AI LEGO is unavailable, and vice versa (`13_TESTING_REPLAY_ROLLBACK_AND_SRE.md` §Graceful Degradation).

## `app.aware-wave.com` vs `portal.aware-wave.com`

Critical invariant, unchanged from V1:

```text
app.aware-wave.com
!=
portal.aware-wave.com
```

`app` is the internal Lobster Factory operations/admin console. `portal` is the external multi-tenant customer control plane. `app` must not become the external customer portal.

> ✅ **RESOLVED (`HD-01` / `DOM-01` / `G-01`, 2026-09-01) — ADR-0009**: AI LEGO ADR-003's three-level Tenant model is HCI's shared platform primitive. HCI represents Organization as an attribute or graph node under Workspace; the portal `organizations` record is an adapter, not a second platform Tenant. This does not authorize cross-product DB access or a portal-data migration. The tenant/organization mapping, compatibility/migration plan, and cross-tenant adapter negative test remain open gates in `governance/ADR-0009-tenant-organization-model-reconciliation.md`.
