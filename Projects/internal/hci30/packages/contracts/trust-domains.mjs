// Verbatim copy of the domain enum in
// migrations/0011_wave1_trust_domain_scope_up.sql:92-93, which itself
// copies 04_HCI30_PRODUCT_SPEC.md:59-65. Keep all three in sync -- this is
// the exact axis ADR-0004 forbids ever reducing to one scalar.
// tests/unit/contracts/trust-domains.test.mjs enforces the SQL side of that
// sync mechanically (critic review, 2026-09-06 M2: a "keep in sync" comment
// with no test is a documented intention, not a control, per ADR-0004:12's
// own Invariant-8 citation -- three drift mutations here, full rebuild,
// full domain rename, all landed and passed the suite before this test
// existed).
export const TRUST_DOMAINS = Object.freeze([
  'OPERATIONAL',
  'COMPETENCE',
  'CONFIDENTIALITY',
  'FINANCIAL',
  'STRATEGIC',
  'REPUTATIONAL',
  'GOVERNANCE_POWER',
]);

// ADR-0004's Decision, third bullet: "No table, view, materialized
// aggregate, API response field, or UI component may carry a name or
// semantic equivalent to overall_score / composite_trust / aggregate_trust
// / universal_trust / a bare trust_score computed across more than one
// domain." Same five names as scripts/check-no-universal-trust-column.ps1's
// SQL column-name lint (gate 1); shared here between gate 4 (API response
// validator) and gate 5 (method-catalog validator) so both enforcement
// layers name the same violation instead of each keeping its own copy of
// the list (critic review, 2026-09-06 M1: gate 5's `outputs` field had no
// notion of this list at all, so a method could declare
// `outputs.overall_score` and pass). `overall_trust` is additionally named
// by gate 4's own text (ADR-0004.md's "Required implementation gates" item
// 4) for API responses specifically -- a name gate 1's SQL-column list
// never had reason to include. Case-insensitive from the start -- gate 1's
// own review found a case-sensitivity bypass after the fact; no reason to
// repeat that mistake here.
export const FORBIDDEN_AGGREGATE_KEY = /^(overall_score|composite_trust|aggregate_trust|universal_trust|trust_score|overall_trust)$/i;
