#!/usr/bin/env node
/**
 * 一次性產生全球出生地城市資料 lib/places/data.json(GeoNames cities15000,CC BY 4.0)。
 *
 * 輸入檔不進 repo,先到 https://download.geonames.org/export/dump/ 下載並解壓到同一目錄:
 *   cities15000.txt、alternateNamesV2.txt、admin1CodesASCII.txt、countryInfo.txt
 * 用法:node scripts/build-places.mjs <輸入目錄>
 *
 * 篩選與改動(CC BY 4.0 要求註明修改):只取上列欄位;經緯度四捨五入到 4 位小數(約 11 公尺);
 *   中文顯示名取語言標籤 zh-TW / zh-Hant / zh-HK / zh-MO;臺灣、香港、澳門的城市另接受 zh(當地 zh 名為繁體,
 *   GeoNames 的中文名絕大多數只標 zh);其他國家的 zh / zh-CN / zh-Hans 只當搜尋鍵,顯示英文名;
 *   不取歷史名、俗名(isHistoric、isColloquial)。
 * 輸出格式見 lib/places/types.ts PlacesData。
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node scripts/build-places.mjs <GeoNames 檔案目錄>');
  process.exit(1);
}
const OUT = join(import.meta.dirname, '..', 'lib', 'places', 'data.json');
const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));

// 顯示名的語言標籤優先序;其餘 zh* 只當搜尋鍵
const HANT = ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO'];
/** 這些地區的 zh 名是繁體,可在沒有繁體標籤時當顯示名(排在 HANT 之後) */
const HANT_REGIONS = new Set(['TW', 'HK', 'MO']);

// ---- 城市 ----
const cities = lines('cities15000.txt').map((l) => {
  const c = l.split('\t');
  return {
    id: c[0], name: c[1], ascii: c[2], lat: +c[4], lon: +c[5],
    cc: c[8], admin1: `${c[8]}.${c[10]}`, pop: +c[14] || 0, zone: c[17],
  };
});

// ---- 國家、一級行政區(英文名與 geonameid) ----
const countries = new Map(); // cc -> { name, id }
for (const l of lines('countryInfo.txt')) {
  const c = l.split('\t');
  countries.set(c[0], { name: c[4], id: c[16] });
}
const admin1 = new Map(); // 'TW.03' -> { name, id }
for (const l of lines('admin1CodesASCII.txt')) {
  const c = l.split('\t');
  admin1.set(c[0], { name: c[1], id: c[3] });
}

// ---- 中文名:串流讀 alternateNamesV2(約 800MB) ----
const ccOf = new Map(); // geonameid -> 所在國碼(城市、行政區;國家本身用自己的國碼)
for (const c of cities) ccOf.set(c.id, c.cc);
for (const [cc, c] of countries) ccOf.set(c.id, cc);
for (const [code, a] of admin1) ccOf.set(a.id, code.slice(0, 2));
const wanted = new Set([...cities.map((c) => c.id), ...[...countries.values()].map((c) => c.id), ...[...admin1.values()].map((a) => a.id)]);
const zh = new Map(); // geonameid -> { label: {rank, preferred, name}, keys: Set }
const rl = createInterface({ input: createReadStream(join(dir, 'alternateNamesV2.txt'), 'utf8'), crlfDelay: Infinity });
for await (const l of rl) {
  const c = l.split('\t');
  const [, id, lang, name, preferred, , colloquial, historic] = c;
  if (!lang?.startsWith('zh') || !wanted.has(id) || colloquial === '1' || historic === '1') continue;
  const e = zh.get(id) ?? { label: null, keys: new Set() };
  e.keys.add(name);
  const rank = HANT.includes(lang) ? HANT.indexOf(lang) : lang === 'zh' && HANT_REGIONS.has(ccOf.get(id)) ? HANT.length : -1;
  if (rank >= 0) {
    const cand = { rank, preferred: preferred === '1', name };
    const cur = e.label;
    if (!cur || rank < cur.rank || (rank === cur.rank && cand.preferred && !cur.preferred)) e.label = cand;
  }
  zh.set(id, e);
}
const zhLabel = (id) => zh.get(id)?.label?.name ?? '';

// ---- 輸出:表格化,國家與時區、行政區去重 ----
const zones = [...new Set(cities.map((c) => c.zone))].sort();
const zoneIndex = new Map(zones.map((z, i) => [z, i]));
const usedCc = [...new Set(cities.map((c) => c.cc))].sort();
const ccIndex = new Map(usedCc.map((cc, i) => [cc, i]));
const usedAdmin = [...new Set(cities.map((c) => c.admin1))].filter((k) => admin1.has(k)).sort();
const adminIndex = new Map(usedAdmin.map((k, i) => [k, i]));

const data = {
  source: 'GeoNames cities15000 (https://www.geonames.org/), CC BY 4.0; modified, see scripts/build-places.mjs',
  generated: new Date().toISOString().slice(0, 10),
  zones,
  countries: usedCc.map((cc) => [cc, countries.get(cc)?.name ?? cc, zhLabel(countries.get(cc)?.id)]),
  admin1: usedAdmin.map((k) => [admin1.get(k).name, zhLabel(admin1.get(k).id)]),
  // [英文名, 當地名(與英文同則空), 繁中顯示名, 其他中文搜尋鍵('|' 分隔), 國家序, 行政區序(-1 無), 緯度, 經度, 時區序, 人口]
  places: cities
    .sort((a, b) => b.pop - a.pop || a.ascii.localeCompare(b.ascii))
    .map((c) => {
      const label = zhLabel(c.id);
      const keys = [...(zh.get(c.id)?.keys ?? [])].filter((k) => k !== label);
      return [
        c.ascii,
        c.name === c.ascii ? '' : c.name,
        label,
        keys.join('|'),
        ccIndex.get(c.cc),
        adminIndex.get(c.admin1) ?? -1,
        Math.round(c.lat * 1e4) / 1e4,
        Math.round(c.lon * 1e4) / 1e4,
        zoneIndex.get(c.zone),
        c.pop,
      ];
    }),
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`places=${data.places.length} zones=${zones.length} countries=${usedCc.length} admin1=${usedAdmin.length} bytes=${Buffer.byteLength(JSON.stringify(data))}`);
