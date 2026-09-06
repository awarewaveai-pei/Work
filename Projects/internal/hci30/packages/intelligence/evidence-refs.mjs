// Shared evidence_refs validation, identical (byte-for-byte, verified
// before extracting) across dimension-score.mjs's normalizeDimensionScore
// and combine-method-findings.mjs's normalizeFinding -- not the "premature
// abstraction over a coincidental structural similarity" dimension-score.mjs's
// own header warns against for the FULL entry shape (method_id vs dimension
// differ in meaning and must stay separate validators), but the
// evidence_refs sub-rule itself is the literal same business rule in both:
// a non-empty array of non-blank strings, returned as a fresh copy so the
// caller's array cannot be mutated out from under the snapshot afterward.
//
// Array.from, not a direct .map(): the same sparse-array hole bug fixed in
// dimension-score.mjs's normalizeDimensionScores (2026-09-06) existed here
// independently and more dangerously (critic review, 2026-09-06 M1) -- a
// hole in evidence_refs (e.g. `[, 'ev-1']`) is SILENTLY skipped by a direct
// .map(), leaving the hole in the output array completely unvalidated
// (never throws), unlike the outer dimensionScores/findings hole, which at
// least crashed loudly. A hole surviving into
// classify-evidence-quality.mjs's `new Set(entry.evidence_refs).size`
// count treats the hole as one distinct value, which can silently mislabel
// a genuinely single-source dimension as MULTIPLE_SOURCES -- a false claim
// about evidence strength, not merely a crash. A sparse `[,]` (length 1,
// zero real elements) previously passed the "non-empty array" check
// entirely undetected; Array.from densifies it to `[undefined]` first, so
// the existing per-element string check now correctly rejects it too.
export function normalizeEvidenceRefs(refsInput, label, index) {
  if (!Array.isArray(refsInput) || refsInput.length === 0) throw new Error(`${label}[${index}]: evidence_refs must be a non-empty array`);
  return Array.from(refsInput).map((ref) => {
    if (typeof ref !== 'string' || ref.trim() === '') throw new Error(`${label}[${index}]: evidence_refs must contain only non-empty strings`);
    return ref;
  });
}
