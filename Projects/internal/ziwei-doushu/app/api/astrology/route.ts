import { NextResponse } from 'next/server';
import { computeWesternChart } from '@/lib/astrology';
import { parseInput } from '@/lib/divination/input';
import { LEGACY_ASTROLOGY_INPUT } from '@/lib/divination/fields';
import { API_RULE, rateLimited } from '@/lib/http/rateLimit';

/**
 * 西洋占星本命盤端點(頁面 AstrologyTool 用)— 伺服器端跑 XALEN wasm(1.75MB,不進 client bundle)。
 * 對外資料介面是 /api/v1/systems/astrology;本路由保留舊前端的 body 格式(固定 UTC 偏移)。
 * 驗證走共用規格(lib/divination/fields.ts LEGACY_ASTROLOGY_INPUT);不外洩內部錯誤細節(wasm/檔案路徑等)。
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
  const parsed = parseInput(LEGACY_ASTROLOGY_INPUT, body);
  if (!parsed.ok) return bad(parsed.errors.join('; '));
  const input = parsed.value;

  try {
    return NextResponse.json(computeWesternChart(input));
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
