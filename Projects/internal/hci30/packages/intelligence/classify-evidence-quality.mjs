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
//
// resolveClusterRoot (2026-09-17, HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md
// Task 11): optional `(ref) => rootRef` mapping an evidence_ref to its
// hci.source_relationships ORIGINAL_SOURCE cluster root, so 100 URLs that
// are really one syndicated story count as one independent source instead
// of 100 (06_HCI30_PUBLIC_INTELLIGENCE.md:168-181, "URL count is not
// independent-source count"). Defaults to identity (ref => ref), which
// reproduces today's raw-distinct-ref-string behavior exactly -- this
// module stays a pure function with zero DB access; a caller with
// source_relationships data builds the resolver, a caller without any
// (the common case until Claim-extraction wiring lands) passes nothing and
// gets the unchanged legacy count. This is a mandatory fallback, not an
// opt-in: every existing call site keeps working unmodified. `null` for the
// options argument falls back the same as omitting it entirely (`?? {}`,
// not destructuring straight off the parameter), matching every other
// "nothing configured" shape a caller might reasonably pass.
//
// resolveRoot's return value is validated the same way evidence-refs.mjs
// validates raw refs (critic review, 2026-09-17): an unvalidated resolver
// that returns undefined/null for an unmapped ref would collapse every
// such ref into one bucket regardless of how many genuinely distinct
// sources they are -- silently downgrading a real MULTIPLE_SOURCES
// dimension to SINGLE_SOURCE, the exact "false claim about evidence
// strength, not a crash" failure class this file's other guards (sparse-
// array holes, above) already exist to catch. A resolver exception is
// re-thrown with this function's own name attached so the error surface
// matches the rest of the file's labeled-validation style instead of
// leaking the resolver's raw stack trace.
//
// evidence_count is the sole authoritative independence signal once a
// resolver is supplied; evidence_refs.length must not be used as a proxy
// for it (it already diverged for literal duplicate strings before this
// change, and resolveClusterRoot widens that gap on purpose).
export function classifyEvidenceQuality(dimensionScores, options) {
  const { resolveClusterRoot } = options ?? {};
  const identity = (ref) => ref;
  const resolveRoot = typeof resolveClusterRoot === 'function' ? resolveClusterRoot : identity;
  const normalized = normalizeDimensionScores(dimensionScores);

  const byDimension = new Map(normalized.map((entry) => [entry.dimension, entry]));

  return ASSESSMENT_DIMENSIONS
    .map((dimension) => byDimension.get(dimension))
    .filter(Boolean)
    .map((entry) => {
      const roots = entry.evidence_refs.map((ref) => {
        let root;
        try {
          root = resolveRoot(ref);
        } catch (err) {
          throw new Error(`classifyEvidenceQuality: resolveClusterRoot threw for ref "${ref}": ${err.message}`);
        }
        if (typeof root !== 'string' || root.trim() === '') {
          throw new Error(`classifyEvidenceQuality: resolveClusterRoot must return a non-empty string for ref "${ref}", got ${JSON.stringify(root)}`);
        }
        return root;
      });
      const distinctRefCount = new Set(roots).size;
      const quality = distinctRefCount <= SINGLE_SOURCE_COUNT ? 'SINGLE_SOURCE' : 'MULTIPLE_SOURCES';
      return {
        dimension: entry.dimension,
        domain: DIMENSION_TO_DOMAIN[entry.dimension],
        value: entry.value,
        quality,
        // Operator, 2026-09-11 ("HC 缺點...統計方法很陽春"): SINGLE_SOURCE/
        // MULTIPLE_SOURCES alone collapses "backed by 1 record" and "backed
        // by 50 records" into the same label. The distinct count backing
        // that same quality classification (already computed above, not a
        // second independent count) -- an honest evidence-count signal, not
        // a fabricated confidence interval/statistical model, which would
        // need real calibration data this system does not have.
        evidence_count: distinctRefCount,
        evidence_refs: entry.evidence_refs,
      };
    });
}
