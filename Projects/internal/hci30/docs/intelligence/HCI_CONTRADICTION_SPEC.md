# HCI Contradiction Spec — status: honestly OPEN, not written

Status: **deliberately not written**, per `21_HCI_TOP_TIER_GAP_ANALYSIS.md`
P0-04's own path listing this file and `HCI_TRUST_DOMAIN_SPEC.md`'s own
out-of-scope entry ("Contradiction between evidence inputs (two sources
disagreeing about the same dimension) — a separate P0-04 sibling from
evidence quality, not folded into it"). This file exists so the promised
path resolves to something, and so the exact blocking question is
recorded precisely.

## What this file is supposed to answer

Two sources bearing on the same Assessment Dimension can assert
incompatible facts (not merely different qualitative bands, which
`HCI_CONFIDENCE_SPEC.md`'s `disagreement` flag already handles — an actual
factual contradiction, e.g. one source claims a payment was made on time
and another claims it was 60 days late). `06_HCI30_PUBLIC_INTELLIGENCE.md:38`
names "Contradiction Detection" as a pipeline stage; `:279` and
`19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:11,80,86` all list
"Contradictions" as a required report/UI section. None of these define
what a contradiction record *is*, how one is detected, or how it changes a
dimension's resulting value or confidence.

## Why this is not answered here

**The current evidence shape has no place to put the information a
contradiction check needs.** The five functions in `packages/intelligence/`
that consume `evidence_refs` — `normalizeDimensionScore`
(`dimension-score.mjs`), `combineMethodFindings`, `rollupTrustDomains`,
`detectSeverityFloor`, `classifyEvidenceQuality` — all share one input
primitive via `packages/intelligence/evidence-refs.mjs`'s
`normalizeEvidenceRefs`: an array of **opaque reference strings**,
deliberately carrying no claim value, no timestamp, no source identity.
(`band-scale.mjs`, `assessment-dimensions.mjs`, and
`bias-check-gate.mjs` do not touch `evidence_refs` at all and are not part
of this blast radius.) That shape is sufficient for counting distinct
sources (`classifyEvidenceQuality`) but structurally cannot answer "do
these two refs assert incompatible facts" — there is no fact attached to a
ref to compare. Detecting a contradiction requires, at minimum, the actual
asserted value behind each evidence reference (a `Claim`'s content, in the
corpus's own terminology — `Claim` is entity #8 in
`07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`'s core-entities list,
`:17`) and some notion of semantic or structural incompatibility between
two such values — neither of which exists in this package's shared types
today.

**This is not a small addition — it is a new data-model layer, not a
scoring-formula extension.** Every P0-04 spec closed so far extended an
*aggregation rule* over an *already-existing* shape (14 dimension values,
N method findings, evidence-ref counts). Contradiction detection would
require inventing the Claim-content shape itself (what does "the asserted
value" look like — a typed value? free text compared how?) before any
aggregation rule could even be written. Real source-provenance schema
already exists at the database layer for a related purpose
(`hci.source_relationships`/`hci.source_snapshots`,
`database/migrations/0004_wave1_source_provenance_up.sql`, per
`HCI_TRUST_DOMAIN_SPEC.md`'s own §Explicitly out of scope citation of it
for source-independence) — but that graph records *relationships between
sources* (cites/derived_from/original_source), not *the content of what
each source claims*, so it does not by itself supply what contradiction
detection needs either.

**Inventing this speculatively, without a real consumer forcing the
question, would itself be the "補丁式修法" (patch, not root-cause fix) this
codebase's own engineering discipline forbids** — a hastily-shaped
`ClaimValue` type built to make *a* contradiction check pass, rather than
one designed against the real downstream needs of Public Intelligence
report generation (`06_HCI30_PUBLIC_INTELLIGENCE.md`'s own pipeline, which
is where "Contradiction Detection" actually lives) and the five
already-shipped `evidence_refs`-consuming functions named above, none of
which asked for this shape and would need re-review if it were forced in
now.

## What would unblock this

A concrete decision on the Claim-content data model: what does an
individual evidence-linked assertion actually store (typed value?
structured predicate? free text with a comparison method?), made in
service of a real consumer (most plausibly Public Intelligence report
generation, `06_HCI30_PUBLIC_INTELLIGENCE.md`, which is the one place
"Contradiction Detection" is already a named pipeline stage) rather than
this spec file in isolation. Once that shape exists, this file can define
the aggregation rule (how a detected contradiction affects a dimension's
value/confidence/evidence-quality classification) the same way the four
closed P0-04 specs did for their own inputs. Tracked in `TASKS.md`; not
attempted here without that decision.
