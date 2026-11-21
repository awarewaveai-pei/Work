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
