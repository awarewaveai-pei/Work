# 19 Proposed V2 Architecture

> This is a synthesis, not a rewrite. V1 (`HCI_AI_LEGO_Blueprint_v1`) got the hard architectural calls right at the top level — the peer-product boundary, the modular-monolith posture, the evidence-before-inference discipline, the no-universal-trust-score stance. V2 keeps essentially all of it and changes what the 9 independent reviews converged on as genuinely load-bearing: a handful of missing domain entities, a security-enforcement layer that currently exists only as prose, and one Foundation-layer extraction that closes a real duplication risk. See `01_V1_KEEP.md` / `02_V1_CHANGE.md` / `03_V1_REMOVE.md` / `04_V1_MISSING.md` for the exhaustive item-by-item disposition; this file describes the resulting shape as a whole.

---

## 1. Product boundary — unchanged, now evidenced rather than asserted

**HCI-30 and AI LEGO Cognitive Engineering OS remain independent peer products.** This was re-derived independently by the domain, AI, and commercial reviewers using six criteria (domain ownership, failure independence, commercial independence, data ownership, deployment independence, evolution independence) rather than accepted from V1's own framing, and it survives on 5 of 6 criteria cleanly. The one criterion that does **not** cleanly support pure independence — data ownership — is where V2 differs from V1: not by merging the products, but by extracting a **small, versioned, vendor-neutral Foundation-layer kernel** that both products consume without either one owning or depending on the other's runtime.

```text
V1 stated:  HCI-30  <-- independent peer -->  AI LEGO Cognitive OS
V2 verdict: HCI-30  <-- independent peer -->  AI LEGO Cognitive OS
                  \                              /
                   \--  shared/platform kernel  --/
                        (versioned, vendored/pinned by each side,
                         NOT a live shared service)
```

This is the verdict the independence-verdict synthesis agent reached (`PARTIAL_SHARED_PLATFORM`), explicitly checked against the "Shared God Platform" anti-pattern the mission brief forbids: the kernel is a **contract both sides vendor a specific version of**, not a running service either product calls at request time — so "HCI works without AI LEGO" (doc 10's own invariant) is preserved by construction, not merely by policy.

### What moves into the shared kernel (see HD-09)
1. **Canonical thin-reference types** crossing the HCI↔AI LEGO boundary (`EntityRef`, `PersonRef`, `OrganizationRef`, `EvidenceRef`, `TenantContext`, `ActorRef`, `SourceRef`) — doc 18 already anticipated this exact mechanism but it was never built, and AI LEGO's `Evidence`/`Claim` schemas are currently full records, not stubs, embedded directly where a thin reference was supposed to cross.
2. **Epistemic status / provenance labeling** (fact vs. assumption vs. AI-inference vs. human-opinion) — AI LEGO already has an ACCEPTED, ADR-governed 11-value enum with promotion redlines; HCI's independently-invented Fact/Observation/Interpretation/Hypothesis model should extend this kernel, not re-derive it.
3. **Risk-tier / human-authority gating ladder** — AI LEGO's `mandatory-gates.yaml` (R0-R4) already exists as policy-as-code; HCI's freshly-invented LOW/MEDIUM/HIGH/CRITICAL table should be replaced by consuming the same ladder.
4. **Tenant / entitlement / billing substrate** — explicitly Foundation LEGO in doc 18's own taxonomy; the real shipped `portal.aware-wave.com` code already provides a starting point, provided HD-01 (Tenant reconciliation) is resolved first.

### What stays deliberately separate (do not share, per the mission's anti-God-Platform constraint)
- Person/Relationship/TrustDomain/Decision domain logic (HCI-owned)
- Method/Workflow/ExecutionRun orchestration logic (AI LEGO-owned)
- The two evidence *ledgers themselves* (HCI Domain Evidence vs. AI LEGO Execution Evidence) — only their *shape vocabulary* is shared, not their storage or ownership

---

## 2. Domain model additions (closes the four biggest gaps found)

V1's entity list is extended, not restructured:

- **`DataSubjectRequest`** (HD-03) — the researched Person's access/dispute/correction/deletion channel, with lineage into the bitemporal history so a correction produces a new version, never a silent overwrite.
- **`PersonMergeLog` / `PersonSplitLog`** (HD-04) — reversible, audited lineage for identity-resolution corrections, so a wrong match has a documented recovery path instead of none.
- **`Case` / `Engagement`** (HD-10) — a bounded aggregate root for a due-diligence effort, distinct from the billing-scoping `Project` concept, giving doc 13's replay requirement something finite to replay against.
- **`Consent`** (HD-02), explicitly scoped to one of the three meanings currently collapsed together (recommend: model as three distinct fields — tenant authorization, subject consent where applicable, source terms-of-use — rather than one bare entity).

## 3. Data architecture — Option A confirmed, with the two gaps that were prose closed into schema

Per `13_ARCHITECTURE_OPTIONS_MATRIX.md` §1: **PostgreSQL modular monolith**, unchanged from V1's implicit direction, now explicitly chosen over full event-sourcing and a standalone graph DB with named trigger conditions for both escalation paths (Apache AGE in-Postgres first; a dedicated event-sourced subsystem only for a specific narrow need like historical-confidence recomputation).

What's new in V2 is enforcement, not shape:
- **Bitemporal columns** (`valid_from`/`valid_to`/`system_recorded_at`/`system_superseded_at`) on Evidence/Claim/Assessment/Decision specifically (HD-06) — not universal.
- **DB-enforced insert-only ledgers** (`REVOKE UPDATE/DELETE` + trigger), not an application-level `version` column that can still be silently mutated.
- **Crypto-shredding** (`encryption_key_ref` + `tombstoned_at`) as the schema-level resolution of the immutable-evidence-vs-erasure tension (HD-07), designed in from Wave 1 rather than retrofitted.
- **RLS made mandatory** (not "where appropriate") for every tenant-owned table, backed by a CI-blocking test that actually attempts a cross-tenant read under a non-superuser role (HD-05) — the single highest-leverage security change in this whole package, per the red-team cross-check (`12_RED_TEAM_FAILURE_ANALYSIS.md`): zero of the red team's 16 attack scenarios were found to be blocked by anything in V1 as currently specified.

## 4. Deployment — confirmed NOW/NEXT/FUTURE posture, made explicit rather than implicit

No change to V1's underlying instinct (modular monolith on the existing single OVH box, reuse `sg-deploy.sh`/Loki-Promtail-Grafana/existing backup tooling). What V2 adds is that every "later" decision now has a **named, measurable trigger** instead of "when we scale" — see `13_ARCHITECTURE_OPTIONS_MATRIX.md` §4 for the full table. The one addition with real near-term teeth: **a rehearsed, cross-box restore drill becomes a P0/Wave-1 gate**, not a Gate-C (paid-tier) acceptance criterion — the single dedicated server is confirmed (independently, by two reviewers via two different methods) to be the actual dominant disaster-recovery risk, and it is currently unrehearsed.

## 5. Security enforcement layer — the largest actual change from V1

This is where V2 differs most from V1 in substance, not shape. V1's principles here were independently assessed as sound; what's missing is enforcement:
- RLS mandatory + CI test (§3 above)
- Break-glass admin access with DB-session-level audit logging, pulled forward from P1 to Wave 2 (reuses the audit schema already planned there)
- Minimal key-rotation/compromise-response runbook pulled forward to P0 (HD-12), while full BYOK/KMS machinery stays P1
- Preventive (not just detective) control on bulk exports of RESTRICTED data above a threshold (HD-18)
- Minimum-viable evidence-authenticity check (hash/EXIF/reverse-search corroboration) pulled into Wave 4 alongside evidence admission, with advanced synthetic-media detection staying P2 (HD in `12_RED_TEAM_FAILURE_ANALYSIS.md` RT-06)

## 6. Compliance/legal scope — named, not silent

V1 does not mention GDPR, the EU AI Act, or FCRA anywhere in 24 documents, despite HCI-30's core function matching statutory definitions in both regimes (independently confirmed by two reviewers via two different methods — `14_CONVERGENCE_MATRIX.md` CM-08). V2 does not require full compliance programs before launch — it requires the operator to make an explicit, documented scoping decision (HD-20, HD-21) so the exposure is a known, chosen risk rather than an undiscovered one.

---

## What did NOT change

The majority of V1 survives intact — see `01_V1_KEEP.md` for the full list, but the headline items: the peer-product boundary, evidence-before-inference, no-universal-trust-score, modular-monolith-first, PostgreSQL-as-core, RLS-as-default-isolation, deferral of Kubernetes/event-sourcing/graph-DB/message-broker/multi-region until named triggers fire, and the overall Fact/Observation/Interpretation/Hypothesis epistemic discipline (now sourced from the shared kernel rather than independently re-derived, but conceptually unchanged). V2 is a hardening and completion of V1's own stated intent, not a different architecture.
