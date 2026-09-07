import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSubjectRecordPayload } from '../../../packages/contracts/validate-subject-record-payload.mjs';

test('EVIDENCE requires content', () => assert.throws(() => validateSubjectRecordPayload('EVIDENCE', {}), /EVIDENCE payload requires/));
test('EVIDENCE accepts content', () => assert.deepEqual(validateSubjectRecordPayload('EVIDENCE', { content: 'x' }), { content: 'x' }));

test('CLAIM requires content', () => assert.throws(() => validateSubjectRecordPayload('CLAIM', { evidence_refs: ['e1'] }), /CLAIM payload requires non-empty content/));
test('CLAIM requires non-empty evidence_refs', () => assert.throws(() => validateSubjectRecordPayload('CLAIM', { content: 'x', evidence_refs: [] }), /evidence_refs/));
test('CLAIM accepts content + evidence_refs', () => assert.deepEqual(validateSubjectRecordPayload('CLAIM', { content: 'x', evidence_refs: ['e1'] }), { content: 'x', evidence_refs: ['e1'] }));

test('ASSESSMENT requires dimension/value/evidence_refs', () => {
  assert.throws(() => validateSubjectRecordPayload('ASSESSMENT', { value: 'HIGH', evidence_refs: ['e1'] }), /dimension/);
  assert.throws(() => validateSubjectRecordPayload('ASSESSMENT', { dimension: 'RELIABILITY', evidence_refs: ['e1'] }), /value/);
  assert.throws(() => validateSubjectRecordPayload('ASSESSMENT', { dimension: 'RELIABILITY', value: 'HIGH' }), /evidence_refs/);
});
test('ASSESSMENT accepts full shape', () => assert.deepEqual(
  validateSubjectRecordPayload('ASSESSMENT', { dimension: 'RELIABILITY', value: 'HIGH', evidence_refs: ['e1'] }),
  { dimension: 'RELIABILITY', value: 'HIGH', evidence_refs: ['e1'] }
));

test('TRUST_DOMAIN requires domain/band', () => {
  assert.throws(() => validateSubjectRecordPayload('TRUST_DOMAIN', { band: 'MEDIUM' }), /domain/);
  assert.throws(() => validateSubjectRecordPayload('TRUST_DOMAIN', { domain: 'OPERATIONAL' }), /band/);
});
test('TRUST_DOMAIN accepts domain + band', () => assert.deepEqual(
  validateSubjectRecordPayload('TRUST_DOMAIN', { domain: 'OPERATIONAL', band: 'MEDIUM' }),
  { domain: 'OPERATIONAL', band: 'MEDIUM' }
));

test('rejects unsupported kind', () => assert.throws(() => validateSubjectRecordPayload('BOGUS', { content: 'x' }), /unsupported kind/));
test('rejects non-object payload', () => assert.throws(() => validateSubjectRecordPayload('EVIDENCE', 'x'), /must be an object/));
test('rejects array payload', () => assert.throws(() => validateSubjectRecordPayload('EVIDENCE', ['x']), /must be an object/));
