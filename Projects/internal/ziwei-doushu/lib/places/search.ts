import type { Locale } from '@/lib/i18n/config';
import type { BirthPlace } from '@/lib/timezone';
import type { PlacesData } from './types';

/**
 * 出生地搜尋 —— 純函式,資料由呼叫端注入(伺服器端見 lib/places/server.ts;資料約 2.3MB,不進前端)。
 *
 * 比對:英文名、當地名(去重音)、繁中名與其他中文名;查詢與名稱都做同樣正規化
 *   (NFKD 去重音、小寫、連字號與撇號當空白、「臺」與「台」視為同字)。
 * 排序:完全相同 > 開頭相同 > 某個字開頭相同 > 包含;同一級依人口由多到少。
 */

export const MAX_LIMIT = 20;

export function normalizePlaceText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/臺/g, '台')
    .replace(/[-‐’'.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Entry {
  keys: string[];
  zh: string;
  en: string;
  lat: number;
  lon: number;
  zone: string;
  pop: number;
}

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

function score(keys: readonly string[], q: string): number {
  let best = 4;
  for (const k of keys) {
    if (k === q) return 0;
    if (k.startsWith(q)) best = Math.min(best, 1);
    else if (k.includes(` ${q}`)) best = Math.min(best, 2);
    else if (k.includes(q)) best = Math.min(best, 3);
  }
  return best;
}

export function createSearchPlaces(data: PlacesData) {
  const entries: Entry[] = data.places.map(([ascii, local, zhName, zhKeys, ci, ai, lat, lon, zi, pop]) => {
    const [, countryEn, countryZh] = data.countries[ci];
    const [adminEn, adminZh] = ai >= 0 ? data.admin1[ai] : ['', ''];
    const name = local || ascii;
    const parts = (city: string, admin: string, country: string) =>
      [city, admin, country].filter((p, i, a) => p && a.indexOf(p) === i);
    const zhCity = zhName || name;
    return {
      keys: [...new Set([ascii, local, zhName, ...zhKeys.split('|')].filter(Boolean).map(normalizePlaceText))],
      zh: parts(zhCity, adminZh || adminEn, countryZh || countryEn).join('，'),
      en: parts(name, adminEn, countryEn).join(', '),
      lat,
      lon,
      zone: data.zones[zi],
      pop,
    };
  });

  // 同名同行政區的城市(如遼寧有兩個 Jinzhou)標籤加座標,選的人才分得出來
  for (const key of ['zh', 'en'] as const) {
    const count = new Map<string, number>();
    for (const e of entries) count.set(e[key], (count.get(e[key]) ?? 0) + 1);
    for (const e of entries) {
      if (count.get(e[key])! > 1) e[key] += ` (${coord(e.lat, 'N', 'S')}, ${coord(e.lon, 'E', 'W')})`;
    }
  }

  /** 依名稱搜尋城市;查無或空字串回空陣列。limit 夾在 1–MAX_LIMIT。 */
  return function searchPlaces(query: string, locale: Locale, limit = 10): BirthPlace[] {
    const q = normalizePlaceText(query);
    if (!q) return [];
    const n = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
    const hits: { e: Entry; s: number }[] = [];
    for (const e of entries) {
      const s = score(e.keys, q);
      if (s < 4) hits.push({ e, s });
    }
    hits.sort((a, b) => a.s - b.s || b.e.pop - a.e.pop);
    return hits.slice(0, n).map(({ e }) => ({
      label: locale === 'zh-TW' ? e.zh : e.en,
      lat: e.lat,
      lon: e.lon,
      zone: e.zone,
    }));
  };
}
