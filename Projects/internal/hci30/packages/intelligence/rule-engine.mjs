import { createHash } from 'node:crypto';
import { RANK_BAND } from './band-scale.mjs';

// HCI_RULE_ENGINE_SPEC.md's worked mechanism: a versioned, deterministic
// keyword table -- operator-delegated starting policy (see that spec's own
// Status section), not an empirically derived model. Every entry is
// independently revisable; adding a keyword needs no regex literacy.
export const RULE_ENGINE_METHOD_ID = 'rule_engine_v1';
const BASELINE_RANK = 3; // MODERATE

// delta is a signed shift in band-RANK units (1..5), not a raw score --
// -2/+2 reserved for a single severe/strong indicator, -1/+1 for an
// ordinary one. keywords are plain-language substrings (zh-Hant + EN),
// case-insensitive, matched literally (no regex) so every match is
// trivially explainable to the operator reading the rationale next to it.
export const RULES = Object.freeze([
  { id: 'fraud_indicator', dimension: 'INTEGRITY_CONSISTENCY', delta: -2,
    keywords: ['造假', '詐欺', '舞弊', 'fraud', 'falsif'],
    rationale: '證據內容提及造假或詐欺相關字眼，對誠信與一致性是嚴重負面指標。' },
  { id: 'inconsistent_statement', dimension: 'INTEGRITY_CONSISTENCY', delta: -1,
    keywords: ['前後不一', '說法矛盾', '自相矛盾', 'inconsistent statement', 'contradict'],
    rationale: '證據內容提及說法前後矛盾，代表誠信與一致性存在疑慮。' },
  { id: 'contract_breach', dimension: 'RELIABILITY_FULFILLMENT', delta: -1,
    keywords: ['違約', '逾期未繳', '逾期交付', 'breach of contract', 'late delivery', 'delinquent'],
    rationale: '證據內容提及違約或逾期履約，直接反映可靠度與履約能力不足。' },
  { id: 'bankruptcy', dimension: 'RELIABILITY_FULFILLMENT', delta: -2,
    keywords: ['破產', '無力清償', 'bankrupt', 'insolven'],
    rationale: '破產或無力清償是對履約能力最嚴重的負面指標。' },
  { id: 'on_time_delivery', dimension: 'RELIABILITY_FULFILLMENT', delta: 1,
    keywords: ['準時交付', '履約良好', 'on-time delivery', 'delivered on schedule'],
    rationale: '證據內容顯示準時交付或履約紀錄良好，是可靠度的正面指標。' },
  { id: 'quality_defect', dimension: 'COMPETENCE', delta: -1,
    keywords: ['重大瑕疵', '品質缺失', 'major defect', 'quality failure'],
    rationale: '證據內容提及重大品質缺失，反映專業能力不足。' },
  { id: 'certification', dimension: 'COMPETENCE', delta: 1,
    keywords: ['得獎', '認證通過', 'certified', 'award-winning'],
    rationale: '證據內容顯示取得獎項或專業認證，是專業能力的正面指標。' },
  { id: 'unresponsive', dimension: 'COMMUNICATION_QUALITY', delta: -1,
    keywords: ['已讀不回', '失聯', '拒絕回應', 'unresponsive', 'unreachable', 'went silent'],
    rationale: '證據內容提及失聯或不回應，反映溝通品質不佳。' },
  { id: 'unauthorized_access', dimension: 'BOUNDARY_RESPECT', delta: -1,
    keywords: ['越權', '未經授權存取', 'unauthorized access', 'overstepped'],
    rationale: '證據內容提及越權或未經授權的行為，反映界線尊重不足。' },
  { id: 'unilateral_change', dimension: 'RECIPROCITY_FAIRNESS', delta: -1,
    keywords: ['片面修改', '單方面變更條款', 'unilateral', 'without consent'],
    rationale: '證據內容提及片面修改條款，反映互惠與公平存在疑慮。' },
  { id: 'proactive_resolution', dimension: 'CONFLICT_REPAIR', delta: 1,
    keywords: ['主動道歉', '主動修正', 'proactively resolved', 'proactive apology'],
    rationale: '證據內容顯示主動道歉或修正問題，是衝突修復能力的正面指標。' },
  { id: 'refuse_to_engage', dimension: 'CONFLICT_REPAIR', delta: -1,
    keywords: ['拒絕溝通', '拒絕協商', 'refuse to engage', 'refused to negotiate'],
    rationale: '證據內容提及拒絕溝通或協商，反映衝突修復能力不足。' },
  { id: 'coercion', dimension: 'POWER_BEHAVIOR', delta: -2,
    keywords: ['施壓', '威脅', '脅迫', 'coercion', 'threat'],
    rationale: '施壓、威脅或脅迫是權力行為最嚴重的負面指標。' },
  { id: 'conflict_of_interest', dimension: 'INCENTIVE_ALIGNMENT', delta: -1,
    keywords: ['利益衝突', 'conflict of interest'],
    rationale: '證據內容提及利益衝突，反映誘因一致性存在疑慮。' },
  { id: 'blame_shifting', dimension: 'RISK_EXTERNALIZATION', delta: -1,
    keywords: ['轉嫁責任', '推卸責任', 'blame-shifting', 'passed the risk'],
    rationale: '證據內容提及轉嫁或推卸責任，反映風險外部化傾向。' },
  { id: 'data_breach', dimension: 'INFORMATION_GOVERNANCE', delta: -2,
    keywords: ['資安事件', '資料外洩', 'data breach', 'security incident'],
    rationale: '資安事件或資料外洩是資訊治理最嚴重的負面指標。' },
  { id: 'regulatory_fine', dimension: 'INFORMATION_GOVERNANCE', delta: -2,
    keywords: ['監理裁罰', '主管機關裁罰', 'regulatory fine', 'regulatory sanction'],
    rationale: '遭主管機關裁罰反映已發生的資訊治理風險。' },
  { id: 'security_certification', dimension: 'INFORMATION_GOVERNANCE', delta: 1,
    keywords: ['soc2', 'iso 27001', '資安認證'],
    rationale: '取得資安相關認證是資訊治理的正面指標。' },
  { id: 'process_improvement', dimension: 'LEARNING_ADAPTABILITY', delta: 1,
    keywords: ['導入改善措施', '流程改善', 'implemented improvement', 'process improvement'],
    rationale: '證據內容顯示導入改善措施，是學習與應變能力的正面指標。' },
  { id: 'executive_turnover', dimension: 'CONTEXT_STABILITY', delta: -1,
    keywords: ['高層異動', '經營層變動', 'executive turnover', 'leadership change'],
    rationale: '高層異動反映情境穩定度存在變數。' },
  { id: 'ownership_dispute', dimension: 'CONTEXT_STABILITY', delta: -1,
    keywords: ['股權糾紛', '股東爭議', 'ownership dispute', 'shareholder dispute'],
    rationale: '股權或股東爭議反映情境穩定度存在變數。' },
  { id: 'last_minute_change', dimension: 'PREDICTABILITY', delta: -1,
    keywords: ['臨時變更', '朝令夕改', 'last-minute change', 'sudden change of plan'],
    rationale: '證據內容提及臨時變更或朝令夕改，反映可預測性不足。' },
]);

// Operator, 2026-09-12 ("HC 缺點...C2...規則集版本號"): a frozen report
// snapshot already stores the VALUE a finding produced, but not which
// revision of RULES produced it. A hand-maintained version string relies on
// a human remembering to bump it every time RULES changes -- exactly the
// kind of discipline-dependent mechanism this schema avoids elsewhere
// (system_recorded_at is server-computed, not app-supplied, for the same
// reason). Hashing RULES itself instead: it changes automatically and
// unforgeably the moment a keyword/delta/rationale is edited, with nothing
// for a human to remember.
export const RULE_SET_VERSION = createHash('sha256').update(JSON.stringify(RULES)).digest('hex').slice(0, 12);

// Operator, 2026-09-12 ("HC 缺點...C2...無否定詞判斷"): literal substring
// matching cannot distinguish "調查後排除了詐欺疑慮" from "證實涉及詐欺" --
// both contain "詐欺". This is a bounded heuristic, not a semantic parser:
// if a negation cue appears within NEGATION_WINDOW_CHARS characters before
// a matched keyword, that occurrence is excluded from scoring. It does NOT
// solve negation in general -- a cue further away, a double negative, or a
// negation *after* the keyword ("詐欺，但已排除") all still slip through.
// Disclosed here and in HCI_RULE_ENGINE_SPEC.md, not oversold as a fix.
const NEGATION_CUES = [
  '排除', '沒有', '並非', '未證實', '否認', '駁回', '不成立', '無法證實', '未發現', '未涉及', '不存在',
  'not ', 'no evidence of', 'denied', 'ruled out', 'unsubstantiated', 'did not ', 'never ',
];
const NEGATION_WINDOW_CHARS = 15;

// Scans every occurrence of one keyword (not just the first) in already-
// lowercased text, classifying each as matched or negated by what
// immediately precedes it. A keyword appearing twice -- once negated, once
// not -- is correctly `matched: true` overall (real signal exists
// somewhere in the text), not silently dropped because one occurrence was
// negated.
function keywordOccurrences(lowerText, keywordLower) {
  let matched = false;
  let negated = false;
  let idx = lowerText.indexOf(keywordLower);
  while (idx !== -1) {
    const windowStart = Math.max(0, idx - NEGATION_WINDOW_CHARS);
    const window = lowerText.slice(windowStart, idx);
    if (NEGATION_CUES.some((cue) => window.includes(cue))) negated = true;
    else matched = true;
    idx = lowerText.indexOf(keywordLower, idx + 1);
  }
  return { matched, negated };
}

// One text can match multiple rules (including multiple rules on the same
// dimension -- e.g. a data breach AND a regulatory fine in one EVIDENCE).
// Pure function: same input always produces the same output. Return shape
// unchanged from before negation-awareness landed (a plain array of RULES
// entries) -- negation filtering happens inside, transparent to every
// existing caller; matchNegatedRules() below is the new, separate way to
// see what got excluded.
export function matchRules(text) {
  if (typeof text !== 'string' || text === '') return [];
  const lower = text.toLowerCase();
  return RULES.filter((rule) => rule.keywords.some((k) => keywordOccurrences(lower, k.toLowerCase()).matched));
}

// The negation-window's other half: rules whose keyword is textually
// present but EVERY occurrence was negated (so matchRules did not count
// it). Never overlaps matchRules's result for the same text -- a rule with
// at least one non-negated occurrence is `matched`, not `negated`, by
// keywordOccurrences() above.
export function matchNegatedRules(text) {
  if (typeof text !== 'string' || text === '') return [];
  const lower = text.toLowerCase();
  return RULES.filter((rule) => {
    const statuses = rule.keywords.map((k) => keywordOccurrences(lower, k.toLowerCase()));
    return !statuses.some((s) => s.matched) && statuses.some((s) => s.negated);
  });
}

// Operator, 2026-09-12 ("HC 缺點...C3...規則透明=可被針對性操弄"): the
// same transparency that makes every score explainable also lets someone
// who knows the keyword table word evidence to trigger or dodge specific
// rules. This does not resolve that tension (operator explicitly chose
// explainability over opacity) -- it only gives a human reviewer a signal:
// one EVIDENCE/CLAIM text matching an unusually high number of DISTINCT
// rules is worth a second look, not proof of manipulation on its own.
const STACKING_THRESHOLD = 3;

export function detectKeywordStacking(records) {
  const flagged = [];
  for (const record of records) {
    const text = record.payload && typeof record.payload.content === 'string' ? record.payload.content : '';
    const distinctRuleIds = [...new Set(matchRules(text).map((rule) => rule.id))];
    if (distinctRuleIds.length >= STACKING_THRESHOLD) {
      flagged.push({ record_id: record.id, rule_count: distinctRuleIds.length, rule_ids: distinctRuleIds });
    }
  }
  return flagged;
}

// Given records ({id, kind, payload}) already filtered by the caller to
// EVIDENCE/CLAIM, returns one rule-engine finding per dimension any rule
// matched (HCI_RULE_ENGINE_SPEC.md §Aggregation: sum every matching rule's
// delta across every matching record, baseline rank 3, clamp [1,5]) plus
// the raw hit list per dimension for the "文字說明和分析緣由" UI
// requirement -- the finding's own {method_id, value, evidence_refs} shape
// alone cannot carry rationale text, so hits travel alongside it, not
// inside it.
// negatedHitsByDimension is additive to the pre-existing return shape (a
// new key, not a change to `findings`/`hitsByDimension`) -- a negation-only
// match never creates a finding on its own, same as zero matches at all;
// it only surfaces so a human reviewer can see "the keyword was there but
// excluded", per operator instruction not to silently drop it.
export function scoreRuleEngineFindings(records) {
  const byDimension = new Map();
  const negatedByDimension = new Map();
  for (const record of records) {
    const text = record.payload && typeof record.payload.content === 'string' ? record.payload.content : '';
    const hits = matchRules(text);
    for (const rule of hits) {
      const entry = byDimension.get(rule.dimension) || { deltaSum: 0, hits: [], evidenceRefs: new Set() };
      entry.deltaSum += rule.delta;
      entry.hits.push({ rule_id: rule.id, record_id: record.id, delta: rule.delta, rationale: rule.rationale });
      entry.evidenceRefs.add(record.id);
      byDimension.set(rule.dimension, entry);
    }
    for (const rule of matchNegatedRules(text)) {
      const list = negatedByDimension.get(rule.dimension) || [];
      list.push({ rule_id: rule.id, record_id: record.id, rationale: rule.rationale });
      negatedByDimension.set(rule.dimension, list);
    }
  }

  const findings = [];
  const hitsByDimension = {};
  for (const [dimension, entry] of byDimension) {
    const rank = Math.min(5, Math.max(1, BASELINE_RANK + entry.deltaSum));
    findings.push({ method_id: RULE_ENGINE_METHOD_ID, dimension, value: RANK_BAND[rank - 1], evidence_refs: [...entry.evidenceRefs] });
    hitsByDimension[dimension] = entry.hits;
  }
  const negatedHitsByDimension = Object.fromEntries(negatedByDimension);
  return { findings, hitsByDimension, negatedHitsByDimension };
}
