// ADR-0032's ratified five-band confidence-display convention
// (VERY_LOW..VERY_HIGH), extended by HCI_TRUST_DOMAIN_SPEC.md to
// Trust-Domain/Dimension values. Shared here between
// rollup-trust-domains.mjs (dimensions -> domains) and
// combine-method-findings.mjs (method findings -> one dimension) so the
// rank encoding and round-half-down tie-break exist in exactly one place
// -- extracted rather than copy-pasted a third time when the second
// consumer needed it.
export const BAND_RANK = Object.freeze({ VERY_LOW: 1, LOW: 2, MODERATE: 3, HIGH: 4, VERY_HIGH: 5 });
export const RANK_BAND = Object.freeze(['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']);
export const BANDS = Object.freeze(Object.keys(BAND_RANK));

// Rounds to the nearest integer rank, ties broken DOWN (conservative --
// overstating trust/confidence is more harmful than understating it).
// Math.round rounds .5 UP, so the down-bias is applied explicitly rather
// than relying on (or accidentally depending on) the built-in's direction.
export function roundHalfDown(mean) {
  const fractional = mean - Math.floor(mean);
  return fractional > 0.5 ? Math.ceil(mean) : Math.floor(mean);
}

// Mean of the given ranks, rounded via roundHalfDown, mapped back to a
// band name. Callers are responsible for validating each rank is already
// known to be valid (1-5) -- but an empty array is rejected here rather
// than silently returning `undefined` (0/0 = NaN), since this module is
// now shared by two callers (critic review, 2026-09-06 m7: both current
// callers happen to already guard against calling this with zero ranks,
// but a third caller might not).
export function meanRankBand(ranks) {
  if (!Array.isArray(ranks) || ranks.length === 0) throw new Error('meanRankBand requires a non-empty array of ranks');
  const mean = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
  return RANK_BAND[roundHalfDown(mean) - 1];
}
