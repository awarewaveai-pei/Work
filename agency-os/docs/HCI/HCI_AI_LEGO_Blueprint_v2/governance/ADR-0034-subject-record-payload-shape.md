# ADR-0034 — Evidence/Claim/Assessment/TrustDomain Payload Shape

Status: **ACCEPTED**
Date: 2026-09-08
Decision authority: Operator-delegated (standing full delegation this session)
Scope: HCI-30 Wave 1 schema only. Does not authorize real-person data processing or production deployment.

## Context

`hci.subject_records` (`migrations/0001_wave1_synthetic_up.sql:125-135`) is a bare polymorphic anchor: `id, tenant_id, person_id, subject_type, subject_id, kind`. It carries no content. P0-03 (`security/evidence-integrity/HCI_EVIDENCE_TAMPER_EVIDENCE_SPEC.md`) already named this precisely: "no real Evidence/Claim payload column exists in this schema yet... the payload-column shape (free text, structured, external object reference) is an undischarged product decision." Every downstream consumer already built against an assumed shape without a real column to back it: `packages/intelligence/*.mjs` operate on `evidence_refs: string[]` (opaque references) and in-memory dimension/score objects; `HCI_CONTRADICTION_SPEC.md` names the same gap as its own blocker ("no Claim-content field... a missing data-model layer, not a missing formula"). This blocks any real create/evaluate flow: `hci.decisions.rationale` (migration 0005) is real free text, but nothing upstream of it has content to cite.

## Decision

Add one generic `payload jsonb NOT NULL DEFAULT '{}'::jsonb` column to `hci.subject_records`. Shape per `kind` is an application-layer convention, not a DB-level CHECK, for now:

- `EVIDENCE`: `{content: string, source_id?: uuid}`
- `CLAIM`: `{content: string, evidence_refs: uuid[]}`
- `ASSESSMENT`: `{dimension: string, value: string, evidence_refs: uuid[]}` (matches `packages/intelligence/dimension-score.mjs`'s existing validated shape)
- `TRUST_DOMAIN`: `{domain: string, band: string, dimension_disagreement?: boolean}` (matches `HCI_TRUST_DOMAIN_SPEC.md`'s already-decided roll-up output)

**Why JSONB over one column per kind or a separate table per kind**: the four kinds already share one physical table by deliberate design (`ADR-0011` gate 1, `subject_records` polymorphism) precisely so tenant isolation, append-only enforcement, and RLS are written and tested once, not four times. A generic `jsonb` payload keeps that property. Four kind-specific NOT NULL text/jsonb columns (one relevant per row, three always null) would work equally but reads worse and needs a CHECK per kind anyway to keep the "only your kind's column is filled" invariant, which is no simpler than validating one `jsonb` column's shape at the application layer.

**Why application-layer shape validation, not a DB CHECK per kind now**: `packages/contracts/validate-request.mjs` and the dimension-score/evidence-refs validators already exist and already run before any DB write in every path P0-04's specs describe — duplicating that as a Postgres CHECK (`jsonb` shape constraints are possible but verbose and hard to evolve) buys little for a Wave 1 skeleton with one call site. Revisit if a second, independent write path appears that could bypass the Node-layer validators.

**Why not an external object reference (e.g. S3 pointer)**: no object storage exists in the verified infrastructure baseline (`12_DEPLOYMENT_API_AND_MULTI_TENANCY.md`), and P0-08's `TM_FILE_INGESTION.md` already found zero file-upload feature anywhere in the corpus. Free-form JSONB text is sufficient for Wave 1 synthetic content; revisit if/when a real ingestion pipeline exists.

## Required implementation gates

1. Migration adding the column, tenant-isolation/append-only/RLS unaffected (inherited from the table's existing triggers/policies — no new ones needed). **Landed same day, migration 0012.**
2. Application-layer shape validation per `kind` before insert. **Landed same day**, `packages/contracts/validate-subject-record-payload.mjs`.
3. A negative test proving a malformed payload (missing `content` on an `EVIDENCE` row, missing `evidence_refs` on a `CLAIM` row) is rejected before it reaches the DB. **Deferred** — tracked in `TASKS.md`, not blocking the first real create/evaluate flow this ADR exists to unblock.

## Consequences

Unblocks a real Evidence→Claim→Assessment→TrustDomain→Decision flow for the first time. Does not resolve `HCI_CONTRADICTION_SPEC.md`'s or `HCI_TIME_DECAY_SPEC.md`'s own separately-named blockers (contradiction detection and time-decay still need more than a content field to exist). Does not authorize real-person data.

## Verification and rollback

Migration 0012's own up/down pair is the rollback path (`ALTER TABLE ... DROP COLUMN payload`), reversible with no data-loss risk on synthetic-only data. Verified: see `WORKLOG.md` 2026-09-08 for the real command run and its output.
