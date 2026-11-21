import { NextResponse } from 'next/server';
import { computeSynastry, parseWesternRequest } from '@/lib/astrology';

/**
 * 合盤端點。POST { a: 甲方生辰欄位, b: 乙方生辰欄位 } → { a, b, aspects }。
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
  const a = parseWesternRequest(b.a);
  if (typeof a === 'string') return bad(`a: ${a}`);
  const c = parseWesternRequest(b.b);
  if (typeof c === 'string') return bad(`b: ${c}`);

  try {
    return NextResponse.json(computeSynastry(a, c));
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
