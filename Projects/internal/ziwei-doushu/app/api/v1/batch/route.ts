import '@/lib/divination';
import { getSystem } from '@/lib/divination/registry';
import { SYSTEM_IDS, type SystemId } from '@/lib/divination/types';
import { defaultLocale, isLocale } from '@/lib/i18n/config';
import { API_VERSION, MAX_BATCH_BODY_BYTES, MAX_BATCH_ITEMS, readV1Request, v1Error, v1Json, v1Preflight } from '@/lib/http/v1';
import { runOne } from '@/lib/http/runSystem';

/**
 * POST /api/v1/batch — 只給已登記站台(帶簽章)。body { key_id, ts, nonce, system, items: [input…], locale? }
 *   → { apiVersion, system, results: [{ ok: true, data, context } | { ok: false, error, detail }] },results 與 items 同序。
 * 每筆用同一份輸入規格(X1 parseInput)逐筆驗證與計算,一筆失敗不影響其他筆。額度以 key_id 按筆數計。
 * 用途:外掛每日排程一次預算多位訂閱者的每日運勢。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 額度按筆數計;超過上限的請求接著會回 400,只扣到上限 + 1,不讓自己一次扣光。 */
const itemCount = (body: Record<string, unknown>) =>
  Array.isArray(body.items) ? Math.min(body.items.length, MAX_BATCH_ITEMS + 1) : 1;

export async function POST(request: Request) {
  const req = await readV1Request(request, { requireSite: true, weight: itemCount, maxBytes: MAX_BATCH_BODY_BYTES });
  if (!req.ok) return req.response;
  const { system: id, items, locale = defaultLocale, ...rest } = req.body;
  const extra = Object.keys(rest);
  if (extra.length) return v1Error(400, 'invalid_request', extra.map((k) => `${k}: unknown field`));
  if (typeof id !== 'string') return v1Error(400, 'invalid_request', 'system: required');
  const system = (SYSTEM_IDS as readonly string[]).includes(id) ? getSystem(id as SystemId) : undefined;
  if (!system) return v1Error(404, 'unknown_system', `no system "${id}"`);
  if (typeof locale !== 'string' || !isLocale(locale)) return v1Error(400, 'invalid_request', 'locale: must be zh-TW or en');
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_BATCH_ITEMS) {
    return v1Error(400, 'invalid_request', `items: 1..${MAX_BATCH_ITEMS} inputs`);
  }

  const results = [];
  for (const input of items) results.push(await runOne(system, input, locale));
  return v1Json({ apiVersion: API_VERSION, system: id, results });
}

export function OPTIONS() {
  return v1Preflight();
}
