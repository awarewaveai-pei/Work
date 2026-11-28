import { SITE_SIGNATURE_HEADER, SITE_TICKET_HEADER } from '@/lib/sites/headers';

/**
 * AI 解讀的瀏覽器端請求(components/AiReading.tsx 用;純函式,不碰 React,node 測試可直接跑)。
 *
 * 會員票:框內頁(WordPress 同網域內嵌)送出前向父頁要票 — 父頁腳本
 *   lobster-factory/packages/oracle-wp-plugin/assets/embed-same-origin.js 只替登入訪客定義
 *   window.awOracleTicket(),回 Promise<{ ticket, signature } | null>,每次一張 60 秒的一次性票。
 * - 只認 window.parent 且與本頁同源;跨源讀 parent 會丟 SecurityError → 當作沒有票。不收任何 postMessage。
 * - 拿不到票(不在框內、未定義、null、丟錯、逾時、形狀不對)→ 照匿名送,請求與獨立頁逐位元組相同。
 * - 票只放標頭,不進網址、不存任何儲存。
 * - 帶票被引擎拒絕(401 等)不改用匿名重送:驗票失敗不降級(E4,app/api/interpret/route.ts 的規矩)。
 */
export const TICKET_TIMEOUT_MS = 3000;

export interface MemberTicket {
  ticket: string;
  signature: string;
}

/** 測試可替換的視窗形狀(真實環境傳 window)。 */
export interface FrameWindow {
  parent: unknown;
  location: { origin: string };
}

type TicketFn = () => unknown;

/** 同源父頁的取票函式;不在框內、跨源、未定義 → null。 */
function parentTicketFn(win: FrameWindow): TicketFn | null {
  const parent = win.parent as (FrameWindow & { awOracleTicket?: unknown }) | null | undefined;
  if (!parent || parent === (win as unknown)) return null;
  try {
    // 跨源時讀 parent.location.origin 或任何屬性都會丟錯
    if (parent.location.origin !== win.location.origin) return null;
    const fn = parent.awOracleTicket;
    return typeof fn === 'function' ? () => (fn as TicketFn).call(parent) : null;
  } catch {
    return null;
  }
}

function asTicket(v: unknown): MemberTicket | null {
  if (!v || typeof v !== 'object') return null;
  const { ticket, signature } = v as Record<string, unknown>;
  return typeof ticket === 'string' && ticket !== '' && typeof signature === 'string' && signature !== ''
    ? { ticket, signature }
    : null;
}

export async function readParentTicket(win: FrameWindow, timeoutMs = TICKET_TIMEOUT_MS): Promise<MemberTicket | null> {
  const fn = parentTicketFn(win);
  if (!fn) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return asTicket(await Promise.race([Promise.resolve().then(fn), timeout]));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type InterpretOutcome =
  | { kind: 'ok'; text: string }
  | { kind: 'daily_limit'; retryAfterSec: number | null }
  | { kind: 'error' };

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

/** 呼叫一次 /api/interpret。有票帶兩個標頭;任何失敗都只回一次結果,不重送。 */
export async function requestInterpretation(
  fetchFn: FetchFn,
  payload: unknown,
  ticket: MemberTicket | null,
): Promise<InterpretOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ticket) {
    headers[SITE_TICKET_HEADER] = ticket.ticket;
    headers[SITE_SIGNATURE_HEADER] = ticket.signature;
  }
  try {
    const res = await fetchFn('/api/interpret', { method: 'POST', headers, body: JSON.stringify(payload) });
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (body?.error === 'daily_limit_reached') {
        const sec = Number(res.headers.get('Retry-After'));
        return { kind: 'daily_limit', retryAfterSec: Number.isFinite(sec) && sec > 0 ? sec : null };
      }
      return { kind: 'error' };
    }
    if (!res.ok) return { kind: 'error' };
    const data = (await res.json()) as { text?: unknown };
    return { kind: 'ok', text: typeof data.text === 'string' ? data.text : '' };
  } catch {
    return { kind: 'error' };
  }
}

export type BriefOutcome =
  | { kind: 'ok'; text: string; paidList: string[] }
  | { kind: 'daily_limit'; retryAfterSec: number | null }
  | { kind: 'check_failed' }
  | { kind: 'error' };

/** 呼叫一次 /api/reading 的免費簡批(兩段式解讀,卡 Z2)。會員票同 requestInterpretation;任何失敗只回一次結果。 */
export async function requestBrief(fetchFn: FetchFn, payload: unknown, ticket: MemberTicket | null): Promise<BriefOutcome> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ticket) {
    headers[SITE_TICKET_HEADER] = ticket.ticket;
    headers[SITE_SIGNATURE_HEADER] = ticket.signature;
  }
  try {
    const res = await fetchFn('/api/reading', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = (await res.json().catch(() => null)) as { error?: unknown; text?: unknown; paidList?: unknown } | null;
    if (res.status === 429 && data?.error === 'daily_limit_reached') {
      const sec = Number(res.headers.get('Retry-After'));
      return { kind: 'daily_limit', retryAfterSec: Number.isFinite(sec) && sec > 0 ? sec : null };
    }
    if (data?.error === 'unsupported_claims' || data?.error === 'bad_structure') return { kind: 'check_failed' };
    if (!res.ok || typeof data?.text !== 'string') return { kind: 'error' };
    const paidList = Array.isArray(data.paidList) ? data.paidList.filter((x): x is string => typeof x === 'string') : [];
    return { kind: 'ok', text: data.text, paidList };
  } catch {
    return { kind: 'error' };
  }
}
