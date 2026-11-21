import { NextResponse } from 'next/server';
import { answerPlaces } from '@/lib/places/http';

/**
 * 出生地搜尋:GET /api/places?q=台北&locale=zh-TW&limit=10 → { places: BirthPlace[], attribution }。
 * 資料是靜態檔、不含使用者資料,結果可公開快取(短時間)。
 * 資料是靜態檔、不含使用者資料,結果可公開快取。跨網域用的是 /api/v1/places(同一份邏輯,lib/places/http.ts)。
 */
export const runtime = 'nodejs';

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
    // 快取只 5 分鐘:重產 data.json(如補譯名)後,使用者不會整天拿到舊結果;每次查詢約 10ms,不必長快取
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
  const a = answerPlaces(new URL(request.url));
  if (!a.ok) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  return NextResponse.json(a.body, { headers: { 'Cache-Control': 'public, max-age=86400' } });
}
