import { NextResponse } from 'next/server';
import { answerPlaces } from '@/lib/places/http';

/**
 * 出生地搜尋:GET /api/places?q=台北&locale=zh-TW&limit=10 → { places: BirthPlace[], attribution }。
 * 資料是靜態檔、不含使用者資料,結果可公開快取(短時間)。跨網域用的是 /api/v1/places(同一份邏輯,lib/places/http.ts)。
 */
export const runtime = 'nodejs';

export function GET(request: Request) {
  const a = answerPlaces(new URL(request.url));
  if (!a.ok) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  // 快取只 5 分鐘:重產 data.json(如補譯名)後,使用者不會整天拿到舊結果
  return NextResponse.json(a.body, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
