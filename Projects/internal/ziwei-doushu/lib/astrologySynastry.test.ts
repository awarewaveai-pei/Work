import { describe, it, expect } from 'vitest';
import { synastryAspects } from './astrologySynastry';
import { computeSynastry } from './astrology';
import { synastryContext, MAX_CONTEXT_FACTS } from './astrologyView';

describe('synastryAspects', () => {
  it('只算跨盤配對,不含盤內;同名星體各自獨立', () => {
    const res = synastryAspects(
      [{ body: 'sun', longitude: 10 }, { body: 'mars', longitude: 10 }],
      [{ body: 'sun', longitude: 11 }],
    );
    expect(res.map((x) => [x.a, x.b])).toEqual([['sun', 'sun'], ['mars', 'sun']]);
  });

  it('不判入相/出相(即使給了速度)', () => {
    const [a] = synastryAspects([{ body: 'mars', longitude: 0, speed: 1 }], [{ body: 'venus', longitude: 2, speed: 5 }]);
    expect(a.applying).toBeNull();
  });

  it('容許度沿用本命:日月加寬 1.5°(7.5° 合相成立)', () => {
    expect(synastryAspects([{ body: 'sun', longitude: 0 }], [{ body: 'mars', longitude: 7.5 }])).toHaveLength(1);
    expect(synastryAspects([{ body: 'venus', longitude: 0 }], [{ body: 'mars', longitude: 7.5 }])).toHaveLength(0);
  });
});

describe('computeSynastry + synastryContext', () => {
  const birth = { year: 2000, month: 1, day: 1, hour: 12, minute: 0, tzOffsetHours: 0, lat: 51.48, lon: 0 };
  const s = computeSynastry(birth, { ...birth, year: 1995, month: 6, day: 15 });

  it('同一生辰對自己:十二星體兩兩合相、偏離 0', () => {
    const self = computeSynastry(birth, birth);
    const exact = self.aspects.filter((a) => a.a === a.b);
    expect(exact).toHaveLength(12);
    for (const a of exact) expect(a).toMatchObject({ aspect: 'conjunction', orb: 0 });
  });

  it('context 獨立且不超過 interpret route 上限', () => {
    for (const locale of ['zh-TW', 'en'] as const) {
      const ctx = synastryContext(s, locale);
      expect(ctx.facts.length).toBeLessThanOrEqual(MAX_CONTEXT_FACTS);
      expect(ctx.facts.length).toBe(Math.min(MAX_CONTEXT_FACTS, 2 + s.aspects.length));
      for (const f of ctx.facts) {
        expect(f.label.length).toBeLessThanOrEqual(60);
        expect(f.value.length).toBeLessThanOrEqual(300);
      }
    }
  });
});
