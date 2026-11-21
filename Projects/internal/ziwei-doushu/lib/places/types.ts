/**
 * 全球出生地城市資料(GeoNames cities15000,CC BY 4.0)的型別。資料由 scripts/build-places.mjs 產生。
 */

/** 與 E5 的 BirthPlace 同形狀;E5 併入後改為 import 該型別。 */
export interface PlaceResult {
  label: string;
  lat: number;
  lon: number;
  /** IANA 時區,例 Asia/Taipei */
  zone: string;
}

/** [英文名, 當地名(與英文同則空), 繁中顯示名, 其他中文搜尋鍵('|' 分隔), 國家序, 行政區序(-1 無), 緯度, 經度, 時區序, 人口] */
export type PlaceRow = [string, string, string, string, number, number, number, number, number, number];

export interface PlacesData {
  source: string;
  generated: string;
  zones: string[];
  /** [ISO 國碼, 英文名, 繁中名] */
  countries: [string, string, string][];
  /** [英文名, 繁中名] */
  admin1: [string, string][];
  places: PlaceRow[];
}
