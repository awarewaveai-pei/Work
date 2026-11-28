import { describe, expect, it, vi } from 'vitest';
import { forDateInput, prefillOnce, readParentBirth, solarDateText, type StoredBirth } from './birthPrefill';

const ORIGIN = 'https://oracle.example';
const GOOD = {
  calendar: 'solar',
  year: 1990,
  month: 11,
  day: 29,
  hour: 8,
  minute: 5,
  gender: '女',
  place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' },
  trueSolar: false,
  dayDivide: 'current',
  isLeapMonth: false,
};

/** 框內頁的 window:parent 同源且(可選)提供 awOracleBirth */
function frame(birth: unknown, parentOrigin = ORIGIN) {
  const fn = vi.fn(async () => birth);
  const parent = { location: { origin: parentOrigin }, parent: null, awOracleBirth: fn };
  return { win: { parent, location: { origin: ORIGIN } }, fn };
}

describe('會員出生資料預填(資料信任邊界)', () => {
  it('同源父頁有函式且資料合格 → 帶入;函式晚一步才出現也會再找一次', async () => {
    const { win } = frame(GOOD);
    const b = await readParentBirth(win, { retryMs: 0 });
    expect(b).toEqual({ ...GOOD, gender: '女' });
    const apply = vi.fn();
    expect(await prefillOnce(async () => b, () => false, apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith(b);

    const late = { location: { origin: ORIGIN }, parent: null } as Record<string, unknown>;
    setTimeout(() => (late.awOracleBirth = async () => GOOD), 5);
    expect(await readParentBirth({ parent: late, location: { origin: ORIGIN } }, { retryMs: 30 })).not.toBeNull();
    // 農曆存的資料給只收國曆的工具:換成國曆日期
    expect(solarDateText({ ...(b as StoredBirth), calendar: 'lunar', year: 2000, month: 7, day: 17 })).toBe('2000-08-16');
    // 日期框放不進的農曆日(二月三十)→ 同一天的國曆;放得進的維持農曆
    const lunar30 = forDateInput({ ...(b as StoredBirth), calendar: 'lunar', year: 1990, month: 2, day: 30 });
    expect(lunar30.calendar).toBe('solar');
    expect(solarDateText(lunar30)).toBe(solarDateText({ ...(b as StoredBirth), calendar: 'lunar', year: 1990, month: 2, day: 30 }));
    expect(forDateInput({ ...(b as StoredBirth), calendar: 'lunar', year: 2000, month: 7, day: 17 }).calendar).toBe('lunar');
  });

  it.each([
    ['null', null],
    ['月 13', { ...GOOD, month: 13 }],
    ['不存在的日期', { ...GOOD, month: 2, day: 30 }],
    ['年是字串', { ...GOOD, year: '1990' }],
    ['多出欄位', { ...GOOD, admin: true }],
    ['時區亂填', { ...GOOD, place: { ...GOOD.place, zone: 'Mars/Base' } }],
    ['性別不在選項', { ...GOOD, gender: 'x' }],
    ['缺出生地', { ...GOOD, place: undefined }],
    ['陣列', [GOOD]],
  ])('不合格(%s)→ 不帶入,表單不變', async (_name, birth) => {
    const { win } = frame(birth);
    const b = await readParentBirth(win, { retryMs: 0 });
    expect(b).toBeNull();
    const apply = vi.fn();
    expect(await prefillOnce(async () => b, () => false, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('使用者已改過欄位 → 讀到合格資料也不覆蓋', async () => {
    const { win } = frame(GOOD);
    const apply = vi.fn();
    expect(await prefillOnce(() => readParentBirth(win, { retryMs: 0 }), () => true, apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    // 工具用不了這筆(apply 回 false)→ 不算帶入,不顯示提示
    expect(await prefillOnce(() => readParentBirth(win, { retryMs: 0 }), () => false, () => false)).toBe(false);
  });

  it('非同源父頁 → 不呼叫父頁函式', async () => {
    const other = frame(GOOD, 'https://evil.example');
    expect(await readParentBirth(other.win, { retryMs: 0 })).toBeNull();
    expect(other.fn).not.toHaveBeenCalled();
    // 真正跨源時讀 parent.location 會丟錯
    const fn = vi.fn(async () => GOOD);
    const throwing = {
      get location(): { origin: string } {
        throw new DOMException('Blocked', 'SecurityError');
      },
      awOracleBirth: fn,
    };
    expect(await readParentBirth({ parent: throwing, location: { origin: ORIGIN } }, { retryMs: 0 })).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
