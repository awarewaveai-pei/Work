import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMethodContract } from '../../../packages/contracts/validate-method-contract.mjs';

// METHOD-CONTRACT-NEG-01 (ADR-0004 gate 5). See governance/ADR-0004-no-universal-human-trust-score.md
// "Required implementation gates" item 5.
function baseMethod(overrides = {}) {
  return {
    method_id: 'financial-ledger-consistency-v1',
    version: '1.0.0',
    category: 'financial',
    origin: 'internal',
    evidence_grade: 'B',
    allowed_scope: 'organization',
    required_inputs: ['ledger_entries'],
    outputs: { domains: ['FINANCIAL'] },
    forbidden_uses: ['enterprise_trust_scoring'],
    decision_weight: 0.5,
    license_status: 'proprietary',
    validation_status: 'reviewed',
    inference_mode: 'self_report',
    ...overrides,
  };
}

test('accepts a well-formed single-domain method', () => {
  const method = baseMethod();
  assert.deepEqual(validateMethodContract(method), method);
});

test('accepts a well-formed multi-domain method with per-domain decision_weight', () => {
  const method = baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: { FINANCIAL: 0.6, OPERATIONAL: 0.4 } });
  assert.deepEqual(validateMethodContract(method), method);
});

test('METHOD-CONTRACT-NEG-01: rejects a multi-domain method with a scalar decision_weight', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: 0.5 })), /METHOD-CONTRACT-NEG-01/));

test('METHOD-CONTRACT-NEG-01: rejects a multi-domain decision_weight missing a declared domain', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: { FINANCIAL: 0.6 } })), /METHOD-CONTRACT-NEG-01/));

test('METHOD-CONTRACT-NEG-01: rejects a multi-domain decision_weight with an extra domain not in outputs', () =>
  assert.throws(() => validateMethodContract(baseMethod({
    outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] },
    decision_weight: { FINANCIAL: 0.6, OPERATIONAL: 0.3, STRATEGIC: 0.1 },
  })), /METHOD-CONTRACT-NEG-01/));

test('rejects a single-domain method with a per-domain decision_weight object instead of a scalar', () =>
  assert.throws(() => validateMethodContract(baseMethod({ decision_weight: { FINANCIAL: 1 } })), /finite number/));

test('rejects duplicate domains in outputs', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'FINANCIAL'] } })), /must not repeat/));

test('rejects an invalid domain name in outputs', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['OVERALL'] } })), /invalid domain/));

test('rejects an invalid inference_mode', () =>
  assert.throws(() => validateMethodContract(baseMethod({ inference_mode: 'guess' })), /invalid inference_mode/));

test('rejects a missing required field', () => {
  const method = baseMethod();
  delete method.evidence_grade;
  assert.throws(() => validateMethodContract(method), /missing required property: evidence_grade/);
});

test('rejects an unknown top-level property', () =>
  assert.throws(() => validateMethodContract(baseMethod({ notes: 'extra' })), /unknown property: notes/));

test('rejects a non-object method definition', () =>
  assert.throws(() => validateMethodContract(null), /must be an object/));

test('rejects an array passed as a method definition', () =>
  assert.throws(() => validateMethodContract([]), /must be an object/));

// Below: closes the vacuous checks a critic review found by mutation (2026-09-06
// M1/M4) -- each of these was previously rejected correctly (or, for the
// outputs-whitelist and boxed-Number cases, not rejected at all) with no
// test proving the right behavior.

test('ADR-0004: rejects an aggregate field declared inside outputs (M1 -- previously accepted)', () => {
  assert.throws(() => validateMethodContract(baseMethod({
    outputs: { domains: ['FINANCIAL', 'OPERATIONAL'], overall_score: { range: '0-100' } },
    decision_weight: { FINANCIAL: 0.6, OPERATIONAL: 0.4 },
  })), /forbidden cross-domain field in outputs: overall_score/);
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL'], composite_trust: true } })), /forbidden cross-domain field in outputs: composite_trust/);
});

test('rejects an unrelated unknown property inside outputs', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL'], notes: 'x' } })), /outputs: unknown property: notes/));

test('METHOD-CONTRACT-NEG-01: rejects a boxed-Number decision_weight carrying domain keys (m1 -- previously accepted)', () => {
  const weight = Object.assign(new Number(0.5), { FINANCIAL: 0.6, OPERATIONAL: 0.4 });
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: weight })), /METHOD-CONTRACT-NEG-01/);
});

test('METHOD-CONTRACT-NEG-01: rejects a null decision_weight for a multi-domain method', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: null })), /METHOD-CONTRACT-NEG-01/));

test('METHOD-CONTRACT-NEG-01: rejects an array decision_weight for a multi-domain method', () =>
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] }, decision_weight: [0.6, 0.4] })), /METHOD-CONTRACT-NEG-01/));

test('METHOD-CONTRACT-NEG-01: rejects a key-mismatched decision_weight of the same length as outputs.domains', () =>
  assert.throws(() => validateMethodContract(baseMethod({
    outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] },
    decision_weight: { FINANCIAL: 0.6, STRATEGIC: 0.4 },
  })), /METHOD-CONTRACT-NEG-01/));

test('rejects a non-finite per-domain decision_weight value', () =>
  assert.throws(() => validateMethodContract(baseMethod({
    outputs: { domains: ['FINANCIAL', 'OPERATIONAL'] },
    decision_weight: { FINANCIAL: NaN, OPERATIONAL: 1 },
  })), /finite number/));

test('rejects a NaN or Infinity decision_weight for a single-domain method', () => {
  assert.throws(() => validateMethodContract(baseMethod({ decision_weight: NaN })), /finite number/);
  assert.throws(() => validateMethodContract(baseMethod({ decision_weight: Infinity })), /finite number/);
});

test('rejects a blank-string or non-string value for a required string field', () => {
  assert.throws(() => validateMethodContract(baseMethod({ method_id: '   ' })), /method_id must be a non-empty string/);
  assert.throws(() => validateMethodContract(baseMethod({ version: 3 })), /version must be a non-empty string/);
});

test('rejects non-string elements in required_inputs or a non-array forbidden_uses', () => {
  assert.throws(() => validateMethodContract(baseMethod({ required_inputs: [1, 2] })), /required_inputs must be an array of strings/);
  assert.throws(() => validateMethodContract(baseMethod({ forbidden_uses: 'enterprise_trust_scoring' })), /forbidden_uses must be an array of strings/);
});

test('rejects a null outputs or an empty outputs.domains array', () => {
  assert.throws(() => validateMethodContract(baseMethod({ outputs: null })), /outputs must be an object/);
  assert.throws(() => validateMethodContract(baseMethod({ outputs: { domains: [] } })), /outputs.domains must be a non-empty array/);
});
