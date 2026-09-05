import { ASSESSMENT_DIMENSIONS } from './assessment-dimensions.mjs';
import { BAND_RANK, BANDS, meanRankBand } from './band-scale.mjs';

// HCI_CONFIDENCE_SPEC.md §Combination rule: a spread of 1 (adjacent bands,
// e.g. LOW/MODERATE) is ordinary measurement variation; a spread of 2 or
// more (e.g. LOW/HIGH) represents materially different conclusions from
// different methods about the same Assessment Dimension and must be
// disclosed, not averaged away (19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md:17,
// "Do not average lens disagreement away").
const DISAGREEMENT_SPREAD_THRESHOLD = 2;

// Validates AND returns a plain, re-read-proof snapshot -- same
// time-of-check/time-of-use defense rollup-trust-domains.mjs already
// applies (critic review, 2026-09-06 m2), reused here for a new input
// shape rather than trusting a getter-backed caller.
function normalizeFinding(finding, index) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) throw new Error(`findings[${index}] must be an object`);
  const methodId = finding.method_id;
  const value = finding.value;
  const evidenceRefsInput = finding.evidence_refs;
  if (typeof methodId !== 'string' || methodId.trim() === '') throw new Error(`findings[${index}]: method_id must be a non-empty string`);
  if (!BANDS.includes(value)) throw new Error(`findings[${index}]: invalid band: ${value}`);
  if (!Array.isArray(evidenceRefsInput) || evidenceRefsInput.length === 0) throw new Error(`findings[${index}]: evidence_refs must be a non-empty array`);
  const evidenceRefs = evidenceRefsInput.map((ref) => {
    if (typeof ref !== 'string' || ref.trim() === '') throw new Error(`findings[${index}]: evidence_refs must contain only non-empty strings`);
    return ref;
  });
  return { method_id: methodId, value, evidence_refs: evidenceRefs };
}

// HCI_CONFIDENCE_SPEC.md's worked function: N >= 1 method findings about
// ONE named Assessment Dimension in, one combined {dimension, value,
// disagreement, evidence_refs} out. Pure function: same input always
// produces the same output, no model calls, no hidden state. This is the
// layer rollup-trust-domains.mjs's own input contract assumes already
// happened -- see HCI_TRUST_DOMAIN_SPEC.md §Layering for why gate 5's
// decision_weight does not (and structurally cannot) answer this question.
export function combineMethodFindings(dimension, findings) {
  if (!ASSESSMENT_DIMENSIONS.includes(dimension)) throw new Error(`invalid dimension: ${dimension}`);
  if (!Array.isArray(findings) || findings.length === 0) throw new Error('findings must be a non-empty array');
  const normalized = findings.map(normalizeFinding);

  const seenMethods = new Set();
  for (const finding of normalized) {
    if (seenMethods.has(finding.method_id)) throw new Error(`duplicate method_id in findings: ${finding.method_id}`);
    seenMethods.add(finding.method_id);
  }

  const evidenceRefs = [...new Set(normalized.flatMap((finding) => finding.evidence_refs))];
  const ranks = normalized.map((finding) => BAND_RANK[finding.value]);
  // For a single finding, spread is 0 (max === min) and meanRankBand is a
  // correct pass-through -- no separate N === 1 branch needed, verified by
  // band-scale.test.mjs's own single-rank case.
  const spread = Math.max(...ranks) - Math.min(...ranks);
  const disagreement = spread >= DISAGREEMENT_SPREAD_THRESHOLD;
  const value = meanRankBand(ranks);

  return { dimension, value, disagreement, evidence_refs: evidenceRefs };
}
