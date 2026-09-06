// Implements 04_HCI30_PRODUCT_SPEC.md:138's blocking precondition, not a
// P0-04 Mathematical Specification and not HCI_PERMISSION_SPEC.md (see
// docs/intelligence/HCI_PERMISSION_SPEC.md for why that remains
// separately, honestly open): "finalizing an EXIT or
// PROCEED_WITH_CONTROLS decision on a Stage 4+ (Confidential/Strategic/
// Governance) collaboration requires a completed analyst-bias-check pass
// ... as a precondition, not an optional field a report 'may expose'."
// V1 documented this bias-defense framework and never gated on it
// (04:138's own "a warning label, not a seatbelt" framing); nothing in
// this codebase enforced it before this file. The trigger condition
// (Stage/decision) is a literal transcription; the one real interpretive
// choice made here -- "completed" means every check was answered, not
// that every answer is YES -- is disclosed where it is made, in
// isBiasCheckComplete below, not glossed over here.

// 04_HCI30_PRODUCT_SPEC.md §Collaboration stages: 7 stages, 0-indexed.
const MIN_COLLABORATION_STAGE = 0;
const MAX_COLLABORATION_STAGE = 6;

// 04_HCI30_PRODUCT_SPEC.md §Decision output: the 6 allowed values (GOOD_PERSON/
// BAD_PERSON are explicitly named as never-use and are deliberately absent
// here -- accepting them would let this gate silently legitimize the exact
// shape the product spec forbids).
export const DECISION_OUTPUTS = Object.freeze([
  'PROCEED', 'PROCEED_WITH_CONTROLS', 'LIMIT_ACCESS', 'PAUSE', 'REVIEW_REQUIRED', 'EXIT',
]);

// 04_HCI30_PRODUCT_SPEC.md:138: only these two decisions trigger the gate.
const GATED_DECISIONS = new Set(['EXIT', 'PROCEED_WITH_CONTROLS']);

// 04_HCI30_PRODUCT_SPEC.md:113-115 (stage names) + :138 (the "Stage 4+"
// trigger and its own "to avoid over-processing low-stakes Stage 0-3
// decisions" rationale): Stage 4 (Confidential) through Stage 6
// (Governance) are "Stage 4+"; Stages 0-3 are explicitly excluded.
const MIN_GATED_STAGE = 4;

// 05_HCI30_INTELLIGENCE_METHODS.md:99-106: the four binary process-
// discipline checks that replaced V1's fabricated-precision ordinal bias
// ratings (`Confirmation bias: MEDIUM`). Order matches that list.
export const BIAS_CHECK_FIELDS = Object.freeze([
  'counter_search_performed',
  'contradictory_evidence_actively_sought',
  'evidence_diversity_reviewed',
  'single_source_reliance_flagged',
]);

function assertValidStage(collaborationStage) {
  if (!Number.isInteger(collaborationStage) || collaborationStage < MIN_COLLABORATION_STAGE || collaborationStage > MAX_COLLABORATION_STAGE) {
    throw new Error(`collaborationStage must be an integer ${MIN_COLLABORATION_STAGE}-${MAX_COLLABORATION_STAGE}: ${collaborationStage}`);
  }
}

function assertValidDecision(decision) {
  if (!DECISION_OUTPUTS.includes(decision)) throw new Error(`invalid decision: ${decision}`);
}

// 04:138's trigger condition alone, with no reference to whether a bias
// check was ever performed -- exists as its own function so a caller can
// ask "will this decision need a bias check" before one has been run, not
// only "was the (already-run) one sufficient."
export function requiresBiasCheck(collaborationStage, decision) {
  assertValidStage(collaborationStage);
  assertValidDecision(decision);
  return collaborationStage >= MIN_GATED_STAGE && GATED_DECISIONS.has(decision);
}

// "Completed" means every one of the four checks was explicitly answered
// (a real boolean, not missing/null/a string) -- NOT that every answer is
// `true`. A completed check that honestly reports "Counter-search
// performed: NO" is exactly what this control exists to surface; requiring
// all-true would incentivize a superficial rubber-stamp pass instead of an
// honest one, defeating the purpose 04:138's own "a warning label, not a
// seatbelt" framing names.
//
// `null`/`undefined` are treated as "not complete" rather than a type
// error -- a caller finalizing a Stage 0-3 decision legitimately has no
// biasCheck to pass at all (the gate does not apply), and a caller who
// omits it where the gate DOES apply should get assertBiasCheckGate's own
// clear BIAS-CHECK-GATE-01 message, not an unrelated "must be an object"
// error one level down. Anything else non-object (a string, a number) is
// still a genuine caller error, distinct from "the check wasn't run."
export function isBiasCheckComplete(biasCheck) {
  if (biasCheck === null || biasCheck === undefined) return false;
  if (typeof biasCheck !== 'object' || Array.isArray(biasCheck)) throw new Error('biasCheck must be an object');
  return BIAS_CHECK_FIELDS.every((field) => typeof biasCheck[field] === 'boolean');
}

// The gate itself: throws if finalizing this decision at this stage
// requires a completed bias-check pass and one was not supplied. Never
// outputs a decision, never overrides one -- this only answers whether the
// PRECONDITION for finalizing an already-chosen decision is satisfied,
// the same "gate, not decision-maker" shape ADR-0004 gates 4-5 and
// detect-severity-floor.mjs's parallel-signal pattern already use
// elsewhere in this package. `biasCheck` may be omitted/null when no gate
// applies (Stage < 4, or a non-gated decision) -- isBiasCheckComplete is
// only ever called when required is true.
export function assertBiasCheckGate(collaborationStage, decision, biasCheck) {
  if (requiresBiasCheck(collaborationStage, decision) && !isBiasCheckComplete(biasCheck)) {
    throw new Error(`BIAS-CHECK-GATE-01: finalizing ${decision} at Stage ${collaborationStage} requires a completed bias-check pass (04_HCI30_PRODUCT_SPEC.md:138)`);
  }
}
