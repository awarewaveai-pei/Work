import { describe, it, expect } from 'vitest';
import { computeChart } from './ziwei';

/**
 * 排盤正確性回歸錨點 (PLAN §20)。
 * 採 iztro 官方範例生辰 2000-08-16 寅時(timeIndex 2)女 國曆 → 標準輸出:
 *   命主 破軍 / 身主 文昌 / 五行局 木三局
 * 此為紫微界眾所周知的對照盤;任何排盤邏輯/重構改動後此測試必須維持綠燈,
 * 否則代表排盤被破壞。此處不啟用真太陽時以對齊 iztro 原生範例(純鐘錶時間)。
 *
 * 備註:命主與五行局隨「命宮(時辰)」變動,身主隨「出生年支」固定。
 *   例:同日 14:30(未時 index 7)→ 命主巨門/身主文昌/火六局(身主不變)。
 */
describe('computeChart — 紫微排盤回歸', () => {
  // 寅時 = 03:00–05:00 → hour 4 對應 timeIndex 2
  const result = computeChart({
    year: 2000, month: 8, day: 16, hour: 4, minute: 0,
    gender: '女', calendar: 'solar',
  });

  it('產出 12 宮', () => {
    expect(result.astrolabe.palaces).toHaveLength(12);
  });

  it('命主 / 身主 / 五行局 對齊 iztro 官方標準輸出', () => {
    expect(result.astrolabe.soul).toBe('破軍');
    expect(result.astrolabe.body).toBe('文昌');
    expect(result.astrolabe.fiveElementsClass).toBe('木三局');
  });

  it('未啟用真太陽時時不帶 correction', () => {
    expect(result.correction).toBeUndefined();
  });

  it('寅時 04:00 → timeIndex 2', () => {
    expect(result.timeIndex).toBe(2);
  });
});
