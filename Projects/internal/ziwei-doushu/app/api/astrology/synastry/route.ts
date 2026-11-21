import { NextResponse } from 'next/server';
import { computeSynastry } from '@/lib/astrology';
import { parseInput } from '@/lib/divination/input';
import { LEGACY_SYNASTRY_INPUT } from '@/lib/divination/fields';
import { API_RULE, rateLimited } from '@/lib/http/rateLimit';

/**
 * 合盤端點。POST { a: 甲方生辰欄位, b: 乙方生辰欄位 } → { a, b, aspects }。
 * 驗證走共用規格(lib/divination/fields.ts LEGACY_SYNASTRY_INPUT);不外洩內部錯誤細節(wasm/檔案路徑等)。
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
  const parsed = parseInput(LEGACY_SYNASTRY_INPUT, body);
  if (!parsed.ok) return bad(parsed.errors.join('; '));
  const input = parsed.value;

  try {
    return NextResponse.json(computeSynastry(input.a, input.b));
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
