import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  DECISION_OUTPUTS, BIAS_CHECK_FIELDS,
  requiresBiasCheck, isBiasCheckComplete, assertBiasCheckGate,
} from '../../../packages/intelligence/bias-check-gate.mjs';

const COMPLETE_BIAS_CHECK = Object.freeze({
  counter_search_performed: true,
  contradictory_evidence_actively_sought: true,
  evidence_diversity_reviewed: false,
  single_source_reliance_flagged: true,
});

// requiresBiasCheck: 04_HCI30_PRODUCT_SPEC.md:138's trigger condition
// (Stage 4+, EXIT or PROCEED_WITH_CONTROLS only).

test('requires a bias check for EXIT at Stage 4, 5, and 6', () => {
  assert.equal(requiresBiasCheck(4, 'EXIT'), true);
  assert.equal(requiresBiasCheck(5, 'EXIT'), true);
  assert.equal(requiresBiasCheck(6, 'EXIT'), true);
});

test('requires a bias check for PROCEED_WITH_CONTROLS at Stage 4+', () =>
  assert.equal(requiresBiasCheck(4, 'PROCEED_WITH_CONTROLS'), true));

test('does not require a bias check below Stage 4, even for a gated decision', () => {
  assert.equal(requiresBiasCheck(0, 'EXIT'), false);
  assert.equal(requiresBiasCheck(3, 'EXIT'), false);
  assert.equal(requiresBiasCheck(3, 'PROCEED_WITH_CONTROLS'), false);
});

test('does not require a bias check at Stage 4+ for a non-gated decision', () => {
  for (const decision of ['PROCEED', 'LIMIT_ACCESS', 'PAUSE', 'REVIEW_REQUIRED']) {
    assert.equal(requiresBiasCheck(6, decision), false, `${decision} should not be gated`);
  }
});

test('rejects an out-of-range or non-integer collaborationStage', () => {
  assert.throws(() => requiresBiasCheck(-1, 'EXIT'), /collaborationStage/);
  assert.throws(() => requiresBiasCheck(7, 'EXIT'), /collaborationStage/);
  assert.throws(() => requiresBiasCheck(4.5, 'EXIT'), /collaborationStage/);
  assert.throws(() => requiresBiasCheck('4', 'EXIT'), /collaborationStage/);
});

test('rejects an invalid decision, including the explicitly forbidden GOOD_PERSON/BAD_PERSON shape', () => {
  assert.throws(() => requiresBiasCheck(4, 'GOOD_PERSON'), /invalid decision/);
  assert.throws(() => requiresBiasCheck(4, 'BAD_PERSON'), /invalid decision/);
  assert.throws(() => requiresBiasCheck(4, 'APPROVED'), /invalid decision/);
});

test('DECISION_OUTPUTS is exactly the 6 named values, in the product spec order', () =>
  assert.deepEqual(DECISION_OUTPUTS, ['PROCEED', 'PROCEED_WITH_CONTROLS', 'LIMIT_ACCESS', 'PAUSE', 'REVIEW_REQUIRED', 'EXIT']));

// DECISION_OUTPUTS is a second, independent copy of the same 6 values
// already enforced by migration 0005's `outcome` CHECK constraint on
// hci.decisions (critic review, 2026-09-06 M5) -- same drift risk
// tests/unit/contracts/trust-domains.test.mjs already exists to close for
// TRUST_DOMAINS vs migration 0011's domain CHECK, applied here to a
// second enum pair. Reads the actual CHECK text so JS-side and SQL-side
// can never silently diverge (adding/removing/renaming/reordering a
// decision value would otherwise leave this suite green).
const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../database/migrations/0005_wave1_bitemporal_history_up.sql',
);

test('DECISION_OUTPUTS matches the outcome CHECK constraint in migration 0005, verbatim and in order', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const match = sql.match(/CHECK \(outcome IN \(([^)]*)\)\)/);
  assert.ok(match, 'expected a `CHECK (outcome IN (...))` constraint in 0005_wave1_bitemporal_history_up.sql');
  const sqlOutcomes = match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual([...DECISION_OUTPUTS], sqlOutcomes);
});

// isBiasCheckComplete: all 4 fields must be real booleans; "complete" is
// not "all true" -- an honest NO answer is still a completed check.

test('a fully-answered check is complete regardless of the individual answers', () => {
  assert.equal(isBiasCheckComplete(COMPLETE_BIAS_CHECK), true);
  assert.equal(isBiasCheckComplete({
    counter_search_performed: false,
    contradictory_evidence_actively_sought: false,
    evidence_diversity_reviewed: false,
    single_source_reliance_flagged: false,
  }), true);
});

test('missing one of the four fields is incomplete', () => {
  const { single_source_reliance_flagged, ...missingOne } = COMPLETE_BIAS_CHECK;
  assert.equal(isBiasCheckComplete(missingOne), false);
});

test('a non-boolean value for any field is incomplete', () =>
  assert.equal(isBiasCheckComplete({ ...COMPLETE_BIAS_CHECK, counter_search_performed: 'YES' }), false));

test('null or undefined is incomplete, not a type error', () => {
  assert.equal(isBiasCheckComplete(null), false);
  assert.equal(isBiasCheckComplete(undefined), false);
});

test('rejects a non-object, non-null/undefined biasCheck as a genuine caller error', () => {
  assert.throws(() => isBiasCheckComplete('YES'), /biasCheck must be an object/);
  assert.throws(() => isBiasCheckComplete(['YES']), /biasCheck must be an object/);
});

test('BIAS_CHECK_FIELDS is exactly the 4 named checks, in 05_HCI30_INTELLIGENCE_METHODS.md order', () =>
  assert.deepEqual(BIAS_CHECK_FIELDS, [
    'counter_search_performed', 'contradictory_evidence_actively_sought',
    'evidence_diversity_reviewed', 'single_source_reliance_flagged',
  ]));

// assertBiasCheckGate: the actual gate. Never outputs or overrides a
// decision -- only validates the precondition for finalizing one already
// chosen elsewhere.

test('passes silently when the gate does not apply, even with no biasCheck at all', () => {
  assert.doesNotThrow(() => assertBiasCheckGate(3, 'EXIT', null));
  assert.doesNotThrow(() => assertBiasCheckGate(6, 'PROCEED', null));
  assert.doesNotThrow(() => assertBiasCheckGate(6, 'PROCEED', undefined));
});

test('passes when the gate applies and the check is complete, even if every answer is NO', () =>
  assert.doesNotThrow(() => assertBiasCheckGate(5, 'EXIT', {
    counter_search_performed: false,
    contradictory_evidence_actively_sought: false,
    evidence_diversity_reviewed: false,
    single_source_reliance_flagged: false,
  })));

test('throws BIAS-CHECK-GATE-01 when the gate applies and biasCheck is missing', () =>
  assert.throws(() => assertBiasCheckGate(4, 'EXIT', null), /BIAS-CHECK-GATE-01/));

test('throws BIAS-CHECK-GATE-01 when the gate applies and biasCheck is incomplete', () =>
  assert.throws(() => assertBiasCheckGate(6, 'PROCEED_WITH_CONTROLS', {
    counter_search_performed: true,
    contradictory_evidence_actively_sought: true,
    evidence_diversity_reviewed: true,
    // single_source_reliance_flagged omitted
  }), /BIAS-CHECK-GATE-01/));

test('the gate error names the decision and stage', () =>
  assert.throws(() => assertBiasCheckGate(5, 'EXIT', null), /finalizing EXIT at Stage 5/));

// A non-object, non-null/undefined biasCheck when the gate DOES apply is a
// genuine caller error (isBiasCheckComplete's own type guard), not the
// gate's own BIAS-CHECK-GATE-01 -- locking this down so the two error
// paths do not get confused (critic review, 2026-09-06 suggestion).
test('a malformed (non-object) biasCheck when the gate applies throws the underlying type error, not BIAS-CHECK-GATE-01', () =>
  assert.throws(() => assertBiasCheckGate(4, 'EXIT', 'YES'), /biasCheck must be an object/));
