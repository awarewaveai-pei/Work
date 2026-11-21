import { API_RULE, SITE_PREAUTH_RULE, rateLimited, siteRateLimited } from './rateLimit';
import { SITE_SIGNATURE_HEADER, verifySiteRequest } from '@/lib/sites/verify';
import type { Site } from '@/lib/sites/registry';

/**
 * 對外資料介面 v1 共用:版本、CORS、錯誤格式、限流。
 * CORS 對任意來源開放(WordPress 外掛等從別的網域嵌入),不帶憑證:v1 沒有帳號、沒有 cookie。
 */
export const API_VERSION = '1';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-AwareWave-Oracle-Signature',
  'Access-Control-Max-Age': '86400',
};

/** 單次請求 body 上限(位元組);最大的合婚輸入也遠低於此。 */
export const MAX_BODY_BYTES = 32_768;
/** 批次 body 上限:200 筆出生資料約 60 KB。 */
export const MAX_BATCH_BODY_BYTES = 524_288;
/** 批次每次最多幾筆。 */
export const MAX_BATCH_ITEMS = 200;

export function v1Json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

/** 統一錯誤格式 { error, detail };不帶堆疊或內部訊息。 */
export function v1Error(status: 400 | 401 | 404 | 500, error: string, detail: string | string[]): Response {
  return v1Json({ error, detail }, status);
}

export function v1Preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function v1RateLimited(request: Request): Response | null {
  return rateLimited(request, 'v1', API_RULE, CORS_HEADERS);
}

export type V1Request =
  | { ok: true; body: Record<string, unknown>; site: Site | null }
  | { ok: false; response: Response };

/**
 * 讀 body 並決定這次請求算誰的額度:
 * - 帶 X-AwareWave-Oracle-Signature = 站台伺服器呼叫:驗簽(lib/sites/verify.ts),以 key_id 另計額度,
 *   body 去掉 key_id／ts／nonce 後回傳;
 * - 沒帶 = 匿名呼叫:依來源位址限流。
 * weight(body) = 這次要算幾次額度(批次按筆數);不合法的 body 算 1 次。
 * requireSite:只給站台用的端點(批次),沒簽章直接 401。
 */
export async function readV1Request(
  request: Request,
  opts: { requireSite?: boolean; weight?: (body: Record<string, unknown>) => number; maxBytes?: number } = {},
): Promise<V1Request> {
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;
  const signature = request.headers.get(SITE_SIGNATURE_HEADER);
  if (signature === null && opts.requireSite) {
    return { ok: false, response: v1Error(401, 'signature_required', 'this endpoint is for registered sites only') };
  }
  // 讀 body、驗簽之前一律先依來源位址限流;簽章請求用較寬的預驗額度,通過驗簽後再改計 key_id 額度
  const preLimited = signature === null ? v1RateLimited(request) : rateLimited(request, 'site-preauth', SITE_PREAUTH_RULE, CORS_HEADERS);
  if (preLimited) return { ok: false, response: preLimited };
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return { ok: false, response: v1Error(400, 'invalid_request', `body larger than ${maxBytes} bytes`) };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false, response: v1Error(400, 'invalid_request', `body larger than ${maxBytes} bytes`) };
  }
  if (signature !== null) {
    const auth = verifySiteRequest(text, signature);
    if (!auth.ok) return { ok: false, response: v1Error(auth.status, auth.error, 'site request rejected') };
    const weight = Math.max(1, opts.weight?.(auth.payload) ?? 1);
    const limited = siteRateLimited(auth.site.keyId, auth.site.requestsPerMinute, weight, CORS_HEADERS);
    if (limited) return { ok: false, response: limited };
    return { ok: true, body: auth.payload, site: auth.site };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: v1Error(400, 'invalid_request', 'body is not JSON') };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, response: v1Error(400, 'invalid_request', 'body must be a JSON object') };
  }
  return { ok: true, body: body as Record<string, unknown>, site: null };
}
