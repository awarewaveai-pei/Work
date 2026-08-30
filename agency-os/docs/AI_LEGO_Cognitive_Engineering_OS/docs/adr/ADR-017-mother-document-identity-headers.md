# ADR-017: Mother-document Identity Headers (OQ-1)

Status: PROPOSED — awaiting operator go-ahead
Date: 2026-08-30
Related: OQ-1 (`.ai/research/phase-0/open-questions.yaml:4-11`), ADR-006 (mother-document revision flow), AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md §1

## Context

Execution Contract §1 defines document identity as `Document ID + Version + Hash`, explicitly rejecting filename as the sole identity (`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:78-86`). The Master Plan begins with title and scope only; it has neither a Document ID nor an internal version (`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:1-6`). The Atlas has `版本：1.0`, but no Document ID and its version is not Semantic Versioning (`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1-10`).

This leaves two mandatory companion documents unable to satisfy the identity rule that the Execution Manifest relies on. An external inventory can describe them, but cannot make a document self-identifying when copied, exported, or reviewed outside that inventory.

## Decision Drivers

- Correctness: each canonical document must carry the identity contract it is required to provide.
- 30-year survivability: copied or archived files must retain enough identity information to be matched with immutable history and content hashes.
- Minimum blast radius: correct only the missing metadata; do not rewrite content, filenames, or version lineage.
- Reversibility: each header insertion is an isolated ADR-006 proposal and can be reverted independently.

## Options Considered

| Option | Benefits | Costs / risks |
|---|---|---|
| A. Add identity headers to both documents | Makes each file self-identifying and conforms to EC §1 at the source | Requires two governed mother-document edits |
| B. Keep identity only in `document-inventory.yaml` | No immediate mother-document edit | Copies can detach from the inventory; EC §1 remains unsatisfied in the documents themselves |

## Recommendation

Recommend **Option A**. Add a compact, human-readable identity block near the title of each document, containing a stable Document ID and SemVer `1.0.0`. The execution-time content hash remains an Execution Manifest value as EC §1 requires; it must not be hard-coded into a mutable document header.

The exact header wording and placement are deliberately not edited here. They must be proposed as separate `missing_contract` proposals and approved under ADR-006 before either mother document changes. The identifiers must be checked against the document registry and repository-wide references before drafting those proposals.

## Consequences

- Positive: Master Plan and Atlas can each participate in `Document ID + Version + Hash` identity without an external lookup.
- Positive: `1.0.0` aligns Atlas with EC's internal SemVer rule while preserving the existing v1 major lineage.
- Negative: every future breaking normative change must maintain the header version under the existing EC §1 versioning rules.
- Boundary: this does not create a new hash authority, alter filenames, or replace Git tags / immutable releases.

## Migration / Rollback

Migration consists of two independent ADR-006 proposals: one for the Master Plan header and one for the Atlas header. Each proposal must name its target document, baseline hash, exact diff, verification, and rollback commit.

Rollback is `git revert <applied_commit>` for the affected header proposal. No data migration, runtime migration, or schema migration is involved.

## Evidence

- `.ai/research/phase-0/open-questions.yaml:4-11` — OQ-1 options and recommendation A.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:78-86` — SemVer, immutable-history, manifest, and identity rules.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:1-6` — current Master Plan title area lacks identity metadata.
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1-10` — Atlas has non-SemVer `版本：1.0` and lacks a Document ID.
- `docs/adr/ADR-006-mother-doc-revision-flow-and-repo-layout.md` — mandatory proposal/approval workflow for all mother-document edits.
