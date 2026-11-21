import { NextResponse } from 'next/server';
import { computeTransits } from '@/lib/astrology';
import { parseInput } from '@/lib/divination/input';
import { LEGACY_TRANSITS_INPUT } from '@/lib/divination/fields';
import { API_RULE, rateLimited } from '@/lib/http/rateLimit';

/**
 * 行運 + 太陽回歸端點。POST { birth, today, viewerTzOffsetHours }。
 * today 由 client 用 lib/today.ts localToday 給:伺服器時區不是使用者時區。
 * 驗證走共用規格(lib/divination/fields.ts LEGACY_TRANSITS_INPUT);不外洩內部錯誤細節(wasm/檔案路徑等)。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bad(detail: string) {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 });
}

export async function POST(request: Request) {
  const limited = rateLimited(request, 'astrology', API_RULE);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('invalid json');
  }
  const parsed = parseInput(LEGACY_TRANSITS_INPUT, body);
  if (!parsed.ok) return bad(parsed.errors.join('; '));
  const input = parsed.value;

  try {
    return NextResponse.json(computeTransits(input.birth, input.today, input.viewerTzOffsetHours));
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
