import { describe, it, expect } from 'vitest';
import { computeChart } from '@/lib/ziwei';
import { computeZiweiDeepFacts } from './deep';
import { planZiweiReading } from './twoStage';

// 卡 Z1 測試的盤 A:2000-08-16 14:30 台北真太陽時,女;目標日 2026-11-29(農曆十月,本月流月無標記)
const A = {
  year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女' as const, calendar: 'solar' as const,
  place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Etc/GMT-8' }, trueSolar: true,
};

describe('紫微兩段式解讀:鉤子挑選(純程式)', () => {
  const plan = planZiweiReading(A, '2026-11-29');

  it('固定命盤 → 固定的免費段與鉤子清單', () => {
    // 本月(農曆十月)流月無標記 → 免費段改寫最強格局;格局權重相同時取 detectPatterns 的第一個
    expect(plan.bonus).toEqual({ heading: '格局精讀：金輿扶駕格', factIds: ['pattern:金輿扶駕格'] });
    // 權重高→低、每組一條、排除免費段已寫的格局:流年化忌 85 > 大限化忌 80 > 格局 65 > 化忌落點(子女)53
    expect(plan.hooks.map((h) => h.factId)).toEqual([
      'yearly:化忌',
      'decadal:化忌',
      'pattern:日月夾命格',
      'surround:子女',
    ]);
    expect(plan.hooks.map((h) => h.key)).toEqual(['H1', 'H2', 'H3', 'H4']);
  });

  it('付費清單與鉤子的每一項都對得到這張盤的 fact', () => {
    const ids = new Set(computeZiweiDeepFacts(computeChart({ ...A, locale: 'zh-TW' }).astrolabe, '2026-11-29').facts.map((f) => f.id));
    for (const item of plan.paidList) {
      expect(item.factIds.length).toBeGreaterThan(0);
      for (const id of item.factIds) expect(ids.has(id)).toBe(true);
    }
    for (const h of plan.hooks) expect(ids.has(h.factId)).toBe(true);
    // 鉤子對應的 fact 一定在簡批 facts 裡(模型寫懸念時看得到、核對器也核得到)
    const brief = new Set(plan.briefFacts.map((f) => f.id));
    for (const h of plan.hooks) expect(brief.has(h.factId)).toBe(true);
  });
});
