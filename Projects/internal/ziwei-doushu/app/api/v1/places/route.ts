import { answerPlaces } from '@/lib/places/http';
import { CORS_HEADERS, v1Error, v1Preflight, v1RateLimited } from '@/lib/http/v1';

/**
 * GET /api/v1/places?q=&locale=&limit= — 出生地搜尋的跨網域版(外掛的訂閱表單、客戶站直接從瀏覽器呼叫)。
 * 結果與 /api/places 相同,回 BirthPlace {label, lat, lon, zone};CORS 任意來源、不帶憑證,依來源位址限流。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(request: Request) {
  const limited = v1RateLimited(request);
  if (limited) return limited;
  const a = answerPlaces(new URL(request.url));
  if (!a.ok) return v1Error(400, 'invalid_request', a.detail);
  return Response.json(a.body, { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' } });
}

export function OPTIONS() {
  return v1Preflight();
}
