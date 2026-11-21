import type { Site } from './registry';
import { verifySiteRequest } from './verify';

/**
 * 會員票:站台(WordPress 外掛)替登入會員簽的一次性短效票,框內頁呼叫 AI 解讀時帶上。
 * - 原文 = JSON {"key_id","ts","nonce","member"},簽法與站台請求相同(verifySiteRequest:Ed25519、ts ±60 秒、nonce 一次);
 * - 標頭 X-AwareWave-Oracle-Ticket = base64url(原文),X-AwareWave-Oracle-Signature = base64(Ed25519(原文));
 * - member = 站台給的假名(16–64 個 [A-Za-z0-9_-]),引擎只拿來計額度,不知道是誰。
 * 原文只准這四個欄位:站台對 /api/v1 的請求一定帶別的欄位,兩者不能互相冒用。
 */
export const SITE_TICKET_HEADER = 'x-awarewave-oracle-ticket';
const MEMBER = /^[A-Za-z0-9_-]{16,64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
/** 四個欄位的原文遠小於此;超過就不解碼。 */
const MAX_TICKET_CHARS = 1024;

export type TicketAuth =
  | { ok: true; site: Site; member: string }
  | { ok: false; status: 400 | 401 | 404; error: string };

export function verifyTicket(
  ticket: string,
  signature: string | null,
  now: number = Math.floor(Date.now() / 1000),
  env: Record<string, string | undefined> = process.env,
): TicketAuth {
  if (ticket.length > MAX_TICKET_CHARS || !BASE64URL.test(ticket)) return { ok: false, status: 400, error: 'invalid_ticket' };
  const auth = verifySiteRequest(Buffer.from(ticket, 'base64url').toString('utf8'), signature, now, env);
  if (!auth.ok) return auth;
  const { member, ...rest } = auth.payload;
  if (Object.keys(rest).length > 0 || typeof member !== 'string' || !MEMBER.test(member)) {
    return { ok: false, status: 400, error: 'invalid_ticket' };
  }
  return { ok: true, site: auth.site, member };
}
