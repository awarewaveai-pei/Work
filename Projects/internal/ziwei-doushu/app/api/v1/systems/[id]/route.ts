import '@/lib/divination';
import { getSystem } from '@/lib/divination/registry';
import { describeSpec, parseInput } from '@/lib/divination/input';
import { SYSTEM_IDS, type SystemId } from '@/lib/divination/types';
import { defaultLocale, isLocale } from '@/lib/i18n/config';
import { API_VERSION, MAX_BODY_BYTES, v1Error, v1Json, v1Preflight, v1RateLimited } from '@/lib/http/v1';

/**
 * POST /api/v1/systems/{id}  body { input, locale? } → { apiVersion, system, data, context }
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
  const limited = v1RateLimited(request);
  if (limited) return limited;
  const { id } = await ctx.params;
  const system = lookup(id);
  if (!system) return v1Error(404, 'unknown_system', `no system "${id}"`);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return v1Error(400, 'invalid_request', `body larger than ${MAX_BODY_BYTES} bytes`);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return v1Error(400, 'invalid_request', `body larger than ${MAX_BODY_BYTES} bytes`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return v1Error(400, 'invalid_request', 'body is not JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return v1Error(400, 'invalid_request', 'body must be { input, locale? }');
  }
  const { input, locale = defaultLocale, ...rest } = body as Record<string, unknown>;
  const extra = Object.keys(rest);
  if (extra.length) return v1Error(400, 'invalid_request', extra.map((k) => `${k}: unknown field`));
  if (typeof locale !== 'string' || !isLocale(locale)) return v1Error(400, 'invalid_request', 'locale: must be zh-TW or en');

  if (input === undefined) return v1Error(400, 'invalid_input', ['input: required']);

  try {
    const parsed = parseInput(system.input, input);
    if (!parsed.ok) {
      return v1Error(400, 'invalid_input', parsed.errors.map((e) => (e.startsWith('input:') ? e : `input.${e}`)));
    }
    const { data, context } = await system.compute(parsed.value, locale);
    // 紫微 astrolabe 等功能物件在這裡經自己的 toJSON() 變成純 JSON
    return v1Json({ apiVersion: API_VERSION, system: id, data: JSON.parse(JSON.stringify(data)), context });
  } catch {
    return v1Error(500, 'compute_failed', 'the engine could not compute this input');
  }
}

export function OPTIONS() {
  return v1Preflight();
}
