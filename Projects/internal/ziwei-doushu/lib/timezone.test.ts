import { describe, it, expect } from 'vitest';
import { FIXED_UTC8, ZONE_RENAMES, dstHoursAt, isDstAt, resolveZone, utcOffsetAt } from './timezone';
import { resolveBirth } from './dates';

describe('utcOffsetAt — 出生當下的 UTC 偏移(含歷史夏令時間)', () => {
  it.each([
    ['Asia/Taipei', 1975, 7, 1, 9], // 台灣 1975 夏令時間
    ['Asia/Taipei', 1975, 12, 1, 8],
    ['Asia/Shanghai', 1988, 7, 1, 9], // 中國 1986–1991 夏令時間
    ['America/New_York', 2000, 7, 1, -4],
    ['America/New_York', 2000, 1, 15, -5],
    ['Asia/Kolkata', 2000, 7, 1, 5.5], // 半小時時區
    ['Australia/Adelaide', 2000, 1, 15, 10.5], // 南半球:一月是夏令時間
    ['Australia/Adelaide', 2000, 7, 1, 9.5],
    ['Asia/Singapore', 1981, 7, 1, 7.5], // 歷史上改過標準時:1982 年起 +8
    ['Asia/Singapore', 1982, 7, 1, 8],
    [FIXED_UTC8, 1975, 7, 1, 8], // 舊行為:固定 UTC+8
  ] as const)('%s %i-%i-%i 12:00 → %f', (zone, y, m, d, expected) => {
    expect(utcOffsetAt(zone, y, m, d, 12, 0)).toBe(expected);
  });

  it('重疊時刻(紐約 2000-10-29 01:30 出現兩次)取較早一次:夏令 −4', () => {
    expect(utcOffsetAt('America/New_York', 2000, 10, 29, 1, 30)).toBe(-4);
  });

  it('跳空時刻(紐約 2000-04-02 02:30 不存在)取撥快前偏移 −5', () => {
    expect(utcOffsetAt('America/New_York', 2000, 4, 2, 2, 30)).toBe(-5);
  });

  it('夏令時間判定', () => {
    expect(isDstAt('Asia/Taipei', 1975, 7, 1, 13, 30)).toBe(true);
    expect(isDstAt('Asia/Taipei', 1975, 12, 1, 13, 30)).toBe(false);
    expect(isDstAt(FIXED_UTC8, 1975, 7, 1, 13, 30)).toBe(false);
    expect(isDstAt('Australia/Adelaide', 2000, 1, 15, 12, 0)).toBe(true);
    expect(isDstAt('Asia/Singapore', 1982, 7, 1, 12, 0)).toBe(false); // 改標準時不是夏令時間
  });

  it.each([
    ['Europe/Moscow', 2011, 11, 15], // 2011 起全年 +4(標準時)
    ['Europe/Moscow', 2014, 11, 15], // 2014-10 改回 +3
    ['Europe/Istanbul', 2016, 11, 1], // 2016-09 起全年 +3
    ['America/Caracas', 2007, 12, 20], // 2007-12 由 −4 改 −4:30
    ['Asia/Pyongyang', 2015, 9, 1], // 2015-08 改 +8:30
    ['Asia/Pyongyang', 2018, 6, 1], // 2018-05 改回 +9
  ] as const)('永久改時區不算夏令時間:%s %i-%i-%i', (zone, y, m, d) => {
    expect(dstHoursAt(zone, y, m, d, 12, 30)).toBe(0);
    const b = resolveBirth({ year: y, month: m, day: d, hour: 12, minute: 30, calendar: 'solar', place: { label: zone, lat: 0, lon: 0, zone } });
    expect([b.chart.hour, b.chart.minute, b.dst]).toEqual([12, 30, false]);
  });

  it('薩摩亞 2011-12-31 換日當天:夏令時間只扣 1 小時,不會跳到前一天', () => {
    expect(dstHoursAt('Pacific/Apia', 2011, 12, 31, 12, 30)).toBe(1);
  });

  it('不存在的時區名拋錯', () => {
    expect(() => utcOffsetAt('Mars/Olympus', 2000, 1, 1, 0, 0)).toThrow();
  });
});

describe('resolveZone — 瀏覽器不認得 IANA 新名時改用舊名', () => {
  /** 模擬時區資料停在 2021 年的瀏覽器:不認得 Europe/Kyiv,認得 Europe/Kiev */
  const old = (z: string) => z !== 'Europe/Kyiv' && z !== 'America/Ciudad_Juarez';
  it('認得本名就用本名;只認得舊名就用舊名;都不認得回 null', () => {
    expect(resolveZone('Europe/Kyiv')).toBe('Europe/Kyiv');
    expect(resolveZone('Europe/Kyiv', old)).toBe('Europe/Kiev');
    expect(resolveZone('America/Ciudad_Juarez', old)).toBeNull(); // 拆分出來的新時區沒有舊名
    expect(resolveZone('Mars/Olympus')).toBeNull();
  });
  it('每個改名的舊名在目前的 Intl 都有效,且兩者在 2000 年與 2025 年的偏移相同', () => {
    for (const [now, before] of Object.entries(ZONE_RENAMES)) {
      expect(resolveZone(before)).toBe(before);
      for (const y of [2000, 2025]) expect([now, y, utcOffsetAt(before, y, 7, 1, 12, 0)]).toEqual([now, y, utcOffsetAt(now, y, 7, 1, 12, 0)]);
    }
  });
});
