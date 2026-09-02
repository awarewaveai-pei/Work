# Cross-model oracle review — HCI-30 Wave 1 synthetic runtime skeleton

Date: 2026-09-02
Reviewer: Claude (Opus 5), acting as the external oracle for Codex-authored work
Scope: `Projects/internal/HCI30/` at commit `4b26e8361`, plus the Wave 1 governance records under `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/`

## Why this artifact exists

Commit `ba5d6002f` recorded:

> `ORACLE_WAIVED`: Claude external review is unavailable until 2026-09-04 because its operator-reported quota is exhausted; independent DB expert and Codex critic reviews were completed.

That waiver was honest and correctly recorded. This artifact closes it: the
review it deferred has now been performed.

## Verdict

The authored work was substantially sound. Composite `(tenant_id, id)` foreign
keys, `FORCE ROW LEVEL SECURITY`, `NOBYPASSRLS` roles, an unexposed
`app_tenant_bindings` mapping, and a `SECURITY DEFINER` tenant resolver are all
correct choices, and the WORKLOG was honest that the PostgreSQL suite had never
been executed.

One defect was critical, and it is the kind that a passing test run would have
concealed rather than revealed.

## Findings

### F1 (Critical) — four negative tests were structurally incapable of failing

`database/tests/wave1-negative-tests.sql:26,32,35,41` used:

```sql
BEGIN
  <statement that the control should reject>;
  RAISE EXCEPTION 'expected ... rejection';   -- the assertion
EXCEPTION WHEN raise_exception THEN NULL;
END;
```

A bare `RAISE EXCEPTION` is SQLSTATE `P0001` (`raise_exception`). The trigger's
rejection is also `P0001`. The single handler therefore caught the success path
and the assertion-failure path identically, so the assertion could never
propagate. Affected controls: tenant authorization, DSR lifecycle, append-only
ledger, identity confirmation — i.e. precisely the HD-03/HD-04 gates the ADRs
cite as implemented.

Two assertions in the same file were written correctly
(`:12` `WHEN insufficient_privilege`, `:19` `WHEN check_violation`), so correct
and vacuous forms coexisted in one file, which is why review by reading did not
catch it.

**Demonstrated, not argued.** Running the original suite against the original
schema with the authorization, DSR-lifecycle, append-only, and
identity-confirmation triggers dropped produced **exit code 0 (PASS)**.

### F2 (Major) — MATCH_CONFIRMED could be orphaned

`require_identity_verification()` guarded only `identity_candidates`, while
`identity_verifications` carried `DELETE`. Sequence: add HUMAN evidence, promote
to `MATCH_CONFIRMED`, delete the evidence. The confirmed identity then had no
supporting evidence. The invariant was guarded on one side of a two-sided
relationship.

### F3 (Major) — append-only was single-layer, contrary to the approved spec

The migration granted `UPDATE, DELETE` on all twelve tables including the two
append-only ledgers, relying on triggers alone.
`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md:130` explicitly requires
`REVOKE UPDATE, DELETE` **plus** a trigger, and states the reason: a
superuser/owner connection bypasses grants.

### F4 (Minor) — typed reference did not constrain type

`data_subject_request_targets.target_kind` was unconstrained against
`subject_records.kind`, so an `EVIDENCE` target could reference a
`TRUST_DOMAIN` row.

### F5 (Minor) — runner could attribute a failure to the wrong step

`scripts/test-wave1-local.ps1` checked `$LASTEXITCODE` only after the final
`psql` call.

### F6 (Minor, pre-existing, discovered by execution) — runner could not run on this host

`Set-Content -Encoding utf8NoBOM` is PowerShell 7+ only; this host runs Windows
PowerShell 5.1. Docker being unavailable had masked a second, independent
blocker.

## Dispositions

| ID | Disposition | Invariant closed |
|---|---|---|
| F1 | FIXED | Assertion outcomes are recorded as data, never raised, so no assertion can be swallowed by the handler for the condition under test. Domain rules now carry semantic SQLSTATEs (`H1001`–`H1005`) instead of sharing `P0001`. An assertion-count check rejects silently skipped tests. |
| F2 | FIXED | Cross-row invariants are guarded on both sides; `identity_verifications` now rejects removing or downgrading the last qualifying evidence. |
| F3 | FIXED | Append-only membership is one declarative list that applies grant layer and trigger layer together; adding a table gets both automatically. |
| F4 | FIXED | Composite FK `(tenant_id, target_id, target_kind)` makes a kind mismatch unrepresentable. |
| F5 | FIXED | Per-step failure helper; every step can fail the run on its own. |
| F6 | FIXED | Env file written as explicit BOM-less UTF-8 bytes, removing the host-version dependency. |

## Second review round (critic subagent, adversarial, with executed PoCs)

The first round of fixes was then submitted to an independent `critic` review
that ran its own PoCs against a throwaway PostgreSQL 15.8 container. It found one
CRITICAL issue the first round missed, plus defects in the new code, and made one
observation that changed how the remaining fixes were designed.

### F7 (Critical) — `identity_candidates.person_id` was mutable after MATCH_CONFIRMED

Confirming a match binds specific evidence to a specific person, but nothing
pinned `person_id` afterwards and the table carried `UPDATE`. An unprivileged
tenant role could therefore reach the exact end state the HD-04 gate exists to
prevent: a person marked `MATCH_CONFIRMED` while every supporting evidence row
was gathered about someone else. No trigger fired, because the candidate id
never changed. In this product domain that is misattribution of a real person.

### F8 (Major) — TRUNCATE walked past both append-only layers

Row-level triggers do not fire for `TRUNCATE`, and `TRUNCATE` is a separate
privilege. A break-glass owner session could empty a compliance ledger in one
statement with neither the grant layer nor the trigger layer reacting — and the
trigger layer exists specifically for connections whose privileges bypass grants.

### F9 (Major) — ledger `created_at` was caller-supplied

`GRANT INSERT` on the whole table let the audited party choose its own
timestamps, so the "immutable event history" proved no ordering.

### F10 (Major) — DSR guarded only the `status` column

The trigger was `BEFORE INSERT OR UPDATE OF status`, so every other column was
an unguarded write path: a resolved ACCESS request could be rewritten into a
DELETION request, and requests could be deleted outright.

### F11 (Minor) — `evidence_ref IS NOT NULL` was satisfied by an empty string

A `HUMAN` verification with `evidence_ref = ''` opened the HD-04 gate on nothing.

### F12–F15 (defects in the first round's own new code)

- `hci_test.finish()` counted rows, not distinct test ids, so duplicating one
  assertion while deleting another kept the total at the expected number.
- `hci_test.results` took whole-table `INSERT`, letting a tenant role forge the
  `actor` column and backdate `recorded_at` — on the one surface whose subject
  is isolation.
- `mutation-check-wave1.ps1`'s `Invoke-SqlFile` returned 0 for a missing file
  (EAP relaxed → non-terminating `Get-Content` → psql reads empty stdin → exit
  0), so a renamed test file would have reported a green baseline having run
  nothing.
- Both runners piped SQL to psql through a PowerShell 5.1 native pipe, which is
  ASCII-lossy: a non-ASCII byte would be silently replaced with `?` and psql
  would still exit 0. Latent today (all files ASCII), and the same trap class
  this repo already tracks.

### The observation that mattered most

The critic pointed out that F7, F9, F10 and F11 are not four bugs but one
undefined invariant: **which fields are immutable in which state had never been
written down**, so each trigger guarded only the column it happened to see. It
explicitly warned that fixing them pointwise would leave them protecting each
other. That is the repo's own anti-patch criterion, applied to my work.

So the field mutability matrix was written first, as a table in the migration
header, and the triggers and grants were derived from it. `tenant_id` immutability
became a generic trigger applied from the same declarative list that drives RLS
and append-only, rather than a rule remembered per table. A catalog drift check
now fails the migration if a new table is added without being classified.

### Confirmed clean by the critic (executed, not skipped)

The `H1TST` sentinel's subtransaction semantics; the both-sided identity guard
against multi-row statements; composite-FK cross-tenant probing (no oracle — RLS
`WITH CHECK` answers identically for an existing foreign tenant and a nonexistent
one); PowerShell function-scoped `$ErrorActionPreference` and `$LASTEXITCODE`
after a pipeline; that the nine original mutations were genuinely killed; and
that the `docker context inspect` guard does block a `DOCKER_HOST` override.

### Deferred — needs an architecture decision, not a patch

`hci.current_tenant_id()` resolves tenancy from the `role` GUC, which `SET ROLE`
changes freely, and both tenant roles are `NOLOGIN` — which implies a shared
login role that can `SET ROLE` into either tenant. One missed `RESET ROLE`, one
pooler connection returned without `DISCARD ALL`, or one SQL injection then moves
the whole session to another tenant with RLS following along. The suite cannot
meaningfully assert against this today because it is itself a superuser session
doing `SET ROLE`.

This is a tenancy-principal design choice (per-tenant LOGIN roles vs. a pooled
login role with a signed `SET LOCAL app.tenant_id` setter), not something to
decide inside a test fix. **Recorded as an open decision, not silently changed.**

## Verification

- `scripts/test-wave1-local.ps1` — green against real PostgreSQL 15.8 in Docker:
  38 assertions recorded, 0 failed; includes down/up reversibility over a
  populated schema.
- `scripts/mutation-check-wave1.ps1` (new) — 9 mutations, all killed. Each
  deletes one control and requires the suite to go red on the specific
  assertions covering it.

The mutation check is the durable part. Repairing six defects does not stop the
seventh from being written the same way; a gate that fails when a control is
removed does.

## Residual risk / explicitly not claimed

- Synthetic scope only. No real-person data, production deployment, portal
  integration, or legal/market claim is supported by this evidence.
- Portal-adapter tests (`TENANT-ADAPTER-NEG-01..03`) remain out of scope.
- `HD-06`–`HD-10`, `HD-20`, `HD-21` remain open; the real-data admission gate
  stays closed.
- The mutation set covers the controls Wave 1 implements. It is not a proof that
  no other property is untested; new controls must add mutations.
- A `db-expert` subagent review terminated on a session rate limit (HTTP 429).
  A `critic` subagent review did complete and is folded in above as F7-F15; its
  findings were verified against the schema rather than accepted on assertion.
  A dedicated DB-expert pass remains worthwhile and is not claimed here.
- The tenancy-principal question above is open and is the single most important
  unresolved item in this package.
