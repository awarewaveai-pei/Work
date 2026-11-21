import { describe, it, expect } from 'vitest';
import { computeChart } from '@/lib/ziwei';
import { analyzeZiwei, detectPatterns } from './analyze';
import { toContext } from '@/lib/divination/systems/ziwei';
import { STAR_NOTES, MUTAGEN_BRIEF, GOD12_SETS, GOD12_NOTES, starBrief } from './stars';
import { toTraditional } from '@/lib/s2t';

const birth = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30,
  gender: '女' as const, calendar: 'solar' as const, isLeapMonth: false,
  place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Etc/GMT-8' }, trueSolar: true,
};

describe('紫微頂規分析引擎', () => {
  const r = computeChart({ ...birth, locale: 'zh-TW' });
  const a = analyzeZiwei(r.astrolabe);

  it('格局判定:回傳已知格局(金輿扶駕/坐貴向貴)', () => {
    // 此盤天府在命、天相在官祿,不合府相朝垣「府居官祿、相居財帛」口徑(Z2 收窄),不報
    const names = a.patterns.map((p) => p.name);
    expect(names).toContain('金輿扶駕格');
    expect(names).not.toContain('府相朝垣格');
    expect(names).toContain('坐貴向貴格');
    for (const p of a.patterns) {
      expect(p.desc.length).toBeGreaterThan(10);
      expect(['auspicious', 'inauspicious', 'neutral']).toContain(p.kind);
    }
  });

  it('亮度吉凶指數:亮度 0–100、吉凶 0–100%、吉煞訊號分類', () => {
    expect(a.brightness.brightnessIndex).toBeGreaterThanOrEqual(0);
    expect(a.brightness.brightnessIndex).toBeLessThanOrEqual(100);
    expect(a.brightness.fortuneIndex).not.toBeNull();
    // 此盤三方四正含羊陀火鈴 → 有煞訊號
    expect(a.brightness.unluckySignals.length).toBeGreaterThan(0);
  });

  it('飛宮四化:結構化「源宮化X入目標宮」+ 領域分類', () => {
    expect(a.flying.length).toBeGreaterThan(0);
    const sample = a.flying[0];
    expect(sample.flow).toMatch(/宮化[祿權科忌]/);
    expect(sample.domain.length).toBeGreaterThan(0);
    expect(sample.meaning.length).toBeGreaterThan(0);
  });

  it('丹墀桂墀(brightness 格局)在合適盤命中', () => {
    const r2 = computeChart({ year: 1990, month: 3, day: 21, hour: 8, minute: 0, gender: '男', calendar: 'solar', locale: 'zh-TW' });
    expect(detectPatterns(r2.astrolabe).map((p) => p.name)).toContain('丹墀桂墀格');
  });

  it('十二宮逐星:每宮有星處皆有知識庫斷語、含主星名與宮職象意', () => {
    const pr = a.palaceReadings;
    expect(pr.length).toBe(12);
    // 命宮必有解讀(命宮幾乎必有主星或借星)
    const ming = pr.find((p) => p.palace === '命宮');
    expect(ming).toBeDefined();
    expect(ming!.readings.length).toBeGreaterThan(0);
    // 每條斷語非空、夠長(非空泛一詞)
    for (const p of pr) {
      for (const line of p.readings) {
        expect(line.length).toBeGreaterThan(8);
        expect(line).toMatch(/：/); // 「星名：斷語」結構
      }
    }
    // 借對宮的宮位:borrowed=true 且斷語以「借」起
    const borrowed = pr.filter((p) => p.borrowed && p.readings.length);
    for (const p of borrowed) {
      expect(p.readings[0].startsWith('借')).toBe(true);
    }
  });

  it('toContext 帶 analysis 時注入格局/亮度/飛化/逐宮 facts + headline 含格局', () => {
    const h = undefined;
    const ctx = toContext(r, 'zh-TW', h, a);
    expect(ctx.facts.some((f) => f.label.startsWith('格局:'))).toBe(true);
    expect(ctx.facts.some((f) => f.label === '主星亮度指數')).toBe(true);
    expect(ctx.facts.some((f) => f.label.startsWith('飛化:'))).toBe(true);
    expect(ctx.facts.some((f) => f.label.startsWith('宮:'))).toBe(true); // 逐宮逐星
    expect(ctx.facts.length).toBeLessThanOrEqual(60); // route MAX_FACTS
    expect(ctx.facts.every((f) => f.value.length <= 300)).toBe(true); // route 上限
    expect(ctx.headline).toContain('金輿扶駕格');
  });

  it('toContext 不帶 analysis 時無頂規 facts(compute 預設不帶,維持確定性)', () => {
    const ctx = toContext(r, 'zh-TW');
    expect(ctx.facts.some((f) => f.label.startsWith('格局:'))).toBe(false);
  });
});

describe('酉宮主星亮度(iztro 2.6.1 修正)', () => {
  const youStar = (y: number, m: number, d: number, hour: number, star: string) =>
    computeChart({ year: y, month: m, day: d, hour, minute: 30, gender: '女', calendar: 'solar', locale: 'zh-TW' })
      .astrolabe.palaces.find((p) => p.earthlyBranch === '酉')
      ?.majorStars.find((s) => s.name === star)?.brightness;

  it('太陽在酉 = 平(舊版陷)', () => expect(youStar(2023, 12, 31, 10, '太陽')).toBe('平'));
  it('太陰在酉 = 旺(舊版不)', () => expect(youStar(2023, 4, 5, 10, '太陰')).toBe('旺'));
  it('七殺在酉 = 旺(舊版廟)', () => expect(youStar(1990, 3, 21, 4, '七殺')).toBe('旺'));
});

describe('星曜一句要點(Z3)', () => {
  it('盤上出現的每顆星、每組十二神都查得到要點(8 張盤);同名十二神依組別各有其義', () => {
    const missing = new Set<string>();
    for (const [y, hour, gender] of [[1950, 0, '男'], [1963, 5, '女'], [1977, 9, '男'], [1984, 13, '女'], [1991, 17, '男'], [2000, 21, '女'], [2008, 3, '男'], [2016, 11, '女']] as const) {
      const a = computeChart({ year: y, month: 5, day: 9, hour, minute: 0, gender, calendar: 'solar', locale: 'zh-TW' }).astrolabe;
      for (const p of a.palaces) {
        for (const s of [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]) {
          if (!starBrief(String(s.name))) missing.add(String(s.name));
        }
        for (const [field] of GOD12_SETS) {
          if (!GOD12_NOTES[field][String(p[field])]) missing.add(`${field}:${String(p[field])}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
    expect(GOD12_NOTES.boshi12['大耗']).not.toBe(GOD12_NOTES.suiqian12['大耗']);
    expect(GOD12_NOTES.boshi12['病符']).not.toBe(GOD12_NOTES.suiqian12['病符']);
  });

  it('要點全為繁體、標點全形', () => {
    const all = [
      ...Object.values(STAR_NOTES).map((x) => x.note + x.group),
      ...Object.values(GOD12_NOTES).flatMap((g) => Object.values(g)),
      ...Object.values(MUTAGEN_BRIEF),
    ];
    for (const t of all) {
      expect(toTraditional(t)).toBe(t);
      expect(t).not.toMatch(/[,:;]/); // 標點一律全形
    }
  });

  it('toContext 附命宮三方四正的星要 facts,整條收不切半句', () => {
    const r = computeChart({ ...birth, locale: 'zh-TW' });
    const ctx = toContext(r, 'zh-TW', undefined, analyzeZiwei(r.astrolabe));
    const notes = ctx.facts.filter((f) => f.label.startsWith('星要:'));
    expect(notes.map((f) => f.label)).toEqual(['星要:命宮', '星要:財帛', '星要:官祿', '星要:遷移']);
    const soul = analyzeZiwei(r.astrolabe).palaceReadings.find((p) => p.palace === '命宮')!;
    for (const part of notes[0].value.split('；')) expect(soul.starNotes).toContain(part);
    expect(notes[0].value).toContain('天魁：'); // 此盤命宮坐天魁
  });
});
