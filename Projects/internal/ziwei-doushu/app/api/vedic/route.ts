import { NextResponse } from 'next/server';
import { computeSiderealPositions, type WesternRequest } from '@/lib/astrology';
import { buildVedicChart } from '@/lib/vedic';

/**
 * 吠陀本命盤端點 —— 伺服器端跑 XALEN wasm 取恆星黃道位置,lib/vedic.ts 算其餘,回 VedicChart。
 * 輸入欄位與 /api/astrology 相同(生辰、時區、經緯度)。純計算,無外部 fetch、無金鑰。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function bad(detail: string) {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 });
}

function numIn(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v < lo || v > hi ? null : v;
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

  const req = {
    year: numIn(b.year, 1800, 2200),
    month: numIn(b.month, 1, 12),
    day: numIn(b.day, 1, 31),
    hour: numIn(b.hour, 0, 23),
    minute: numIn(b.minute, 0, 59),
    tzOffsetHours: numIn(b.tzOffsetHours, -12, 14),
    lat: numIn(b.lat, -90, 90),
    lon: numIn(b.lon, -180, 180),
  };
  if (Object.values(req).some((v) => v === null)) return bad('bad birth/location fields');
  const r = req as WesternRequest;
  if (![r.year, r.month, r.day, r.hour, r.minute].every(Number.isInteger)) return bad('date/time must be integers');

  // 不存在的日期(2/31 等)在入口擋下
  const dt = new Date(Date.UTC(r.year, r.month - 1, r.day));
  if (dt.getUTCFullYear() !== r.year || dt.getUTCMonth() !== r.month - 1 || dt.getUTCDate() !== r.day) {
    return bad('impossible calendar date');
  }

  try {
    return NextResponse.json(buildVedicChart(computeSiderealPositions(r), r.tzOffsetHours));
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
