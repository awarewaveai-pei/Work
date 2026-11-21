import { API_RULE, rateLimited } from './rateLimit';

/**
 * 對外資料介面 v1 共用:版本、CORS、錯誤格式、限流。
 * CORS 對任意來源開放(WordPress 外掛等從別的網域嵌入),不帶憑證:v1 沒有帳號、沒有 cookie。
 */
export const API_VERSION = '1';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** 單次請求 body 上限(位元組);最大的合婚輸入也遠低於此。 */
export const MAX_BODY_BYTES = 32_768;

export function v1Json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

/** 統一錯誤格式 { error, detail };不帶堆疊或內部訊息。 */
export function v1Error(status: 400 | 404 | 500, error: string, detail: string | string[]): Response {
  return v1Json({ error, detail }, status);
}

export function v1Preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function v1RateLimited(request: Request): Response | null {
  return rateLimited(request, 'v1', API_RULE, CORS_HEADERS);
}
