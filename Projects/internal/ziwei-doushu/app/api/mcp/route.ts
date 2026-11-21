import { handleRequest, ERR, PROTOCOL_VERSIONS, type JsonRpcError } from '@/lib/mcp/server';
import { API_RULE, clientSource, hit } from '@/lib/http/rateLimit';
import { MAX_BODY_BYTES } from '@/lib/http/v1';

/**
 * MCP 端點 /api/mcp — Streamable HTTP 傳輸,無狀態(無 Mcp-Session-Id)。
 *
 * 支援範圍(手寫最小集合,未引入 @modelcontextprotocol/sdk):
 * - 協定版本 2025-11-25、2025-06-18、2025-03-26(lib/mcp/server.ts PROTOCOL_VERSIONS)。
 * - POST 單一 JSON-RPC 訊息:initialize、ping、tools/list、tools/call → 200 application/json;
 *   通知(notifications/initialized 等)與回應 → 202 無內容。不支援批次(2025-06-18 起規格已移除)。
 * - 不開 SSE 串流:GET、DELETE → 405。伺服器不主動發訊息,也沒有 resources/prompts。
 * - Origin(規格要求防 DNS rebinding):沒帶 Origin(伺服器端客戶端)放行;帶了就必須與本站同源,否則 403。
 * - MCP-Protocol-Version 標頭帶了不支援的版本 → 400。
 * 安全:沿用 REST v1 的限流額度(另計 scope 'mcp')與 body 上限;不呼叫 AI、不存輸入、不回堆疊。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Id = string | number | null;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });
const rpcError = (id: Id, error: JsonRpcError, status = 200, headers: Record<string, string> = {}) =>
  json({ jsonrpc: '2.0', id, error }, status, headers);

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const host = request.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!originAllowed(request)) return rpcError(null, ERR.invalidRequest('Origin not allowed'), 403);

  const limit = hit('mcp', clientSource(request), API_RULE);
  if (!limit.ok) {
    return rpcError(null, { code: -32000, message: `Too many requests; retry in ${limit.retryAfterSec}s` }, 429, {
      'Retry-After': String(limit.retryAfterSec),
    });
  }

  const version = request.headers.get('mcp-protocol-version');
  if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return rpcError(null, ERR.invalidRequest(`Unsupported MCP-Protocol-Version: ${version}`), 400);
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return rpcError(null, ERR.invalidRequest(`Body larger than ${MAX_BODY_BYTES} bytes`), 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return rpcError(null, ERR.invalidRequest(`Body larger than ${MAX_BODY_BYTES} bytes`), 413);
  }

  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return rpcError(null, ERR.parse, 400);
  }
  if (Array.isArray(msg)) return rpcError(null, ERR.invalidRequest('Batch requests are not supported'), 400);
  if (typeof msg !== 'object' || msg === null || (msg as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
    return rpcError(null, ERR.invalidRequest('Expected a JSON-RPC 2.0 message'), 400);
  }
  const m = msg as { id?: unknown; method?: unknown; params?: unknown };

  // 通知(無 id)與客戶端送來的回應(無 method):照規格回 202,不處理
  if (m.id === undefined || typeof m.method !== 'string') return new Response(null, { status: 202 });
  if (typeof m.id !== 'string' && typeof m.id !== 'number') {
    return rpcError(null, ERR.invalidRequest('id must be a string or number'), 400);
  }

  const outcome = await handleRequest(m.method, m.params);
  return 'error' in outcome
    ? rpcError(m.id, outcome.error)
    : json({ jsonrpc: '2.0', id: m.id, result: outcome.result });
}

const notAllowed = () =>
  new Response(null, { status: 405, headers: { Allow: 'POST' } });

/** 不提供伺服器主動推送的 SSE 串流。 */
export function GET() {
  return notAllowed();
}

/** 無狀態,沒有可結束的 session。 */
export function DELETE() {
  return notAllowed();
}
