import { describe, expect, it } from 'vitest';
import data from './data.json';
import { createSearchPlaces, normalizePlaceText } from './search';
import type { PlacesData } from './types';

const searchPlaces = createSearchPlaces(data as unknown as PlacesData);
const first = (q: string, locale: 'zh-TW' | 'en' = 'zh-TW') => searchPlaces(q, locale, 5)[0];

describe('searchPlaces', () => {
  it('台北、臺北、Taipei 都找到臺北市,時區 Asia/Taipei', () => {
    for (const q of ['台北', '臺北', 'Taipei', 'taipei']) {
      expect(first(q)).toMatchObject({ zone: 'Asia/Taipei', label: '臺北市，台灣' });
    }
    expect(first('Taipei', 'en')).toMatchObject({ label: 'Taipei, Taiwan', lat: 25.0531, lon: 121.5264 });
  });
  it('臺灣、香港城市的中文標籤用繁體名(GeoNames 多只標 zh)', () => {
    expect(first('高雄')?.label).toMatch(/^高雄/);
    expect(first('台中')?.label).toMatch(/^臺中/);
    expect(first('Hong Kong')?.label).toMatch(/^香港/);
  });
  it('同名同行政區的城市標籤加座標可分辨', () => {
    const r = searchPlaces('Jinzhou', 'en', 5).map((p) => p.label).filter((l) => l.includes('Liaoning'));
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r).size).toBe(r.length);
    expect(r[0]).toMatch(/\(\d+\.\d{2}°N, \d+\.\d{2}°E\)$/);
  });
  it('雪梨、悉尼、Sydney 都得到同一筆,繁中顯示臺灣譯名「雪梨」', () => {
    const hits = ['雪梨', '悉尼', 'Sydney'].map((q) => first(q));
    expect(hits[0]?.label).toMatch(/^雪梨，/);
    expect(hits[1]).toEqual(hits[0]);
    expect(hits[2]).toEqual(hits[0]);
    expect(first('杜拜')?.label).toMatch(/^杜拜/);
    expect(first('迪拜')?.label).toMatch(/^杜拜/);
  });
  it('繁中顯示名(城市、行政區、國家)掃不到常見簡體字,也掃不到臺灣不用的異體字', () => {
    const SIMPLIFIED = /[圣罗兰尔岛亚马维贝华湾龙乌阳发达头县乡区广庆济饶齐辽兴宁苏闽赣陕门东汉义乐丽宾锡贵阁坝滨叶伦韩丰云万胜腊极几种苹]/;
    const NON_TAIWAN_VARIANT = /[峯羣祕衆裏爲僞啓牀着綫]/;
    const d = data as unknown as PlacesData;
    const labels = [...d.places.map((p) => p[2]), ...d.admin1.map((a) => a[1]), ...d.countries.map((c) => c[2])];
    expect(labels.filter((l) => SIMPLIFIED.test(l))).toEqual([]);
    expect(labels.filter((l) => NON_TAIWAN_VARIANT.test(l))).toEqual([]);
  });
  it('一字多繁依詞判定:瀋陽、餘姚、新餘找得到;咸陽保留「咸」;秘魯、霧峰區用臺灣字', () => {
    expect(first('瀋陽')?.label).toMatch(/^瀋陽/);
    expect(first('沈阳')?.label).toMatch(/^瀋陽/);
    expect(first('餘姚')?.label).toMatch(/^餘姚/);
    expect(first('新餘')?.label).toMatch(/^新餘/);
    expect(first('咸陽')?.label).toMatch(/^咸陽/);
    expect(first('Lima', 'zh-TW')?.label).toMatch(/秘魯$/);
    expect(first('霧峰')?.label).toMatch(/^霧峰區/);
  });
  it('臺灣的城市都有中文顯示名;國名用臺灣慣用名', () => {
    const d = data as unknown as PlacesData;
    const tw = d.countries.findIndex((c) => c[0] === 'TW');
    expect(d.places.filter((p) => p[4] === tw && !p[2]).map((p) => p[0])).toEqual([]);
    expect(first('基隆')?.zone).toBe('Asia/Taipei');
    expect(first('Vientiane', 'zh-TW')?.label).toBe('永珍，永珍地區，寮國');
    expect(first('Seoul', 'zh-TW')?.label).toMatch(/韓國$/);
  });
  it('紐約、New York 找到紐約市', () => {
    expect(first('紐約')).toMatchObject({ zone: 'America/New_York', label: '紐約市，紐約州，美國' });
    expect(first('New York', 'en')).toMatchObject({ zone: 'America/New_York', label: 'New York City, New York, United States' });
  });
  it('São Paulo 有沒有重音都找得到,英文標籤保留重音,與城市同名的州省略', () => {
    for (const q of ['São Paulo', 'sao paulo', '聖保羅']) expect(first(q, 'en')?.zone).toBe('America/Sao_Paulo');
    expect(first('sao paulo', 'en')?.label).toBe('São Paulo, Brazil'); // 州名與城市同名時省略
  });
  it('同名城市 Springfield 依人口排序,標籤帶州名可分辨', () => {
    const r = searchPlaces('Springfield', 'en', 3).map((p) => p.label);
    expect(r).toEqual([
      'Springfield, Missouri, United States',
      'Springfield, Massachusetts, United States',
      'Springfield, Illinois, United States',
    ]);
  });
  it('完全相同排在開頭相同之前(Paris 不被人口更多的同前綴城市擠掉)', () => {
    expect(first('Paris', 'en')?.label).toBe('Paris, Île-de-France, France');
  });
  it('查無結果、空字串回空陣列;limit 夾在範圍內', () => {
    expect(searchPlaces('zzqqxx', 'en')).toEqual([]);
    expect(searchPlaces('   ', 'en')).toEqual([]);
    expect(searchPlaces('san', 'en', 999)).toHaveLength(20);
    expect(searchPlaces('san', 'en', 0)).toHaveLength(1);
  });
  it('正規化:去重音、小寫、連字號當空白、臺→台', () => {
    expect(normalizePlaceText('Saint-Étienne')).toBe('saint etienne');
    expect(normalizePlaceText(' 臺中 ')).toBe('台中');
  });
});
