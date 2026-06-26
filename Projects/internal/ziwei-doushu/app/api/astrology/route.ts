import { NextResponse } from 'next/server';
import { computeWesternChart, type WesternRequest } from '@/lib/astrology';

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

function intIn(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < lo || v > hi) return null;
  return v;
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

  const year = intIn(b.year, 1800, 2200);
  const month = intIn(b.month, 1, 12);
  const day = intIn(b.day, 1, 31);
  const hour = intIn(b.hour, 0, 23);
  const minute = intIn(b.minute, 0, 59);
  const tzOffsetHours = intIn(b.tzOffsetHours, -12, 14);
  const lat = intIn(b.lat, -90, 90);
  const lon = intIn(b.lon, -180, 180);

  if (
    year === null || month === null || day === null || hour === null ||
    minute === null || tzOffsetHours === null || lat === null || lon === null
  ) {
    return bad('bad birth/location fields');
  }

  const req: WesternRequest = {
    year, month, day, hour, minute, tzOffsetHours, lat, lon,
  };

  try {
    const chart = computeWesternChart(req);
    return NextResponse.json(chart);
  } catch {
    // 不外洩內部細節(wasm/檔案路徑等)
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
