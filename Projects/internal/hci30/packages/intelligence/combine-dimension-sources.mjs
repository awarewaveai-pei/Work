import { combineMethodFindings } from './combine-method-findings.mjs';

const HUMAN_METHOD_ID = 'human_review';

// HCI_RULE_ENGINE_SPEC.md §Combination: the actual admission gate. A
// rule-engine finding never reaches rollupTrustDomains/detectSeverityFloor
// by itself -- only a dimension with a real human ASSESSMENT rolls up,
// optionally strengthened/checked by a rule-engine finding on the SAME
// dimension via combine-method-findings.mjs's already-shipped disagreement
// detection (built 2026-09-06, this is its first real caller). A
// rule-engine-only dimension is returned separately as a suggestion, never
// silently promoted -- same "AI output does not automatically become HCI
// fact" principle as 10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:45, applied
// locally instead of across a system boundary.
//
// autoPromote (default false, migrations/0017's hci.cases.
// auto_promote_rule_findings -- operator's own "都要": mandatory review by
// default, with an explicit per-case opt-out): when true, a rule-engine-only
// dimension is ALSO admitted into dimensionScores directly (tagged
// method_id='rule_engine_v1' so it stays distinguishable from a real human
// finding) instead of being held out as a suggestion. Still never silent:
// the caller can tell an auto-promoted value apart from a human-reviewed
// one via `autoPromoted`.
//
// assessmentRecords: subject_records already filtered to kind=ASSESSMENT
// ({id, payload: {dimension, value, evidence_refs}}).
// ruleEngineFindings: scoreRuleEngineFindings(...).findings
// (`{method_id, dimension, value, evidence_refs}[]`).
//
// Returns:
// - dimensionScores: `{dimension, value, evidence_refs}[]` -- the exact
//   shape rollupTrustDomains/detectSeverityFloor already require, unchanged
//   for a case with zero rule-engine matches (a single human finding fed
//   through combineMethodFindings is a documented no-op, N=1 case).
// - disagreements: dimensions where human and rule-engine findings existed
//   AND diverged by >= 2 ranks (combineMethodFindings's own threshold).
// - suggestions: rule-engine findings with no human ASSESSMENT yet for that
//   dimension, held out of dimensionScores -- empty whenever autoPromote is
//   true, since every one of them is promoted instead.
// - autoPromoted: which dimensions in dimensionScores came from an
//   auto-promoted rule-engine finding rather than a human one.
export function combineDimensionSources(assessmentRecords, ruleEngineFindings, autoPromote = false) {
  const humanByDimension = new Map(
    assessmentRecords.map((r) => [r.payload.dimension, { method_id: HUMAN_METHOD_ID, value: r.payload.value, evidence_refs: r.payload.evidence_refs }]),
  );
  const ruleByDimension = new Map(ruleEngineFindings.map((f) => [f.dimension, f]));

  const dimensionScores = [];
  const disagreements = [];
  const suggestions = [];
  const autoPromoted = [];

  for (const [dimension, human] of humanByDimension) {
    const rule = ruleByDimension.get(dimension);
    if (!rule) {
      dimensionScores.push({ dimension, value: human.value, evidence_refs: human.evidence_refs });
      continue;
    }
    const combined = combineMethodFindings(dimension, [human, { method_id: rule.method_id, value: rule.value, evidence_refs: rule.evidence_refs }]);
    dimensionScores.push({ dimension: combined.dimension, value: combined.value, evidence_refs: combined.evidence_refs });
    if (combined.disagreement) disagreements.push({ dimension, human_value: human.value, rule_engine_value: rule.value });
  }

  for (const [dimension, rule] of ruleByDimension) {
    if (humanByDimension.has(dimension)) continue;
    if (autoPromote) {
      dimensionScores.push({ dimension, value: rule.value, evidence_refs: rule.evidence_refs });
      autoPromoted.push(dimension);
    } else {
      suggestions.push(rule);
    }
  }

  return { dimensionScores, disagreements, suggestions, autoPromoted };
}
