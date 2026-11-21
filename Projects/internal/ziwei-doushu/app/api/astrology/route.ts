import { NextResponse } from 'next/server';
import { computeWesternChart, parseWesternRequest } from '@/lib/astrology';

/**
 * 西洋占星本命盤端點 — 伺服器端跑 XALEN wasm(1.75MB,不進 client bundle)。
 * client(AstrologyTool)POST 生辰+經緯度 → 回 WesternChart。
 *
 * ⚠️ 同 /api/interpret:付費牆前無 auth/quota(展示用);純計算無外部 fetch、
 *   無金鑰,故風險低。
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
  const req = parseWesternRequest(body);
  if (typeof req === 'string') return bad(req);

  try {
    const chart = computeWesternChart(req);
    return NextResponse.json(chart);
  } catch {
    // 不外洩內部細節(wasm/檔案路徑等)
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
