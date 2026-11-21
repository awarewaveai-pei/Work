import '@/lib/divination';
import { getSystem } from '@/lib/divination/registry';
import { describeSpec } from '@/lib/divination/input';
import { SYSTEM_IDS, type SystemId } from '@/lib/divination/types';
import { defaultLocale, isLocale } from '@/lib/i18n/config';
import { API_VERSION, readV1Request, v1Error, v1Json, v1Preflight, v1RateLimited } from '@/lib/http/v1';
import { runOne } from '@/lib/http/runSystem';

/**
 * POST /api/v1/systems/{id}  body { input, locale? } → { apiVersion, system, data, context }
 *   匿名呼叫依來源位址限流;已登記站台帶簽章(body 另含 key_id、ts、nonce)時改以 key_id 計額度。
 * GET  /api/v1/systems/{id}  → 該系統的輸入規格
 * 只給確定性結果;AI 解讀不在 v1。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function lookup(id: string) {
  return (SYSTEM_IDS as readonly string[]).includes(id) ? getSystem(id as SystemId) : undefined;
}

export async function GET(request: Request, ctx: Ctx) {
  const limited = v1RateLimited(request);
  if (limited) return limited;
  const { id } = await ctx.params;
  const system = lookup(id);
  if (!system) return v1Error(404, 'unknown_system', `no system "${id}"`);
  return v1Json({ apiVersion: API_VERSION, system: id, input: describeSpec(system.input) });
}

export async function POST(request: Request, ctx: Ctx) {
  const req = await readV1Request(request);
  if (!req.ok) return req.response;
  const { id } = await ctx.params;
  const system = lookup(id);
  if (!system) return v1Error(404, 'unknown_system', `no system "${id}"`);

  const { input, locale = defaultLocale, ...rest } = req.body;
  const extra = Object.keys(rest);
  if (extra.length) return v1Error(400, 'invalid_request', extra.map((k) => `${k}: unknown field`));
  if (typeof locale !== 'string' || !isLocale(locale)) return v1Error(400, 'invalid_request', 'locale: must be zh-TW or en');
  if (input === undefined) return v1Error(400, 'invalid_input', ['input: required']);

  const result = await runOne(system, input, locale);
  if (!result.ok) return v1Error(result.error === 'invalid_input' ? 400 : 500, result.error, result.detail);
  return v1Json({ apiVersion: API_VERSION, system: id, data: result.data, context: result.context });
}

export function OPTIONS() {
  return v1Preflight();
}
