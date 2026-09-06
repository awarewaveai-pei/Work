import { ASSESSMENT_DIMENSIONS, DIMENSION_TO_DOMAIN } from './assessment-dimensions.mjs';
import { normalizeDimensionScores } from './dimension-score.mjs';

// HCI_EVIDENCE_QUALITY_SPEC.md §Rule: a genuinely revisable threshold, not
// "no threshold at all" (critic review, 2026-09-06 M1 -- a prior version
// of this file claimed no threshold constant existed one line above
// declaring one). `<=`, not `===`, for the same reason
// detect-severity-floor.mjs's SEVERITY_FLOOR_RANK uses `<=`: a named
// constant compared with strict equality is the exact shape that already
// produced one Critical finding this session (raising the constant would
// silently stop the floor case from matching).
const SINGLE_SOURCE_COUNT = 1;

// HCI_EVIDENCE_QUALITY_SPEC.md's worked function: classifies EVERY present
// dimension's evidence quality (not only problem cases) as SINGLE_SOURCE
// or MULTIPLE_SOURCES -- deliberately unlike detect-severity-floor.mjs and
// combine-method-findings.mjs's disagreement flag, which report only
// exceptional cases and stay silent otherwise. "Evidence quality" is
// relevant information for every dimension, not an exceptional condition;
// staying silent for well-evidenced dimensions would make "not in the
// output" ambiguous between "fine" and "wasn't in the input at all" --
// exactly the ambiguity detectSeverityFloor's own "absence is not
// MODERATE-by-default" reasoning warns against, one field over (critic
// review, 2026-09-06 C1, which found a prior version of this file
// documented both labels but only ever implemented one).
//
// Counts DISTINCT evidence refs, not `evidence_refs.length` (critic
// review, 2026-09-06 C2): two findings citing the identical ref string is
// the realistic case combineMethodFindings produces when two methods cite
// the same source, and rollup-trust-domains.mjs's own dedup
// (`[...new Set(...)]`, HCI_TRUST_DOMAIN_SPEC.md's own "deduplicated
// union" language) already treats duplicate refs as one piece of evidence
// everywhere else in this package -- counting raw array length here would
// have let a genuinely single-sourced dimension escape the SINGLE_SOURCE
// label by simply repeating one ref.
//
// Pure function: same input always produces the same output, no model
// calls, no hidden state. Ordered by ASSESSMENT_DIMENSIONS position (not
// input order), same convention as the sibling detectors.
export function classifyEvidenceQuality(dimensionScores) {
  const normalized = normalizeDimensionScores(dimensionScores);

  const byDimension = new Map(normalized.map((entry) => [entry.dimension, entry]));

  return ASSESSMENT_DIMENSIONS
    .map((dimension) => byDimension.get(dimension))
    .filter(Boolean)
    .map((entry) => {
      const distinctRefCount = new Set(entry.evidence_refs).size;
      const quality = distinctRefCount <= SINGLE_SOURCE_COUNT ? 'SINGLE_SOURCE' : 'MULTIPLE_SOURCES';
      return {
        dimension: entry.dimension,
        domain: DIMENSION_TO_DOMAIN[entry.dimension],
        value: entry.value,
        quality,
        evidence_refs: entry.evidence_refs,
      };
    });
}
