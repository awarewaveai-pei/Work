import { isLocale } from '@/lib/i18n/config';
import { MAX_LIMIT } from './search';
import { searchPlaces } from './server';

/** /api/places(頁面用)與 /api/v1/places(跨網域,外掛用)共用的查詢邏輯;兩條路由只差 CORS 與限流。 */

const MAX_QUERY = 64;
/** CC BY 4.0 要求分享時附署名。 */
export const PLACES_ATTRIBUTION =
  'Place data: GeoNames (https://www.geonames.org/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), modified';

export type PlacesAnswer =
  | { ok: true; body: { places: ReturnType<typeof searchPlaces>; attribution: string } }
  | { ok: false; detail: string };

export function answerPlaces(url: URL): PlacesAnswer {
  const q = url.searchParams.get('q') ?? '';
  const locale = url.searchParams.get('locale') ?? 'zh-TW';
  const limit = Number(url.searchParams.get('limit') ?? 10);
  if (q.length > MAX_QUERY) return { ok: false, detail: `q: at most ${MAX_QUERY} characters` };
  if (!isLocale(locale)) return { ok: false, detail: 'locale: must be zh-TW or en' };
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return { ok: false, detail: `limit: must be 1..${MAX_LIMIT}` };
  return { ok: true, body: { places: searchPlaces(q, locale, limit), attribution: PLACES_ATTRIBUTION } };
}
