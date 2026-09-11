import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRules, scoreRuleEngineFindings, RULE_ENGINE_METHOD_ID } from '../../../packages/intelligence/rule-engine.mjs';

test('matchRules finds a rule whose keyword appears in the text, case-insensitively', () => {
  const hits = matchRules('Vendor disclosed a DATA BREACH last quarter');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'data_breach');
});

test('matchRules matches a Traditional Chinese keyword', () => {
  const hits = matchRules('該公司發生資安事件，影響客戶資料');
  assert.equal(hits.some((h) => h.id === 'data_breach'), true);
});

test('matchRules returns multiple rules when a text matches more than one, including two on the same dimension', () => {
  const hits = matchRules('該公司發生資安事件，也曾遭主管機關裁罰');
  const ids = hits.map((h) => h.id).sort();
  assert.deepEqual(ids, ['data_breach', 'regulatory_fine']);
});

test('matchRules returns empty for text matching nothing', () => assert.deepEqual(matchRules('一切正常，沒有異常事件'), []));
test('matchRules returns empty for empty or non-string input', () => {
  assert.deepEqual(matchRules(''), []);
  assert.deepEqual(matchRules(null), []);
  assert.deepEqual(matchRules(undefined), []);
});

test('scoreRuleEngineFindings: a single severe negative hit (delta -2) shifts two ranks below baseline (MODERATE -> VERY_LOW)', () => {
  const { findings } = scoreRuleEngineFindings([{ id: 'r1', kind: 'EVIDENCE', payload: { content: '供應商發生資安事件' } }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].method_id, RULE_ENGINE_METHOD_ID);
  assert.equal(findings[0].dimension, 'INFORMATION_GOVERNANCE');
  assert.equal(findings[0].value, 'VERY_LOW'); // baseline 3 (MODERATE) + delta -2 = rank 1
});

test('scoreRuleEngineFindings: deltas sum across multiple matching records on the same dimension', () => {
  const { findings } = scoreRuleEngineFindings([
    { id: 'r1', kind: 'EVIDENCE', payload: { content: '取得 SOC2 認證' } }, // +1
    { id: 'r2', kind: 'EVIDENCE', payload: { content: '另外也取得 ISO 27001' } }, // +1
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].dimension, 'INFORMATION_GOVERNANCE');
  assert.equal(findings[0].value, 'VERY_HIGH'); // baseline 3 + 1 + 1 = 5
  assert.deepEqual(new Set(findings[0].evidence_refs), new Set(['r1', 'r2']));
});

test('scoreRuleEngineFindings: rank is clamped at the VERY_LOW floor, not allowed to go below 1', () => {
  const { findings } = scoreRuleEngineFindings([
    { id: 'r1', kind: 'EVIDENCE', payload: { content: '資安事件' } }, // -2
    { id: 'r2', kind: 'EVIDENCE', payload: { content: '又遭主管機關裁罰' } }, // -2
    { id: 'r3', kind: 'EVIDENCE', payload: { content: '再度資料外洩' } }, // -2 (data_breach again)
  ]);
  assert.equal(findings[0].value, 'VERY_LOW'); // 3 - 2 - 2 - 2 = -3, clamped to rank 1
});

test('scoreRuleEngineFindings: rank is clamped at the VERY_HIGH ceiling, not allowed to exceed 5', () => {
  const { findings } = scoreRuleEngineFindings([
    { id: 'r1', kind: 'EVIDENCE', payload: { content: 'SOC2 認證' } }, // +1
    { id: 'r2', kind: 'EVIDENCE', payload: { content: 'iso 27001 通過' } }, // +1
    { id: 'r3', kind: 'EVIDENCE', payload: { content: '再取得資安認證' } }, // +1
  ]);
  assert.equal(findings[0].value, 'VERY_HIGH'); // 3 + 1 + 1 + 1 = 6, clamped to rank 5
});

test('scoreRuleEngineFindings: a dimension with zero matches produces no finding at all -- never a neutral default', () => {
  const { findings } = scoreRuleEngineFindings([{ id: 'r1', kind: 'EVIDENCE', payload: { content: '一切正常' } }]);
  assert.deepEqual(findings, []);
});

test('scoreRuleEngineFindings: hitsByDimension carries the rationale text for the UI, one entry per matched rule', () => {
  const { hitsByDimension } = scoreRuleEngineFindings([{ id: 'r1', kind: 'EVIDENCE', payload: { content: '資安事件' } }]);
  assert.equal(hitsByDimension.INFORMATION_GOVERNANCE.length, 1);
  assert.equal(hitsByDimension.INFORMATION_GOVERNANCE[0].rule_id, 'data_breach');
  assert.equal(typeof hitsByDimension.INFORMATION_GOVERNANCE[0].rationale, 'string');
  assert.ok(hitsByDimension.INFORMATION_GOVERNANCE[0].rationale.length > 0);
});

test('scoreRuleEngineFindings: non-EVIDENCE/CLAIM shape (payload.content missing) is treated as empty text, not a crash', () => {
  const { findings } = scoreRuleEngineFindings([{ id: 'r1', kind: 'ASSESSMENT', payload: { dimension: 'COMPETENCE', value: 'HIGH' } }]);
  assert.deepEqual(findings, []);
});
