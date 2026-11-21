import { NextResponse } from 'next/server';
import { computeTransits, isRealDate, parseWesternRequest } from '@/lib/astrology';

/**
 * 行運 + 太陽回歸端點。POST { birth: 生辰欄位, today: {year,month,day}, viewerTzOffsetHours }。
 * today 由 client 用 lib/today.ts localToday 給:伺服器時區不是使用者時區。
 * 無 auth/quota 的理由同 /api/astrology(純計算、無外部 fetch、無金鑰)。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bad(detail: string) {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('invalid json');
  }
  if (!body || typeof body !== 'object') return bad('body required');
  const b = body as Record<string, unknown>;
  const birth = parseWesternRequest(b.birth);
  if (typeof birth === 'string') return bad(birth);
  const t = (b.today ?? {}) as Record<string, unknown>;
  const today = { year: t.year, month: t.month, day: t.day };
  if (
    typeof today.year !== 'number' || typeof today.month !== 'number' || typeof today.day !== 'number' ||
    today.year < 1800 || today.year > 2200 || !isRealDate(today.year, today.month, today.day)
  ) {
    return bad('bad today');
  }
  const ymd = (y: number, m: number, d: number) => y * 10000 + m * 100 + d;
  if (ymd(today.year, today.month, today.day) < ymd(birth.year, birth.month, birth.day)) {
    return bad('today before birth');
  }
  const tz = b.viewerTzOffsetHours;
  if (typeof tz !== 'number' || !Number.isFinite(tz) || tz < -12 || tz > 14) return bad('bad viewerTzOffsetHours');

  try {
    return NextResponse.json(
      computeTransits(birth, { year: today.year, month: today.month, day: today.day }, tz),
    );
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
