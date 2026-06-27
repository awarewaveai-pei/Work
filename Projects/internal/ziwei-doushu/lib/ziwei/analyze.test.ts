import { describe, it, expect } from 'vitest';
import { computeChart } from '@/lib/ziwei';
import { analyzeZiwei, detectPatterns } from './analyze';
import { toContext } from '@/lib/divination/systems/ziwei';

const birth = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30,
  gender: '女' as const, calendar: 'solar' as const, isLeapMonth: false,
  trueSolar: { longitude: 121.5, tzOffsetHours: 8 },
};

describe('紫微頂規分析引擎', () => {
  const r = computeChart({ ...birth, locale: 'zh-TW' });
  const a = analyzeZiwei(r.astrolabe);

  it('格局判定:回傳已知格局(府相朝垣/坐貴向貴)', () => {
    const names = a.patterns.map((p) => p.name);
    expect(names).toContain('府相朝垣格');
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

  it('toContext 帶 analysis 時注入格局/亮度/飛化 facts + headline 含格局', () => {
    const h = undefined;
    const ctx = toContext(r, 'zh-TW', h, a);
    expect(ctx.facts.some((f) => f.label.startsWith('格局:'))).toBe(true);
    expect(ctx.facts.some((f) => f.label === '主星亮度指數')).toBe(true);
    expect(ctx.facts.some((f) => f.label.startsWith('飛化:'))).toBe(true);
    expect(ctx.facts.every((f) => f.value.length <= 300)).toBe(true); // route 上限
    expect(ctx.headline).toContain('府相朝垣格');
  });

  it('toContext 不帶 analysis 時無頂規 facts(compute 預設不帶,維持確定性)', () => {
    const ctx = toContext(r, 'zh-TW');
    expect(ctx.facts.some((f) => f.label.startsWith('格局:'))).toBe(false);
  });
});
