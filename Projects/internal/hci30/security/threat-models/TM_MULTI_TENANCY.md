# Threat Model — Multi-Tenancy

P0-08 / 4 of 4. Scope: cross-tenant data leakage — the "single highest-blast-
radius technical vulnerability found across the entire V2 review"
(`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-09). This file is the threat-model
framing of that same underlying control; it does not re-derive P0-09's own
verification detail (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-09's own
"Partial closure" paragraph and [HCI_INVARIANTS.md](../../docs/domain/HCI_INVARIANTS.md)
§RLS enforcement completeness are the SSOT for that) — this file adds the
threat-actor/scenario framing P0-09 itself does not carry.

## Threat: silent cross-tenant read via a missing or wrong RLS policy

**Status: CLOSED at the wording/CI level, PARTIAL at the functional level.**

V1's own governance text was discretionary — "protected by DB-level Row
Level Security **where appropriate**" — a real gap given the actual
infrastructure is self-hosted Supabase/Postgres on a shared single box
(Tier A: shared app + shared DB + RLS, no other isolation layer)
(`HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-06). A developer
(human or AI agent) judging RLS "not appropriate" for a new table under time
pressure creates a silent leak with no compensating control.

V2 closed the wording gap: ADR-0016 makes `tenant_id NOT NULL` + forced RLS
+ a CI-blocking cross-tenant test **mandatory**, not discretionary
(`11_SECURITY_PRIVACY_GOVERNANCE.md` §Tenant isolation). `RLS-COMPLETENESS-
01`/`02` (`database/tests/wave1-negative-tests.sql`) now catch a future
tenant-scoped table that forgets RLS entirely, structurally, without anyone
remembering to write a new test. **What remains open**: this is a structural
check (RLS enabled + has *a* policy), not a functional one — a table with a
policy whose logic is simply wrong (e.g. `USING (true)`) still passes it.
Each RESTRICTED table's own `RLS-LEAK-NN` real-query test remains the actual
functional proof; the catalog check is a second, independent layer, not a
replacement.

## Threat: undecided tenant-scoping for public-intelligence records

**Status: RESOLVED (ADR-0026), gates 1-2 landed, gate 3 blocked.**

Public-intelligence retrieval (`06_HCI30_PUBLIC_INTELLIGENCE.md`) is
expensive to re-run per subject, creating real pressure to cache/share raw
source material across tenants researching the same public figure — but
`11_SECURITY_PRIVACY_GOVERNANCE.md` explicitly forbids a cross-tenant
reputation database. Left unresolved, whichever engineer built Wave 6 first
would have decided this by accident (`HCI30_RESEARCH_REVIEW/07_SECURITY_
PRIVACY_REVIEW.md` SEC-14, `Requires human decision: YES`).

ADR-0026 (ACCEPTED 2026-09-02) decided **Option A over the reviewer's own
recommended Option B**: `Claim`, `Source`, and `SourceSnapshot` are
tenant-scoped records, never shared or deduplicated at the record level —
rejecting a shared raw-source cache specifically because it would exempt a
table from ADR-0016's mandatory-RLS invariant by construction, and cannot
cleanly host ADR-0014's correction/deletion lineage (a `DataSubjectRequest`-
triggered erasure on a record one tenant references but does not own either
destroys another paying tenant's evidence base, or the erasure request
cannot actually erase the content — only that tenant's link to it, a
materially weaker claim than "deleted"). Storage duplication when multiple
tenants research the same public figure is an accepted cost; a future
content-addressed byte-dedup layer (bytes only, no `tenant_id`, no
claim/assessment interpretation) may recover some of that cost without
reopening the ownership decision — not pursued, out of scope, unchanged.

Implementation status (`governance/ADR-0026-claim-source-tenant-ownership.md`
§Implementation note, 2026-09-05): gate 1 (schema) and gate 2 (`RLS-CLAIM-
01` write-side + `SOURCE-RLS-01` read-side, real-Docker-verified 102/102
assertions, 37/37 mutations) are **landed**. Gate 3 (`DSR-CLAIM-DELETE-01`)
was recorded as **blocked** in that same note, on the stated grounds that
`subject_records` is unconditionally append-only and "the only decided
erasure mechanism (crypto-shredding) is ADR-0018, still SPECIFIED — RUNTIME
OPEN."

**That grounds-text is now stale, found while writing this file, not
re-verified further here.** `governance/ADR_INDEX.md`'s current ADR-0018 row
shows status `SYNTHETIC GATE VERIFIED (Wave 1 gates 1,2,3,6)` — gate 3
specifically shipped `hci.tombstone_evidence()`, reusing ADR-0017's
effect-based `reject_update_delete()` escape hatch (`0007_wave1_crypto_
shredding_up.sql`, 141/141 assertions + 63/63 mutations, 2026-09-05), which
on its face is exactly the kind of authorized append-only exception ADR-
0026's blocking rationale said did not exist. **Whether this actually
unblocks `DSR-CLAIM-DELETE-01`** (does `tombstone_evidence()` cover
`Claim`/`Source`/`SourceSnapshot` rows specifically, and is there a real
DSR-triggered call path into it) is a genuine re-verification question this
threat-model pass surfaced but did not answer — out of scope for a
documentation-transcription pass, flagged in `TASKS.md` as a follow-up
rather than resolved speculatively here. Gate 4 (byte-dedup) remains out of
scope, unchanged.

## Threat: bulk-export exfiltration by an insider or compromised account

**Status: RESOLVED (ADR-0028), implementation OPEN.**

Not a cross-tenant leak in the RLS sense, but the same blast-radius category
— a legitimate, authenticated export path used to exfiltrate an entire
RESTRICTED dossier at once. V1 treated bulk export only as a
detective, after-the-fact audit alert, which `HCI30_RESEARCH_REVIEW/12_
RED_TEAM_FAILURE_ANALYSIS.md` RT-08 named directly: "an alert firing after
the export has already completed does not prevent same-day silent
exfiltration." ADR-0028 (ACCEPTED 2026-09-02) requires, above a per-
commercial-tier row threshold: step-up re-authentication, a delayed-release
cancellable window, and an immutable pre-release audit event — the
threshold itself is configuration data (one row-count per edition), not
code. No export code exists yet anywhere in `Projects/internal/hci30/`
(confirmed at ADR authorship, 2026-09-02) — this is a decided control
waiting on Wave 3's contract-first API before it can be built.

## What this file does not cover

Investigation-footprint detectability (a different LINDDUN concern —
detectability of HCI's *activity* to the Subject, not cross-tenant data
exposure) — [TM_PUBLIC_INTELLIGENCE.md](TM_PUBLIC_INTELLIGENCE.md).
