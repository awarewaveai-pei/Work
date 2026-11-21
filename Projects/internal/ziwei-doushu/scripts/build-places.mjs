#!/usr/bin/env node
/**
 * 一次性產生全球出生地城市資料 lib/places/data.json(GeoNames cities15000,CC BY 4.0)。
 *
 * 輸入檔不進 repo:
 *   - GeoNames https://download.geonames.org/export/dump/ 的 cities15000.txt、alternateNamesV2.txt、
 *     admin1CodesASCII.txt、countryInfo.txt(解壓到同一目錄)
 *   - OpenCC(Apache-2.0)https://github.com/BYVoid/OpenCC 的 data/dictionary/ 下
 *     STPhrases.txt、STCharacters.txt、TWVariants.txt(放同一目錄)
 * 用法:node scripts/build-places.mjs <GeoNames 目錄> <OpenCC 字典目錄>
 *
 * 篩選與改動(CC BY 4.0 要求註明修改):只取上列欄位;經緯度四捨五入到 4 位小數(約 11 公尺);
 *   不取歷史名、俗名(isHistoric、isColloquial),只取含漢字的中文名。
 * 繁中顯示名(建檔時決定,執行期不轉換):
 *   1. lib/places/twNames.json 的臺灣慣用譯名(城市:雪梨、杜拜…;國家:寮國、北馬其頓…)優先;
 *   2. 否則依語言標籤選一個中文名:zh-TW > zh-Hant > zh-HK > zh-MO > 臺港澳城市的 zh > 其他 zh*(同級取 preferred);
 *   3. 一律照 OpenCC s2tw 流程轉臺灣繁體:詞表 STPhrases(最長詞優先;沈阳→瀋陽、咸阳→咸陽)
 *      → 字表 STCharacters → 臺灣字形 TWVariants(羣→群、峯→峰)→ 本站補一條 祕→秘(臺灣用字)。
 *      字表一字多繁且原字也列為繁體時保留原字(里、台、谷、岳、郁、涌…,地名多用原字),
 *      FORCE_CONVERT 的字例外(原字在繁體罕用,依本資料實際出現的字逐一判定)。
 *   臺灣名、原中文名、轉換後的名稱都是搜尋鍵。
 * 輸出格式見 lib/places/types.ts PlacesData。
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const [dir, openccDir] = process.argv.slice(2);
if (!dir || !openccDir) {
  console.error('用法: node scripts/build-places.mjs <GeoNames 目錄> <OpenCC 字典目錄>');
  process.exit(1);
}
const OUT = join(import.meta.dirname, '..', 'lib', 'places', 'data.json');
const lines = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));

// 顯示名的語言標籤優先序(數字小者優先)
const HANT = ['zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO'];
/** 這些地區的 zh 名是繁體,排在 HANT 之後 */
const HANT_REGIONS = new Set(['TW', 'HK', 'MO']);
const HAN = /\p{Script=Han}/u;

// ---- 簡→臺灣繁體(OpenCC 字典格式:「鍵<tab>值1 值2 …」,# 開頭為註解;規則見檔頭第 3 點) ----
const dict = (f) =>
  readFileSync(join(openccDir, f), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter(([k, v]) => k && v && !k.startsWith('#'))
    .map(([k, v]) => [k, v.trim().split(' ')]);
const FORCE_CONVERT = new Set([...'广叶丰云万胜腊极几种杰苹']);
const PHRASES = new Map(dict('STPhrases.txt').map(([k, v]) => [k, v[0]]));
const MAX_PHRASE = Math.max(...[...PHRASES.keys()].map((k) => [...k].length));
const CHARS = new Map(dict('STCharacters.txt').map(([k, v]) => [k, v.includes(k) && !FORCE_CONVERT.has(k) ? k : v[0]]));
const TW_VARIANTS = new Map(dict('TWVariants.txt').map(([k, v]) => [k, v[0]]));
TW_VARIANTS.set('祕', '秘'); // OpenCC 標準字是「祕」,臺灣地名、國名用「秘」(秘魯)

/** 詞表最長詞優先 → 字表 → 臺灣字形 */
function toHant(s) {
  const chars = [...s];
  let out = '';
  let i = 0;
  while (i < chars.length) {
    let n = Math.min(MAX_PHRASE, chars.length - i);
    while (n >= 2 && !PHRASES.has(chars.slice(i, i + n).join(''))) n--;
    if (n >= 2) {
      out += PHRASES.get(chars.slice(i, i + n).join(''));
      i += n;
    } else {
      out += CHARS.get(chars[i]) ?? chars[i];
      i += 1;
    }
  }
  return [...out].map((c) => TW_VARIANTS.get(c) ?? c).join('');
}

// ---- 臺灣慣用譯名 ----
const twFile = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'lib', 'places', 'twNames.json'), 'utf8'));
const TW_NAMES = new Map(twFile.names.map((n) => [String(n.id), n]));
/** 國碼 → 臺灣慣用國名 */
const TW_COUNTRIES = new Map(Object.entries(twFile.countries));

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
  if (!lang?.startsWith('zh') || !wanted.has(id) || colloquial === '1' || historic === '1' || !HAN.test(name)) continue;
  const e = zh.get(id) ?? { label: null, keys: new Set() };
  e.keys.add(name);
  const rank = HANT.includes(lang)
    ? HANT.indexOf(lang)
    : lang === 'zh' && HANT_REGIONS.has(ccOf.get(id))
      ? HANT.length
      : HANT.length + 1;
  const cand = { rank, preferred: preferred === '1', name };
  const cur = e.label;
  if (!cur || rank < cur.rank || (rank === cur.rank && cand.preferred && !cur.preferred)) e.label = cand;
  zh.set(id, e);
}
/** 繁中顯示名:臺灣譯名優先,否則選中的中文名轉繁 */
const zhLabel = (id) => TW_NAMES.get(id)?.zh ?? toHant(zh.get(id)?.label?.name ?? '');

// 臺灣譯名表的 id 必須對得上 GeoNames 的城市,且英文名一致(防手誤)
for (const [id, n] of TW_NAMES) {
  const c = cities.find((x) => x.id === id);
  if (!c || (c.ascii !== n.en && c.name !== n.en)) throw new Error(`twNames.json: ${id} ${n.en} 對不上 GeoNames(${c?.ascii ?? '無此 id'})`);
}

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
  countries: usedCc.map((cc) => [cc, countries.get(cc)?.name ?? cc, TW_COUNTRIES.get(cc) ?? zhLabel(countries.get(cc)?.id)]),
  admin1: usedAdmin.map((k) => [admin1.get(k).name, zhLabel(admin1.get(k).id)]),
  // [英文名, 當地名(與英文同則空), 繁中顯示名, 其他中文搜尋鍵('|' 分隔), 國家序, 行政區序(-1 無), 緯度, 經度, 時區序, 人口]
  places: cities
    .sort((a, b) => b.pop - a.pop || a.ascii.localeCompare(b.ascii))
    .map((c) => {
      const label = zhLabel(c.id);
      const raw = [...(zh.get(c.id)?.keys ?? [])];
      const keys = [...new Set([...raw, ...raw.map(toHant)])].filter((k) => k !== label);
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
