import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detectSeverityFloor } from '../../../packages/intelligence/detect-severity-floor.mjs';

// HCI_RISK_SPEC.md's worked example: a VERY_LOW dimension paired with a
// VERY_HIGH sibling would roll up to a reassuring MODERATE domain average
// -- this function exists to surface the VERY_LOW separately, not to
// change that average.
test('worked example from the spec: VERY_LOW crosses the floor with its VERY_HIGH sibling reported alongside', () => {
  const alerts = detectSeverityFloor([
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'VERY_HIGH', evidence_refs: ['ev-reliability'] },
    { dimension: 'PREDICTABILITY', value: 'VERY_LOW', evidence_refs: ['ev-predictability'] },
  ]);
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0], {
    dimension: 'PREDICTABILITY',
    domain: 'OPERATIONAL',
    value: 'VERY_LOW',
    siblings: [{ dimension: 'RELIABILITY_FULFILLMENT', value: 'VERY_HIGH' }],
    evidence_refs: ['ev-predictability'],
  });
});

test('LOW does not cross the floor -- only VERY_LOW does', () => {
  const alerts = detectSeverityFloor([{ dimension: 'COMPETENCE', value: 'LOW', evidence_refs: ['ev-1'] }]);
  assert.deepEqual(alerts, []);
});

test('MODERATE, HIGH, and VERY_HIGH do not cross the floor', () => {
  for (const value of ['MODERATE', 'HIGH', 'VERY_HIGH']) {
    const alerts = detectSeverityFloor([{ dimension: 'COMPETENCE', value, evidence_refs: ['ev-1'] }]);
    assert.deepEqual(alerts, [], `${value} should not cross the floor`);
  }
});

test('a sibling absent from the input reports value: null, not omitted or defaulted', () => {
  const alerts = detectSeverityFloor([{ dimension: 'PREDICTABILITY', value: 'VERY_LOW', evidence_refs: ['ev-1'] }]);
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].siblings, [{ dimension: 'RELIABILITY_FULFILLMENT', value: null }]);
});

test('an empty input produces no alerts', () => assert.deepEqual(detectSeverityFloor([]), []));

test('multiple severity-floor crossings across different domains are all reported', () => {
  const alerts = detectSeverityFloor([
    { dimension: 'PREDICTABILITY', value: 'VERY_LOW', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'VERY_LOW', evidence_refs: ['ev-2'] },
    { dimension: 'INTEGRITY_CONSISTENCY', value: 'HIGH', evidence_refs: ['ev-3'] },
  ]);
  assert.equal(alerts.length, 2);
  assert.deepEqual(new Set(alerts.map((a) => a.dimension)), new Set(['PREDICTABILITY', 'COMPETENCE']));
});

test('rejects a duplicate dimension in the input', () =>
  assert.throws(() => detectSeverityFloor([
    { dimension: 'COMPETENCE', value: 'VERY_LOW', evidence_refs: ['ev-1'] },
    { dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-2'] },
  ]), /duplicate dimension/));

test('rejects an invalid dimension name', () =>
  assert.throws(() => detectSeverityFloor([{ dimension: 'HONESTY', value: 'VERY_LOW', evidence_refs: ['ev-1'] }]), /invalid dimension/));

test('rejects an invalid band', () =>
  assert.throws(() => detectSeverityFloor([{ dimension: 'COMPETENCE', value: 0.1, evidence_refs: ['ev-1'] }]), /invalid band/));

test('rejects a dimension entry with no evidence_refs', () =>
  assert.throws(() => detectSeverityFloor([{ dimension: 'COMPETENCE', value: 'VERY_LOW', evidence_refs: [] }]), /evidence_refs/));

test('rejects a non-array input', () =>
  assert.throws(() => detectSeverityFloor('VERY_LOW'), /must be an array/));

// The alert and sibling lists are ordered by ASSESSMENT_DIMENSIONS
// position, not input order -- pinned exactly, not via a Set/sort that
// would hide an order regression (critic review, 2026-09-06 M4, which
// found the original version preserved caller array order for alerts
// while a companion function used a different, unstated order for
// siblings, and the only test compared via `new Set(...)`, which cannot
// detect an order difference at all).
test('the alert list is ordered by ASSESSMENT_DIMENSIONS position, not by input array order', () => {
  const inputOrderReversed = detectSeverityFloor([
    { dimension: 'COMPETENCE', value: 'VERY_LOW', evidence_refs: ['ev-competence'] },
    { dimension: 'INTEGRITY_CONSISTENCY', value: 'VERY_LOW', evidence_refs: ['ev-integrity'] },
  ]);
  // INTEGRITY_CONSISTENCY (index 0) precedes COMPETENCE (index 2) in
  // ASSESSMENT_DIMENSIONS, even though it was supplied second here.
  assert.deepEqual(inputOrderReversed.map((a) => a.dimension), ['INTEGRITY_CONSISTENCY', 'COMPETENCE']);
});

// Critic review, 2026-09-06 M5: the `siblings` array's own justification
// ("stays correct if the partition is ever widened") had no test proving
// it -- a mutation collapsing it back to a single sibling passed the
// whole suite. This builds a genuine 3-dimensions-per-domain sandbox
// (not achievable by editing the real 14-dimension file with a one-line
// drift, so its content is constructed directly) and imports the real,
// unmodified detect-severity-floor.mjs against it.
test('siblings reports every other dimension in the domain, not just one, if the partition is ever widened beyond 2', async () => {
  const os = await import('node:os');
  const fs = await import('node:fs/promises');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packagesDir = path.resolve(here, '../../../packages/intelligence');
  const contractsDir = path.resolve(here, '../../../packages/contracts');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'detect-severity-floor-widened-'));
  const tmpContracts = path.join(tmpDir, 'contracts');
  const tmpIntelligence = path.join(tmpDir, 'intelligence');
  await fs.mkdir(tmpContracts);
  await fs.mkdir(tmpIntelligence);

  await fs.copyFile(path.join(contractsDir, 'trust-domains.mjs'), path.join(tmpContracts, 'trust-domains.mjs'));
  await fs.copyFile(path.join(packagesDir, 'band-scale.mjs'), path.join(tmpIntelligence, 'band-scale.mjs'));
  await fs.copyFile(path.join(packagesDir, 'dimension-score.mjs'), path.join(tmpIntelligence, 'dimension-score.mjs'));
  await fs.copyFile(path.join(packagesDir, 'detect-severity-floor.mjs'), path.join(tmpIntelligence, 'detect-severity-floor.mjs'));

  // A genuine 3-per-domain partition: OPERATIONAL gets a third dimension
  // (EXTRA_OPERATIONAL) that is absent from the test's own input below, so
  // the resulting sibling list must contain both a present sibling
  // (PREDICTABILITY) and an absent one (EXTRA_OPERATIONAL, value null).
  const widenedAssessmentDimensions = `
import { TRUST_DOMAINS } from '../contracts/trust-domains.mjs';
export const ASSESSMENT_DIMENSIONS = Object.freeze([
  'RELIABILITY_FULFILLMENT', 'PREDICTABILITY', 'EXTRA_OPERATIONAL',
  'COMPETENCE', 'LEARNING_ADAPTABILITY', 'EXTRA_COMPETENCE',
  'BOUNDARY_RESPECT', 'INFORMATION_GOVERNANCE', 'EXTRA_CONFIDENTIALITY',
  'INCENTIVE_ALIGNMENT', 'RISK_EXTERNALIZATION', 'EXTRA_FINANCIAL',
  'RECIPROCITY_FAIRNESS', 'CONTEXT_STABILITY', 'EXTRA_STRATEGIC',
  'INTEGRITY_CONSISTENCY', 'COMMUNICATION_QUALITY', 'EXTRA_REPUTATIONAL',
  'CONFLICT_REPAIR', 'POWER_BEHAVIOR', 'EXTRA_GOVERNANCE_POWER',
]);
export const DIMENSION_TO_DOMAIN = Object.freeze({
  RELIABILITY_FULFILLMENT: 'OPERATIONAL', PREDICTABILITY: 'OPERATIONAL', EXTRA_OPERATIONAL: 'OPERATIONAL',
  COMPETENCE: 'COMPETENCE', LEARNING_ADAPTABILITY: 'COMPETENCE', EXTRA_COMPETENCE: 'COMPETENCE',
  BOUNDARY_RESPECT: 'CONFIDENTIALITY', INFORMATION_GOVERNANCE: 'CONFIDENTIALITY', EXTRA_CONFIDENTIALITY: 'CONFIDENTIALITY',
  INCENTIVE_ALIGNMENT: 'FINANCIAL', RISK_EXTERNALIZATION: 'FINANCIAL', EXTRA_FINANCIAL: 'FINANCIAL',
  RECIPROCITY_FAIRNESS: 'STRATEGIC', CONTEXT_STABILITY: 'STRATEGIC', EXTRA_STRATEGIC: 'STRATEGIC',
  INTEGRITY_CONSISTENCY: 'REPUTATIONAL', COMMUNICATION_QUALITY: 'REPUTATIONAL', EXTRA_REPUTATIONAL: 'REPUTATIONAL',
  CONFLICT_REPAIR: 'GOVERNANCE_POWER', POWER_BEHAVIOR: 'GOVERNANCE_POWER', EXTRA_GOVERNANCE_POWER: 'GOVERNANCE_POWER',
});
if (Object.keys(DIMENSION_TO_DOMAIN).length !== ASSESSMENT_DIMENSIONS.length) throw new Error('widened test fixture is internally inconsistent');
`;
  await fs.writeFile(path.join(tmpIntelligence, 'assessment-dimensions.mjs'), widenedAssessmentDimensions);

  const { detectSeverityFloor: widenedDetectSeverityFloor } = await import(
    `file://${path.join(tmpIntelligence, 'detect-severity-floor.mjs').replace(/\\/g, '/')}`
  );

  const alerts = widenedDetectSeverityFloor([
    { dimension: 'PREDICTABILITY', value: 'VERY_HIGH', evidence_refs: ['ev-predictability'] },
    { dimension: 'RELIABILITY_FULFILLMENT', value: 'VERY_LOW', evidence_refs: ['ev-reliability'] },
    // EXTRA_OPERATIONAL is intentionally absent from the input.
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].dimension, 'RELIABILITY_FULFILLMENT');
  assert.deepEqual(alerts[0].siblings, [
    { dimension: 'PREDICTABILITY', value: 'VERY_HIGH' },
    { dimension: 'EXTRA_OPERATIONAL', value: null },
  ]);

  await fs.rm(tmpDir, { recursive: true, force: true });
});
