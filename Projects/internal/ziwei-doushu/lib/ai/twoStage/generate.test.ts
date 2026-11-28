import { describe, it, expect } from 'vitest';
import { checkFacts } from './factCheck';
import { generateBrief, validateBrief } from './generate';
import { CLOSING_HEADING } from './prompts';
import type { Llm, ReadingPlan } from './types';
import { ZIWEI_VOCAB } from '@/lib/ziwei/twoStage';

const plan: ReadingPlan = {
  systemId: 'ziwei',
  locale: 'zh-TW',
  headline: '天府 · 火六局',
  sections: ['命格特質', '感情婚姻', '事業財富', '健康', '人際貴人', '今年運勢'],
  briefFacts: [
    { id: '宮:命宮', value: '天府（廟）：穩重保守，善於守成。' },
    { id: '宮:夫妻', value: '武曲（平）化權、破軍（平）：感情需磨合。' },
    { id: 'yearly:化忌', value: '流年丙干廉貞化忌，入本命遷移宮（未），即流年父母宮。農曆2026年。' },
    { id: 'pattern:金輿扶駕格', value: '本命成金輿扶駕格：紫微得左右輔佐。' },
  ],
  bonus: { heading: '格局精讀：金輿扶駕格', factIds: ['pattern:金輿扶駕格'] },
  hooks: [
    { key: 'H1', factId: 'yearly:化忌', fact: '…' },
    { key: 'H2', factId: 'pattern:金輿扶駕格', fact: '…' },
  ],
  paidList: [],
  chapters: [],
};

/** 合格的簡批:六段各點名一顆 facts 裡的星,免費段與兩個鉤子齊全。 */
function brief(over: Partial<Record<string, string>> = {}): string {
  const body: Record<string, string> = {
    // 「紫微斗數」是學問名,不是提到紫微星(facts 沒有紫微也要過)
    命格特質: '從紫微斗數看,命宮天府坐廟,穩重。',
    感情婚姻: '夫妻宮武曲化權、破軍,需磨合。',
    事業財富: '天府守成,宜穩健。',
    健康: '天府之人作息宜規律。',
    人際貴人: '破軍帶來變動的人脈。',
    今年運勢: '2026年廉貞化忌入遷移宮,外出宜謹慎。',
    ...over,
  };
  return [
    ...plan.sections.map((s) => `## ${s}\n${body[s]}`),
    `## ${plan.bonus!.heading}\n金輿扶駕格,紫微得輔。`,
    `## ${CLOSING_HEADING}\n- 〔H1〕遷移宮那顆廉貞化忌。\n- 〔H2〕金輿扶駕格要等到哪一年?`,
  ].join('\n\n');
}

describe('事實核對器', () => {
  it('合格簡批全部對得到 facts', () => {
    expect(checkFacts(brief(), plan.briefFacts, ZIWEI_VOCAB)).toEqual({ ok: true, unsupported: [] });
  });

  it('擋下捏造:facts 沒有的星、四化組合、格局、年份', () => {
    const r = checkFacts(
      brief({ 健康: '天府坐命,但七殺會照,太陽化忌入疾厄,成君臣慶會格,2031年要小心。' }),
      plan.briefFacts,
      ZIWEI_VOCAB,
    );
    expect(r.ok).toBe(false);
    expect([...r.unsupported].sort()).toEqual(['七殺', '太陽', '君臣慶會格', '太陽化忌', '2031'].sort());
  });
});

describe('簡批結構', () => {
  it('六段、免費段、鉤子齊全 → 無錯', () => {
    expect(validateBrief(brief(), plan, ZIWEI_VOCAB)).toEqual([]);
  });

  it('少一段、段落沒有星曜依據、鉤子多寫或漏寫 → 各自報錯', () => {
    expect(validateBrief(brief().replace('## 健康\n', ''), plan, ZIWEI_VOCAB)[0]).toMatch(/^headings/);
    expect(validateBrief(brief({ 健康: '作息規律最重要。' }), plan, ZIWEI_VOCAB)).toEqual(['section 健康: no star cited']);
    expect(validateBrief(brief().replace('- 〔H2〕', '- '), plan, ZIWEI_VOCAB)[0]).toMatch(/^hooks/);
    expect(validateBrief(`${brief()}\n- 〔H3〕多寫的一項`, plan, ZIWEI_VOCAB)[0]).toMatch(/^hooks/);
  });

  it('generateBrief:合格 → 去掉鉤子標記回傳;捏造 → unsupported_claims,不回文字', async () => {
    const usage = { model: 'gpt-6-luna', input: 1, cachedInput: 0, output: 1 };
    const good: Llm = async () => ({ text: brief(), usage });
    const r = await generateBrief(plan, good, ZIWEI_VOCAB);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).not.toMatch(/〔H\d〕/);
    const lying: Llm = async () => ({ text: brief({ 健康: '天府坐命,七殺會照。' }), usage });
    const bad = await generateBrief(plan, lying, ZIWEI_VOCAB);
    expect(bad).toMatchObject({ ok: false, error: 'unsupported_claims', detail: ['七殺'] });
    expect('text' in bad).toBe(false);
  });
});
