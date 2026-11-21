import { NextResponse } from 'next/server';
import { isLocale } from '@/lib/i18n/config';
import { MAX_LIMIT } from '@/lib/places/search';
import { searchPlaces } from '@/lib/places/server';

/**
 * 出生地搜尋:GET /api/places?q=台北&locale=zh-TW&limit=10 → { places: PlaceResult[] }。
 * 資料是靜態檔、不含使用者資料,結果可公開快取。
 */
export const runtime = 'nodejs';

const MAX_QUERY = 64;
/** CC BY 4.0 要求分享時附署名;頁面上的署名在接表單的卡(E6b)加。 */
const ATTRIBUTION = 'Place data: GeoNames (https://www.geonames.org/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), modified';

export function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const locale = url.searchParams.get('locale') ?? 'zh-TW';
  const limit = Number(url.searchParams.get('limit') ?? 10);
  if (q.length > MAX_QUERY || !isLocale(locale) || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  return NextResponse.json(
    { places: searchPlaces(q, locale, limit), attribution: ATTRIBUTION },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
