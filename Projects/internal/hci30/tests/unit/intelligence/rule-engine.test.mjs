import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  matchRules, matchNegatedRules, scoreRuleEngineFindings, detectKeywordStacking,
  RULE_ENGINE_METHOD_ID, RULE_SET_VERSION, RULES,
} from '../../../packages/intelligence/rule-engine.mjs';

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

// C2 (2026-09-12, "HC 缺點": 無否定詞判斷) -- a negation cue within the
// window before a matched keyword excludes that occurrence from scoring.
test('matchRules does not count a keyword whose only occurrence is inside a negation window', () => {
  const hits = matchRules('調查後排除了詐欺疑慮');
  assert.equal(hits.some((h) => h.id === 'fraud_indicator'), false);
});

test('matchRules still counts the same keyword when no negation cue precedes it', () => {
  const hits = matchRules('證實涉及詐欺');
  assert.equal(hits.some((h) => h.id === 'fraud_indicator'), true);
});

test('matchNegatedRules reports the rule matchRules excluded, never both at once for the same text', () => {
  const text = '調查後排除了詐欺疑慮';
  const matched = matchRules(text);
  const negated = matchNegatedRules(text);
  assert.equal(matched.some((r) => r.id === 'fraud_indicator'), false);
  assert.equal(negated.some((r) => r.id === 'fraud_indicator'), true);
});

test('matchNegatedRules is empty when the keyword never appears at all', () => {
  assert.deepEqual(matchNegatedRules('一切正常，沒有異常事件'), []);
});

// Critic-caught regression (2026-09-12): 'did not' without a trailing space
// matched inside unrelated words like "did notify" via plain substring
// search, silently excluding a genuine match. Every other multi-word cue
// ('not ', 'never ') already carried this trailing space; 'did not' alone
// didn't.
test('a negation cue substring inside an unrelated word does not suppress a real match ("did notify" is not "did not")', () => {
  const hits = matchRules('vendor did notify data breach');
  assert.equal(hits.some((h) => h.id === 'data_breach'), true);
});

test('the "did not" cue still suppresses a genuine negation with the trailing space intact', () => {
  const hits = matchRules('the vendor did not have a data breach');
  assert.equal(hits.some((h) => h.id === 'data_breach'), false);
});

// A keyword appearing twice, once negated once not, is real signal
// somewhere in the text -- must still count as matched overall.
test('a keyword matched once and negated once elsewhere in the same text still counts as matched', () => {
  const text = '雖然排除了詐欺疑慮，但另一份文件證實涉及詐欺';
  const matched = matchRules(text);
  const negated = matchNegatedRules(text);
  assert.equal(matched.some((r) => r.id === 'fraud_indicator'), true);
  assert.equal(negated.some((r) => r.id === 'fraud_indicator'), false);
});

test('scoreRuleEngineFindings exposes negatedHitsByDimension for a negation-only match, without creating a finding', () => {
  const { findings, negatedHitsByDimension } = scoreRuleEngineFindings([
    { id: 'r1', kind: 'EVIDENCE', payload: { content: '調查後排除了詐欺疑慮' } },
  ]);
  assert.deepEqual(findings, []); // negation-only match must never fabricate a finding, same as zero matches
  assert.equal(negatedHitsByDimension.INTEGRITY_CONSISTENCY.length, 1);
  assert.equal(negatedHitsByDimension.INTEGRITY_CONSISTENCY[0].rule_id, 'fraud_indicator');
  assert.equal(negatedHitsByDimension.INTEGRITY_CONSISTENCY[0].record_id, 'r1');
});

// C2 -- rule-set version. Derived from RULES content, not hand-maintained,
// so it changes automatically the moment a keyword/delta/rationale edits.
test('RULE_SET_VERSION is a deterministic 12-hex-char digest of RULES, distinct from RULE_ENGINE_METHOD_ID', () => {
  assert.match(RULE_SET_VERSION, /^[0-9a-f]{12}$/);
  assert.notEqual(RULE_SET_VERSION, RULE_ENGINE_METHOD_ID);
  const recomputed = createHash('sha256').update(JSON.stringify(RULES)).digest('hex').slice(0, 12);
  assert.equal(RULE_SET_VERSION, recomputed);
});

// C3 (2026-09-12, "HC 缺點": 規則透明=可被針對性操弄) -- a review signal,
// not a fix: unusually many distinct rules matching one text is worth a
// second look.
test('detectKeywordStacking flags a record whose text matches 3 or more distinct rules', () => {
  const flagged = detectKeywordStacking([
    { id: 'r1', kind: 'EVIDENCE', payload: { content: '資安事件，也遭主管機關裁罰，還有利益衝突' } },
  ]);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].record_id, 'r1');
  assert.equal(flagged[0].rule_count, 3);
  assert.deepEqual(new Set(flagged[0].rule_ids), new Set(['data_breach', 'regulatory_fine', 'conflict_of_interest']));
});

test('detectKeywordStacking does not flag a record matching only 2 distinct rules', () => {
  const flagged = detectKeywordStacking([{ id: 'r1', kind: 'EVIDENCE', payload: { content: '資安事件，也遭主管機關裁罰' } }]);
  assert.deepEqual(flagged, []);
});

test('detectKeywordStacking does not flag a record matching the same rule\'s multiple keywords repeatedly', () => {
  // Same rule (data_breach) hit via two of its own keywords -- one distinct
  // rule, not two -- must not count toward the stacking threshold.
  const flagged = detectKeywordStacking([{ id: 'r1', kind: 'EVIDENCE', payload: { content: '資安事件與資料外洩同時發生' } }]);
  assert.deepEqual(flagged, []);
});
