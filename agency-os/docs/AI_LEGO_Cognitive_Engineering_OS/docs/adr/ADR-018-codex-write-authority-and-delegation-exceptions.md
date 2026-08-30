# ADR-018: Codex Write Authority and Delegation Exceptions (OQ-4)

Status: ACCEPTED（2026-08-30，操作者於對話中明示核准：「核准並 codex-review」）
Date: 2026-08-30
Related: OQ-4 (`.ai/research/phase-0/open-questions.yaml:24-31`), `agency-os/AGENTS.md` §跨模型 oracle, ADR-006

## Context

The Phase-0 directive assigns Codex schema implementation, tests, and migrations. Repository governance instead separates responsibility at the write boundary: any write under `D:\Work` belongs to Claude, while Codex performs large reads, cross-file analysis, and adversarial review (`agency-os/AGENTS.md:105-118`). The reason is structural rather than preferential: the required enforcement hooks run in Claude Code and do not run for Codex (`agency-os/AGENTS.md:120-122`).

This creates a real governance conflict. Giving Codex unrestricted repository write authority would bypass the audit and verification chain. Ignoring the directive would discard useful independent analysis and prototype capacity.

The operator's 2026-08-30 delegation of this proposal-application/ADR task to Codex is an explicit, one-time exception due to Claude context-budget exhaustion. It does not change the general policy. The handoff substitutes a bounded checklist: exact proposal process, one proposal per commit, golden tests, explicit cross-document citations, and a prohibition on changing the baseline-hash snapshot.

## Decision Drivers

- Preserve the repository's existing mechanical safety gates and evidence chain.
- Retain independent-model review, research, and prototype capacity.
- Keep the exception mechanism explicit, narrowly scoped, auditable, and revocable.
- Avoid creating a second writable governance surface that must remain equivalent for decades.

## Options Considered

| Option | Benefits | Costs / risks |
|---|---|---|
| A. Codex proposes; Claude verifies and writes; `D:\tmp` prototypes remain Codex-owned | Preserves current gates and division of duties | Adds a handoff step for repository changes |
| B. Create a Codex writable sandbox with equivalent gates | Can reduce handoff latency | Creates a second governance and hook implementation that can drift or fail-open differently |
| C. Allow unrestricted Codex writes to `D:\Work` | Fastest local path | Directly bypasses the stated structural protection |

## Recommendation

Recommend **Option A** as the default operating model. Codex produces evidence-backed findings, patch proposals, and disposable external-to-repository prototypes; Claude verifies findings and performs repository writes through its existing safeguards. Production deployment, database migration, and credential changes remain non-delegable and require Claude plus explicit operator authorization.

An exception is valid only when the operator explicitly delegates all of the following: scope, files or bounded artifact set, verification steps, rollback path, and expiry or completion condition. The exception must be recorded in the resulting handoff, ADR, or work log before the first write. It does not silently establish a precedent.

## Consequences

- Positive: the repository keeps one mechanical write-control plane rather than two divergent copies.
- Positive: Codex remains useful where independent inspection adds the most value.
- Negative: normal repository changes retain an intentional handoff cost.
- Negative: a future need for Codex repository writes requires explicit exception evidence, not implication from this ADR.
- Boundary: this ADR does not authorize a production deployment, DB migration, credential operation, or any unscoped Codex write.

## Migration / Rollback

No runtime or data migration is required. Adopt the policy by updating future task briefs and handoffs to state the writer, verifier, artifact boundary, and exception status.

Rollback is a governance reversal by a future operator-approved ADR. Until then, an active exception ends at its documented completion condition; reverting an artifact written under an exception follows that artifact's normal Git rollback path.

## Evidence

- `.ai/research/phase-0/open-questions.yaml:24-31` — OQ-4 conflict and recommended Option A.
- `agency-os/AGENTS.md:109-120` — read/write boundary, Codex role, and non-delegable operations.
- `agency-os/AGENTS.md:120-122` — Claude-Code-only hook rationale and Codex's missing enforcement surface.
- `.ai/CODEX_HANDOFF_2026-08-30.md:1-14, 61-129` — explicit same-day delegation exception and compensating controls for this bounded task.
- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` — governed, reversible proposal process for mother-document edits.
