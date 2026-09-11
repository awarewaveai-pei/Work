# HCI Rule Engine Spec — deterministic, explainable evidence scoring

Status: **operator-delegated product judgment, not math** (same category as
`HCI_CONFIDENCE_SPEC.md`'s disagreement threshold and `HCI_RISK_SPEC.md`'s
severity floor rank). The rule table below (ids, dimensions, deltas,
keywords) is a **starting policy**, not an empirically derived one — no
labeled dataset justifies these specific weights. Operator may revise any
rule or add new ones without re-deriving the mechanism; each rule is a
one-line table entry, not code.

Path: this is a NEW P0-04 deliverable area (not itself one of
`21_HCI_TOP_TIER_GAP_ANALYSIS.md`'s seven named files) — operator-requested
2026-09-11 ("系統自己讀證據、自己判斷...用程式分析的方式...再統計分析...
還是要有文字說明和分析緣由": the system should read evidence and score it
itself, programmatically — point deltas, statistically aggregated — with a
text explanation for every score, not an opaque LLM judgment). Chosen over
an LLM-based reader specifically because a due-diligence product's own
mission (`04_HCI30_PRODUCT_SPEC.md:7-12`) already forbids marketing itself
as "a guaranteed prediction engine" — a versioned, deterministic keyword
rule table is reproducible (same input always produces the same output,
auditable by a client's own compliance team) in a way an LLM call is not.

## Why this is not the same gap as "no AI reads evidence"

A prior round of this same work session proposed connecting to Cognitive
Engineering OS's Method Atlas modules (`challenge.independent_judge` etc.)
as the fix for "the system doesn't analyze evidence." That was wrong,
corrected before any code was written: those modules validate that an
already-decided judgment is well-formed (has positions, cites criteria) —
they do not read raw text and produce one. This file is the actual fix:
something that reads `EVIDENCE`/`CLAIM` text and produces a first-pass,
fully explainable score, without needing any other system.

## Rule shape

```
{ id, dimension, delta, keywords: string[], rationale }
```

- `dimension` — one of the 14 `ASSESSMENT_DIMENSIONS`
  (`packages/intelligence/assessment-dimensions.mjs`) — never a Trust
  Domain directly, so a rule-engine finding rolls up through the exact same
  `rollupTrustDomains` path a human `ASSESSMENT` does (§Combination below).
- `delta` — a signed integer shift in **band-rank** units
  (`packages/intelligence/band-scale.mjs`'s `BAND_RANK`, 1=VERY_LOW..5=VERY_HIGH),
  applied against a neutral baseline of rank 3 (MODERATE). Negative = risk
  indicator, positive = strength indicator. `-2`/`+2` reserved for a
  severe/strong single indicator (e.g. a data breach, a fraud finding);
  `-1`/`+1` for an ordinary one.
- `keywords` — plain-language substrings (Traditional Chinese and English
  both, case-insensitive), not regular expressions. A future editor adding
  a keyword needs no regex literacy; the match is a literal substring test,
  which is also what makes a match trivially explainable ("your evidence
  contains the string 訴訟").
- `rationale` — one sentence, shown verbatim to the operator next to every
  match. This IS the "文字說明和分析緣由" requirement — not a template the
  UI reconstructs, the actual string a human reads.

Seed table (`packages/intelligence/rule-engine.mjs`'s `RULES`, ~20 entries,
1-3 per dimension, mixed positive/negative) covers common due-diligence
indicators: fraud/inconsistency, contract breach/bankruptcy/on-time
delivery, quality defects/certifications, unresponsiveness, unauthorized
access, unilateral term changes, refusal to engage/proactive resolution,
coercion, conflict of interest, blame-shifting, data breaches/regulatory
fines/security certifications, process improvement, executive
turnover/ownership disputes, last-minute changes. Each is independently
revisable — see the module's own header for the full list with rationale.

## Matching

`matchRules(text)` scans one string against every rule's `keywords`
(case-insensitive substring), returning every rule that matched (a text
can match multiple rules, even multiple rules on the same dimension — e.g.
one EVIDENCE citing both a data breach AND a regulatory fine matches two
`INFORMATION_GOVERNANCE` rules). Pure function, no I/O, no model calls.

## Aggregation ("再統計分析")

Given every `EVIDENCE`/`CLAIM` record's matched hits, grouped by dimension:
sum every matching rule's `delta` for that dimension (across every record
that matched, not just one), add to baseline rank 3, clamp to `[1,5]`, map
back to a band name via `RANK_BAND`. This is genuinely "statistical" in the
literal sense the operator asked for (a sum over independent signals) while
staying fully reproducible — no weighting, no model, no randomness.

A dimension no rule ever matches produces no rule-engine finding at all
(same "absence is not MODERATE-by-default" rule every sibling spec in this
directory already follows) — silence, not a neutral score.

## Combination with human review — the actual gate

**A rule-engine finding never reaches the formal Trust Domain rollup by
itself.** Per dimension:

- Human `ASSESSMENT` exists, no rule-engine finding → unchanged from today:
  the human's value rolls up alone.
- Human `ASSESSMENT` exists AND a rule-engine finding exists for the same
  dimension → both become one `{method_id, value, evidence_refs}` finding
  each, fed into `packages/intelligence/combine-method-findings.mjs`'s
  already-shipped, already-tested `combineMethodFindings()` (built
  2026-09-06, never had a real caller until this file) — the combined value
  rolls up; a genuine spread (≥2 ranks) is disclosed as `disagreement`, not
  averaged away.
- Rule-engine finding exists, no human `ASSESSMENT` yet → held out of the
  rollup entirely, surfaced to the operator as a suggestion
  ("系統偵測到以下風險指標，尚未經人工確認") with every matched rule's
  rationale and source record. Promoting a suggestion into a real
  `ASSESSMENT` is a manual action (create the `ASSESSMENT` record
  yourself, citing the same evidence) — no auto-promotion path exists in
  this change. This is the same "AI output does not automatically become
  HCI fact" admission-gate principle
  (`10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:45`) applied locally, so an
  unreviewed automated score can never silently become the formal number a
  decision is made on.

**Not built in this change, disclosed rather than silently deferred**: a
per-case configurable auto-promotion threshold (operator's own "都要" —
mandatory review by default, with an optional trust-threshold override) —
that needs a new case-level policy setting this file does not add. Tracked
as a follow-up, not implied to already work.

## Severity floor — a second dormant mechanism given its first real caller

`packages/intelligence/detect-severity-floor.mjs` (built under
`HCI_RISK_SPEC.md`, 2026-09-06) already computes "did any dimension in the
combined input hit VERY_LOW, and what did its sibling dimension say" —
also never had a real caller. This change is the first consumer: the same
combined per-dimension array §Combination produces (human alone, or
human+rule-engine combined) is passed to `detectSeverityFloor()` exactly
as `rollupTrustDomains()`'s input contract already requires, and its
alerts are surfaced alongside the Trust Domain grid, not folded into any
average — per that spec's own explicit design choice.

## Verification

- `packages/intelligence/rule-engine.mjs` — `RULES`, `matchRules`,
  `scoreRuleEngineFindings`.
- `packages/intelligence/combine-dimension-sources.mjs` — per-dimension
  assembly of human + rule-engine findings via `combineMethodFindings`,
  producing the array `rollupTrustDomains`/`detectSeverityFloor` both
  already accept unchanged.
- `tests/unit/intelligence/rule-engine.test.mjs`,
  `tests/unit/intelligence/combine-dimension-sources.test.mjs`.
- Live: `server.mjs`'s `buildCaseReportPayload()` wires both into the
  existing case-detail/report response; real-browser verification records
  the exact request/response for a case whose evidence text matches known
  rules.

## Rollback

Purely additive: two new pure modules, two new response fields
(`ruleEngineSuggestions`, `severityAlerts`) and one changed input assembly
inside `buildCaseReportPayload()` (dimension scores now come from
§Combination instead of directly from `ASSESSMENT` records — behaviourally
identical for any case with zero rule-engine matches, since combining a
single human finding with nothing is a no-op per `combineMethodFindings`'s
own N=1 case). No schema, no migration, no data to reconcile. Reverting
this file and the two modules removes the mechanism entirely.
