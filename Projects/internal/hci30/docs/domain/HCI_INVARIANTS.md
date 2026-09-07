# HCI Domain Invariants

P0-01. Cross-cutting rules that hold across every table, transcribed from
what the schema already enforces (`database/migrations/0001`-`0011`) plus
`database/tests/wave1-negative-tests.sql`'s own assertions, which are the
executable proof each rule holds. Expected result (`21_HCI_TOP_TIER_GAP_ANALYSIS.md`
P0-01): no developer or AI can invent a different meaning for these rules —
if code needs a rule not listed here, that is a gap to close in this file
and a migration, not to assume silently.

## Tenant isolation

Every tenant-owned table: `tenant_id NOT NULL REFERENCES hci.tenants(id)`,
RLS `ENABLE` + `FORCE`, policy `USING/WITH CHECK (tenant_id = hci.current_tenant_id())`.
`hci.current_tenant_id()` resolves the acting Postgres role (`current_setting('role')`
or `session_user`) against `hci.app_tenant_bindings` — a table the application
roles hold **zero grant** on, so a tenant can never read or rewrite its own
binding. `tenant_id` is immutable on every tenant-owned table
(`hci.reject_tenant_change()`, H1006) — the tenant boundary itself must never
move.

Two tables are the deliberate exceptions, both verified safe by absence of
app-role access rather than by RLS: `hci.app_tenant_bindings` and
`hci.data_encryption_keys` hold no grant of any kind to `hci_app_test_a/b` —
see `P0-09` (`21_HCI_TOP_TIER_GAP_ANALYSIS.md`) for the catalog-driven gate
that verifies this class holds for every current and future table.
`hci.tenants` itself is scoped by `id`, not `tenant_id` (it *is* the tenant
registry) — its own `tenant_registry_isolation` policy compares `id`.

## Append-only / no-delete / no-truncate

Three mutability classes, declared once in 0001 (`all_tables`/`append_only`/
`no_delete` arrays) and replicated by hand for every table added afterward
(0002 `cases`, 0004 `source_snapshots`/`source_relationships`, 0005
`decisions`, 0008 `decision_claims`):

| Class | Grant layer | Trigger layer (defends a bypassed grant, e.g. table owner) |
|---|---|---|
| append-only | `SELECT, INSERT` only | `reject_update_delete()` on UPDATE/DELETE/TRUNCATE |
| no-delete | `SELECT, INSERT, UPDATE` | `reject_update_delete()` on DELETE/TRUNCATE |
| full CRUD | all four | `reject_tenant_change()` on UPDATE (tenant_id only) |

The trigger layer exists specifically for a connection whose privileges
bypass grants (table owner, break-glass superuser) — the grant layer alone
does not stop that. `reject_update_delete()` is one shared function reused
across every append-only table; each new "this column may move NULL→NOT
NULL, nothing else, by a role that is a member of the owner" exception
(`system_superseded_at` 0005, `tombstoned_at` 0007, `reaudit_required` 0008)
is a new branch in that same function, not a new mechanism — see
§Effect-based escape hatch below for why.

Server-assigned timestamp columns (`created_at`, `retrieved_at`,
`system_recorded_at`) are withheld from **both** INSERT and UPDATE grants —
"a ledger whose timestamps the audited party can choose proves no ordering
at all" (0001's own stated rule, re-applied at every table that added such a
column later: 0004, 0006, 0008).

## Effect-based escape hatch (not a session flag, not a temp table)

`hci.reject_update_delete()` authorizes an otherwise-forbidden UPDATE by
**what it does**, computed from the statement's own OLD/NEW rows plus the
executing role — never from a planted, checkable marker. For each
recognized column (`system_superseded_at`, `tombstoned_at`,
`reaudit_required`): that specific column moved in the one legal direction,
every other column is byte-identical (`to_jsonb(OLD) - 'col' = to_jsonb(NEW) - 'col'`),
and `current_user` is a member of the table's owning role. Two alternative
designs (a session GUC flag; a `pg_temp` lock table) were built, real-Docker-tested,
and **rejected** before shipping — both were forgeable by any role holding
UPDATE grant, since PostgreSQL lets any role set an arbitrary custom GUC or
create its own `pg_temp` table by default. See `0005_wave1_bitemporal_history_up.sql`'s
header for the full three-design comparison before extending this pattern —
do not reintroduce either rejected shape.

## Bitemporal history (ADR-0017)

Scoped to exactly `hci.subject_records` (EVIDENCE/CLAIM/ASSESSMENT
semantically) and `hci.decisions` — not universal, per the ADR's own scoping
decision. `valid_from`/`valid_to` = the application's claim about real-world
applicability (app-writable). `system_recorded_at`/`system_superseded_at` =
the ledger's own clock (`clock_timestamp()`, not `now()` — a long transaction
must not be able to backdate its row relative to an already-committed one;
`now()` is correct everywhere else in this schema for a plain single-row
insertion timestamp, e.g. `created_at`). A "correction" is always a new
superseding row, never an UPDATE (the table is append-only) —
`hci.mark_superseded()` (SECURITY DEFINER, uses the effect-based escape
hatch above) sets the predecessor's `system_superseded_at` to the
successor's own `system_recorded_at`. No forks: `UNIQUE(tenant_id, supersedes_id)`
rejects a second row superseding an already-superseded one before the
trigger even runs (H1008 is defense-in-depth for if that UNIQUE were ever
weakened, not the primary path). `corrected_reason` is required exactly when
`supersedes_id` is set, non-blank. Canonical reads: `hci.*_current` views
(`system_superseded_at IS NULL`) and `hci.*_as_of(timestamptz)` functions —
see `HCI_ENTITY_DICTIONARY.md` for the sync-both-or-neither rule. TRUST_DOMAIN
rows physically carry these columns but `supersedes_id` is CHECK-forbidden
on them (0011) — the mechanism exists on the table but is not yet meaningful
for a kind with no value to correct.

## Kind-scoped columns on `hci.subject_records`

One physical table, four logical kinds. Every kind-specific column follows
the same `scoped`/`required` CHECK-pair idiom — `CHECK (kind = 'X' OR col IS NULL)`
paired with `CHECK (kind <> 'X' OR col IS NOT NULL)` — so a column can never
leak onto a kind it does not belong to, and can never be silently absent on
a kind that requires it:

| Column(s) | Required for | Forbidden for |
|---|---|---|
| `encryption_key_ref` | EVIDENCE, CLAIM | ASSESSMENT, TRUST_DOMAIN |
| `author_class` | EVIDENCE, CLAIM, ASSESSMENT | TRUST_DOMAIN |
| `claim_state`, `human_spotcheck_status`, `reaudit_required` | CLAIM | EVIDENCE, ASSESSMENT, TRUST_DOMAIN |
| `spotcheck_principal_id` | CLAIM, and only when `human_spotcheck_status='APPROVED'` | non-CLAIM |
| `epistemic_label` | CLAIM | non-CLAIM |
| `domain`, `evidence_ref_id`, `evidence_ref_kind` | TRUST_DOMAIN | EVIDENCE, CLAIM, ASSESSMENT |
| `supersedes_id`/`corrected_reason` | any kind may supersede | forbidden specifically for TRUST_DOMAIN |

Adding a new kind-scoped column without both halves of the pair is exactly
the bug class this schema has fixed multiple times (a column "required" only
by application convention, not by the database) — never add one half alone.

## Author-class policy (ADR-0019 gate 2)

Each `kind` (and `hci.decisions`) has a fixed allow-list of legal
`author_class` values, checked at INSERT (`enforce_field_author_class()`,
H1013):

| Kind / table | Allowed `author_class` |
|---|---|
| EVIDENCE | `DETERMINISTIC` only |
| CLAIM | `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED`, `HUMAN_ONLY` |
| ASSESSMENT | `PROBABILISTIC`, `LLM_ASSISTED_HUMAN_REVIEW_REQUIRED`, `HUMAN_ONLY` |
| `hci.decisions` | `HUMAN_ONLY` only |

`kind` is the Wave-1 proxy for "field/transition" — no finer-grained
field-level tracking exists yet (real payload columns are Wave 4).

## Decision-Claim reaudit gate (ADR-0019 gate 4)

`hci.enforce_decision_reaudit_gate()` (BEFORE INSERT on `decision_claims`,
SECURITY DEFINER, `SELECT ... FOR SHARE` to close a concurrent-elevation
race): a Claim may only be linked to a Decision once admitted as an approved
Assessment Candidate (`claim_state='ASSESSMENT_CANDIDATE'`,
`human_spotcheck_status='APPROVED'`, else H1016); and a Claim flagged
`reaudit_required=true` may not be linked to a `PROCEED`/
`PROCEED_WITH_CONTROLS`/`EXIT` decision (H1015). The reverse order is
guarded too: `hci.flag_claims_on_risk_elevation()` (AFTER UPDATE on
`hci.cases`, fires on any `risk_tier` increase) refuses the elevation itself
(H1017) if any linked Claim is already cited by a standing PROCEED-class
decision — an already-decided outcome must never be silently left standing
on a Claim that a tier change would otherwise flag. Superseded/tombstoned
Claims are excluded from the flag (closed ledger entries, per ADR-0017).

## Epistemic promotion redline (ADR-0019 gate 5 / ADR-0013)

CLAIM-only. `epistemic_label` is one of the shared kernel's 11 values
(verbatim, provisional pending ADR-0013 gate 3 — do not add HCI-only
values). A CLAIM born without a label defaults `UNKNOWN`; a superseding row
without an explicit label inherits its predecessor's label **and verifier**
together (never silently demotes). Promoting `UNKNOWN`/`HYPOTHESIS` →
`SOURCE_FACT` requires `epistemic_verifier_principal_id` (H1019) — and
*every* `SOURCE_FACT` row requires a verifier regardless of history
(`subject_records_source_fact_verified`), closing the "born already in the
final state" bypass the same bug class hit twice in migration 0008.

## Identity confirmation gate (HD-04)

`match_state='MATCH_CONFIRMED'` requires at least one `DETERMINISTIC` or
`HUMAN` verification with non-blank `evidence_ref` (H1004) — guarded on
**both** sides: asserting the state without the evidence (identity_candidates
trigger) and removing the last such evidence while the state stands
(identity_verifications trigger, H1005). `person_id` on a confirmed
candidate is frozen (H1007) — repointing requires an explicit downgrade to
`CANDIDATE` first.

## Case ownership binding (ADR-0020 gate 3-4)

Every `research_workflows`/`subject_records` row has exactly one
`case_id` (`NOT NULL`, immutable once set), and may only be admitted while
that Case resolves in-tenant with `status IN (OPEN,ACTIVE)` (H1011) — a
`case_id` that does not resolve in this row's own tenant (NULL, absent,
cross-tenant) is *not* this trigger's concern; it lets the real error (NOT
NULL / FK / RLS) fire instead of masking it with the wrong code (see
`0002_wave1_case_aggregate_up.sql`'s header for the two earlier, real-Docker-refuted
attempts at this exact trigger).

## Regulatory market scope (ADR-0012)

`hci.tenants.jurisdiction` denies EU/EEA/UK/EFTA codes (plain CHECK,
normalized `upper(btrim(...))`). `hci.cases.purpose` is a 5-value allow-list
(`vendor_risk_assessment`, `fraud_investigation`, `personal_safety`,
`journalism_research`, `general_due_diligence`) — exactly ADR-0012's named
values, not extended. No defense-in-depth trigger exists at
`research_workflows` INSERT (gate 3) — deliberately: a CHECK constraint
binds every write path including the table owner, so there is no bypass
left for a trigger to catch once gates 1-2 hold (see `0003`'s header,
"Gate 3 disposition", for the full real-Docker argument).

## No Universal Human Trust Score (ADR-0004)

TrustDomain data is always domain-scoped (`(tenant_id, person_id, domain)`
partial-unique — a real vector, not one slot) and evidence-linked
(`evidence_ref_id`/`evidence_ref_kind`, pinned to the *same Person*, not
merely the same tenant). No column matching
`overall_score|composite_trust|aggregate_trust|universal_trust|^trust_score$`
may exist on any table without an unconditionally-NOT-NULL `domain` column —
enforced by CI lint (`scripts/check-no-universal-trust-column.ps1`) *and* an
independent live-catalog assertion (`TRUST-NO-AGGREGATE-COLUMN-01`), so a
lint-text change alone cannot silently reopen this. See P0-04's specs
(`docs/intelligence/`) for the roll-up-formula layer built on top of this
invariant, not part of the schema itself.

## RLS enforcement completeness (P0-09)

Structural, schema-wide, catalog-driven (not one assertion per table): every
table in the `hci` schema (including partitioned tables) that (a) has a
`tenant_id` column and (b) any grant of any kind to an application role must
have RLS both enabled and forced, with at least one policy shaped
`current_tenant_id()` in both `USING` and `WITH CHECK`, covering all
commands and roles (`RLS-COMPLETENESS-01`/`02`,
`database/tests/wave1-negative-tests.sql`). This is a safety net for a
*future* table someone forgets to wire — it does not replace a table's own
functional `RLS-LEAK-NN` test (real query, real cross-tenant probe), which
remains required to prove a policy's *logic* is correct, not merely present.

## SECURITY DEFINER functions fail closed under RLS (ADR-0019 hardening, M4)

Every SECURITY DEFINER function that reads/writes an RLS-forced table
(`current_tenant_id`, `mark_superseded`, `tombstone_evidence`,
`flag_claims_on_risk_elevation`, `enforce_decision_reaudit_gate`) is pinned
`SET row_security = off`. Reason: SECURITY DEFINER bypasses grants, not RLS
— on a non-superuser table owner (the real production shape; the test
container's owner being a superuser is what let this go unnoticed), a
definer's own `current_tenant_id()` lookup would resolve against the
owner's missing binding, the policy predicate would evaluate NULL, and the
function would silently match zero rows: the elevation cascade flags
nothing, the link gate's SELECT returns nothing, `mark_superseded()` touches
nothing — every one of these fails **open**, without an error. `row_security = off`
inverts that: any statement that would have had a policy applied now raises
an error instead of running filtered. Applied to the whole class, not only
the functions where the review happened to look.

## Error codes

`H1xxx` codes are a stable, semantic SQLSTATE registry (class `H1`, unused
by PostgreSQL) so application code can distinguish rejection reasons without
matching English text, and so a negative test's own assertion-failure code
can never collide with the control's own rejection code (both being plain
`RAISE EXCEPTION` = `P0001` is exactly the bug class this schema's own first
version had). SSOT: `database/ERROR_CODE_REGISTRY.md` — allocate new codes
there, never by computing "next free" from a migration file's own header
comment (the practice that caused two real collisions, H1008 and H1009,
each independently discovered and renumbered around).
