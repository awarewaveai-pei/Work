import { describe, expect, it } from 'vitest';
import { determineJu, yuanOf } from './ju';

/**
 * 「陰陽遁十八局」定局歌(傳統口訣,如《奇門遁甲統宗》所載):
 * 每句 = 節氣 + 上中下元局數。此處逐字照口訣解析,與 ju.ts 的表各自獨立寫成。
 */
const VERSE = [
  '冬至驚蟄一七四', '小寒二八五', '大寒春分三九六', '立春八五二', '雨水九六三',
  '清明立夏四一七', '穀雨小滿五二八', '芒種六三九',
  '夏至白露九三六', '小暑八二五', '大暑秋分七一四', '立秋二五八', '處暑一四七',
  '寒露立冬六九三', '霜降小雪五八二', '大雪四七一',
];
const NUM = '一二三四五六七八九';
const YANG = new Set(['冬至', '小寒', '大寒', '立春', '雨水', '驚蟄', '春分', '清明', '穀雨', '立夏', '小滿', '芒種']);

const expected = new Map<string, number[]>();
for (const line of VERSE) {
  const nums = [...line.slice(-3)].map((c) => NUM.indexOf(c) + 1);
  const terms = line.slice(0, -3);
  for (let i = 0; i < terms.length; i += 2) expected.set(terms.slice(i, i + 2), nums);
}

describe('拆補法定局', () => {
  it('符頭定元:甲子/己卯 上、甲寅/己亥 中、甲辰/己未 下;非符頭日取前一個甲己日', () => {
    expect(yuanOf('甲子')).toEqual({ futou: '甲子', yuan: 'upper' });
    expect(yuanOf('癸酉')).toEqual({ futou: '己巳', yuan: 'middle' });
    expect(yuanOf('己卯')).toEqual({ futou: '己卯', yuan: 'upper' });
    expect(yuanOf('丁亥')).toEqual({ futou: '甲申', yuan: 'middle' });
    expect(yuanOf('辛酉')).toEqual({ futou: '己未', yuan: 'lower' });
    expect(yuanOf('癸亥')).toEqual({ futou: '己未', yuan: 'lower' });
  });

  it('二十四節氣 × 上中下元 皆與口訣一致(2025 年逐日抽樣中午)', () => {
    expect(expected.size).toBe(24);
    const seen = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const s = new Date(Date.UTC(2025, 0, 1 + d));
      const r = determineJu({ year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate(), hour: 12, minute: 0 });
      const want = expected.get(r.jieqi.name);
      expect(want, r.jieqi.name).toBeDefined();
      expect(r.ju).toBe(want![['upper', 'middle', 'lower'].indexOf(r.yuan)]);
      expect(r.dun).toBe(YANG.has(r.jieqi.name) ? 'yang' : 'yin');
      seen.add(`${r.jieqi.name}${r.yuan}`);
    }
    expect(seen.size).toBe(72);
  });

  it('交節前後一分鐘換節氣(2024 冬至 12-21 17:20:35 交節,陰轉陽)', () => {
    const before = determineJu({ year: 2024, month: 12, day: 21, hour: 17, minute: 20 });
    const after = determineJu({ year: 2024, month: 12, day: 21, hour: 17, minute: 21 });
    expect(before.jieqi.name).toBe('大雪');
    expect(after.jieqi.name).toBe('冬至');
    expect(before.futou).toBe(after.futou);
    expect(before.dun).toBe('yin');
    expect(after.dun).toBe('yang');
    expect(after.jieqi.at).toBe('2024-12-21 17:20');
  });

  it('23:00 起換日:日柱與符頭隨之換', () => {
    const r = determineJu({ year: 2024, month: 1, day: 1, hour: 23, minute: 30 });
    expect(r.pillars.day).toBe('乙丑');
    expect(r.pillars.hour).toBe('丙子');
  });
});
