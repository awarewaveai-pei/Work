import assert from 'node:assert/strict';
import test from 'node:test';
import { combineDimensionSources } from '../../../packages/intelligence/combine-dimension-sources.mjs';

function assessment(dimension, value, evidence_refs = ['ev-1']) {
  return { id: `a-${dimension}`, payload: { dimension, value, evidence_refs } };
}
function ruleFinding(dimension, value, evidence_refs = ['ev-2']) {
  return { method_id: 'rule_engine_v1', dimension, value, evidence_refs };
}

test('human-only dimension passes through unchanged (no rule-engine finding to combine)', () => {
  const { dimensionScores, disagreements, suggestions } = combineDimensionSources(
    [assessment('COMPETENCE', 'HIGH', ['ev-a'])],
    [],
  );
  assert.deepEqual(dimensionScores, [{ dimension: 'COMPETENCE', value: 'HIGH', evidence_refs: ['ev-a'] }]);
  assert.deepEqual(disagreements, []);
  assert.deepEqual(suggestions, []);
});

test('human + agreeing rule-engine finding combine into one dimension score, no disagreement', () => {
  const { dimensionScores, disagreements } = combineDimensionSources(
    [assessment('INFORMATION_GOVERNANCE', 'LOW', ['ev-a'])],
    [ruleFinding('INFORMATION_GOVERNANCE', 'MODERATE', ['ev-b'])],
  );
  assert.equal(dimensionScores.length, 1);
  assert.equal(dimensionScores[0].dimension, 'INFORMATION_GOVERNANCE');
  // ranks [LOW=2, MODERATE=3], mean 2.5, round-half-down -> LOW (2)
  assert.equal(dimensionScores[0].value, 'LOW');
  assert.deepEqual(new Set(dimensionScores[0].evidence_refs), new Set(['ev-a', 'ev-b']));
  assert.deepEqual(disagreements, []);
});

test('human + disagreeing rule-engine finding (spread >= 2) is flagged as a disagreement, not silently averaged away', () => {
  const { dimensionScores, disagreements } = combineDimensionSources(
    [assessment('INFORMATION_GOVERNANCE', 'VERY_HIGH', ['ev-a'])],
    [ruleFinding('INFORMATION_GOVERNANCE', 'VERY_LOW', ['ev-b'])],
  );
  assert.equal(dimensionScores.length, 1);
  assert.equal(dimensionScores[0].value, 'MODERATE'); // mean of ranks 5 and 1 = 3
  assert.equal(disagreements.length, 1);
  assert.deepEqual(disagreements[0], { dimension: 'INFORMATION_GOVERNANCE', human_value: 'VERY_HIGH', rule_engine_value: 'VERY_LOW' });
});

test('rule-engine-only dimension (no human ASSESSMENT) is held out of dimensionScores and returned as a suggestion', () => {
  const { dimensionScores, suggestions } = combineDimensionSources(
    [],
    [ruleFinding('INFORMATION_GOVERNANCE', 'LOW', ['ev-b'])],
  );
  assert.deepEqual(dimensionScores, []);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].dimension, 'INFORMATION_GOVERNANCE');
});

test('autoPromote=false (default): rule-engine-only dimension stays a suggestion, never enters dimensionScores', () => {
  const { dimensionScores, suggestions, autoPromoted } = combineDimensionSources([], [ruleFinding('CONTEXT_STABILITY', 'LOW')]);
  assert.deepEqual(dimensionScores, []);
  assert.equal(suggestions.length, 1);
  assert.deepEqual(autoPromoted, []);
});

test('autoPromote=true: a rule-engine-only dimension is admitted into dimensionScores directly and marked autoPromoted', () => {
  const { dimensionScores, suggestions, autoPromoted } = combineDimensionSources([], [ruleFinding('CONTEXT_STABILITY', 'LOW', ['ev-x'])], true);
  assert.deepEqual(dimensionScores, [{ dimension: 'CONTEXT_STABILITY', value: 'LOW', evidence_refs: ['ev-x'] }]);
  assert.deepEqual(suggestions, []);
  assert.deepEqual(autoPromoted, ['CONTEXT_STABILITY']);
});

test('autoPromote=true does not change a dimension that already has a human ASSESSMENT (still combined normally)', () => {
  const { dimensionScores, autoPromoted } = combineDimensionSources(
    [assessment('COMPETENCE', 'HIGH', ['ev-a'])],
    [ruleFinding('COMPETENCE', 'MODERATE', ['ev-b'])],
    true,
  );
  assert.equal(dimensionScores.length, 1);
  assert.deepEqual(autoPromoted, []); // human+rule combination, not an auto-promotion
});

test('multiple dimensions are each handled independently (mixed human-only, combined, and suggestion-only)', () => {
  const { dimensionScores, suggestions, disagreements } = combineDimensionSources(
    [assessment('COMPETENCE', 'HIGH', ['ev-a']), assessment('INFORMATION_GOVERNANCE', 'HIGH', ['ev-c'])],
    [ruleFinding('INFORMATION_GOVERNANCE', 'HIGH', ['ev-d']), ruleFinding('CONTEXT_STABILITY', 'LOW', ['ev-e'])],
  );
  const dims = dimensionScores.map((d) => d.dimension).sort();
  assert.deepEqual(dims, ['COMPETENCE', 'INFORMATION_GOVERNANCE']);
  assert.deepEqual(disagreements, []);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].dimension, 'CONTEXT_STABILITY');
});
