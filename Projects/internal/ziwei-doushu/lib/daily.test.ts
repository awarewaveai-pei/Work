import { describe, it, expect } from 'vitest';
import { computeDailyAlmanac, computeDailyFortune, dailyCacheKey, dailyContext } from './daily';

const birth = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30,
  gender: '女' as const, calendar: 'solar' as const,
};

describe('每日運勢工廠', () => {
  const f = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'zh-TW');

  it('丙日身弱 → 真喜用神(扶抑法)首位=木 → 幸運色綠/青、方位東、數字3/8', () => {
    expect(f.strength).toBe('身弱');
    expect(f.luckyElement).toBe(f.favorable[0]); // 由真喜用神決定,非恆取印
    expect(f.luckyElement).toBe('木');
    expect(f.luckyColors).toEqual(['綠', '青']);
    expect(f.luckyNumbers).toEqual([3, 8]);
    expect(f.luckyDirection).toBe('東');
  });

  it('命局摘要欄位帶入(供 AI 文案)', () => {
    expect(f.dayMaster).toBe('丙');
    expect(f.pattern).toBe('偏財格');
    expect(f.favorable.length).toBeGreaterThan(0);
  });

  it('dailyContext → systemId=bazi、headline 今日 + 含評分/宜忌 facts', () => {
    const ctx = dailyContext(f, 'zh-TW');
    expect(ctx.systemId).toBe('bazi');
    expect(ctx.headline).toContain(f.date);
    expect(ctx.facts.find((x) => x.label === 'favorable')?.value).toBeTruthy();
    expect(ctx.facts.some((x) => x.label === 'scoreOverall')).toBe(true);
  });

  it('英文 locale → 幸運色/方位在地化', () => {
    const fe = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'en');
    expect(fe.luckyColors).toEqual(['Green', 'Teal']);
    expect(fe.luckyDirection).toBe('East');
  });

  it('所有評分落在 1–5', () => {
    for (const s of Object.values(f.scores)) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(5);
    }
  });

  it('確定性:同人同日同語言結果一致(可快取)', () => {
    const g = computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'zh-TW');
    expect(g).toEqual(f);
  });

  it('宜忌來自黃曆(非空)', () => {
    expect(f.yi.length).toBeGreaterThan(0);
    expect(f.ji.length).toBeGreaterThan(0);
  });

  it('快取鍵含 chart+date+locale', () => {
    expect(dailyCacheKey('abc', '2026-06-24', 'en')).toBe('abc|2026-06-24|en');
  });
});

describe('當日黃曆(computeDailyAlmanac)', () => {
  it('2026-06-24 全部新欄位(繁中)', () => {
    expect(computeDailyAlmanac({ year: 2026, month: 6, day: 24 }, 'zh-TW')).toMatchInlineSnapshot(`
      {
        "clash": {
          "animal": "豬",
          "ganZhi": "癸亥",
          "sha": "東",
        },
        "fetusGod": "占門床 外正南",
        "gods": {
          "fortune": "正北",
          "joy": "東北",
          "wealth": "正北",
        },
        "ji": [
          "安床",
          "祈福",
          "出行",
          "安葬",
          "行喪",
          "開光",
        ],
        "luckyGods": [
          "四相",
          "王日",
          "玉宇",
        ],
        "mansion": {
          "auspicious": true,
          "name": "軫水蚓",
        },
        "nineStar": "四綠木",
        "officer": "閉",
        "pengZu": [
          "己不破券二比並亡",
          "巳不遠行財物伏藏",
        ],
        "unluckyGods": [
          "游禍",
          "血支",
          "重日",
          "元武",
        ],
        "yi": [
          "嫁娶",
          "合帳",
          "裁衣",
          "冠笄",
          "伐木",
          "上梁",
          "出火",
          "拆卸",
          "移徙",
          "修造",
          "動土",
          "安門",
          "納財",
          "築堤",
          "栽種",
          "塞穴",
        ],
      }
    `);
  });

  it('2026-06-24 英文:有通行英譯的譯出,其餘保留繁中', () => {
    const a = computeDailyAlmanac({ year: 2026, month: 6, day: 24 }, 'en');
    expect([a.nineStar, a.mansion.name, a.officer, a.clash.animal, a.clash.sha, a.gods.joy]).toMatchInlineSnapshot(`
      [
        "Four Green (Wood)",
        "Chariot (軫)",
        "Close",
        "Pig",
        "East",
        "Northeast",
      ]
    `);
  });

  it('改正字:胃宿動物作雉(庫作彘)', () => {
    expect(computeDailyAlmanac({ year: 2026, month: 1, day: 24 }, 'zh-TW').mansion.name).toBe('胃土雉');
  });
  it('改正字:壁宿動物作貐(庫作獝)', () => {
    expect(computeDailyAlmanac({ year: 2026, month: 1, day: 21 }, 'zh-TW').mansion.name).toBe('壁水貐');
  });
  it('改正字:彭祖百忌「壬不汲水」(庫作泱)', () => {
    expect(computeDailyAlmanac({ year: 2026, month: 1, day: 8 }, 'zh-TW').pengZu[0]).toBe('壬不汲水更難提防');
  });

  it('dailyContext 加黃曆後仍在 60 條、每條 300 字以內', () => {
    const ctx = dailyContext(computeDailyFortune(birth, { year: 2026, month: 6, day: 24 }, 'zh-TW'), 'zh-TW');
    expect(ctx.facts.length).toBeLessThanOrEqual(60);
    expect(ctx.facts.every((x) => x.label.length <= 60 && x.value.length <= 300)).toBe(true);
    expect(ctx.facts.some((x) => x.label === 'almanacOfficer')).toBe(true);
  });
});
