import { createHash } from 'node:crypto';
import type { Site } from './registry';
import { verifySiteRequest } from './verify';
import { DEFAULT_DAY_DIVIDE } from '@/lib/dates';

/**
 * 深度報告購買票(卡 Z2 只做驗證;簽發在 Z3 的 WordPress 外掛)。
 * - 原文 = JSON {"key_id","ts","nonce","aud":"report","member","report","chart"},簽法同會員票(verifySiteRequest:Ed25519、ts ±60 秒、nonce 一次);
 * - 走同一組標頭(SITE_TICKET_HEADER = base64url(原文)、SITE_SIGNATURE_HEADER);aud=report 與會員票(ticket)互不通用;
 * - report = 報告種類(紫微 = ziwei-deep);chart = 這張盤的 chartKey(簡批回應附帶,站台購買時記下);
 * - 擁有權:票上的 report 與 chart 必須和這次要產生的報告一致,拿別張盤或別種報告的票一律 403。
 * 原文只准這七個欄位。
 */
const MEMBER = /^[A-Za-z0-9_-]{16,64}$/;
const CHART = /^[0-9a-f]{64}$/;
const REPORT = /^[a-z0-9-]{1,40}$/;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const MAX_TICKET_CHARS = 1024;

export type PurchaseAuth =
  | { ok: true; site: Site; member: string }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

export function verifyPurchaseTicket(
  ticket: string | null,
  signature: string | null,
  expected: { report: string; chart: string },
  now: number = Math.floor(Date.now() / 1000),
  env: Record<string, string | undefined> = process.env,
): PurchaseAuth {
  if (ticket === null) return { ok: false, status: 401, error: 'purchase_required' };
  if (ticket.length > MAX_TICKET_CHARS || !BASE64URL.test(ticket)) return { ok: false, status: 400, error: 'invalid_ticket' };
  const auth = verifySiteRequest(Buffer.from(ticket, 'base64url').toString('utf8'), signature, 'report', now, env);
  if (!auth.ok) return auth;
  const { member, report, chart, ...rest } = auth.payload;
  if (
    Object.keys(rest).length > 0 ||
    typeof member !== 'string' || !MEMBER.test(member) ||
    typeof report !== 'string' || !REPORT.test(report) ||
    typeof chart !== 'string' || !CHART.test(chart)
  ) {
    return { ok: false, status: 400, error: 'invalid_ticket' };
  }
  if (report !== expected.report || chart !== expected.chart) return { ok: false, status: 403, error: 'not_purchased' };
  return { ok: true, site: auth.site, member };
}

/**
 * 一張盤的識別:出生資料的固定欄位順序 JSON 取 SHA-256。同一份出生資料(不分語系、不分今天)必同。
 * 只放排盤用得到的欄位;地點只取經緯度與時區(名稱不影響排盤)。
 */
export function chartKey(systemId: string, birth: Record<string, unknown>): string {
  const place = birth.place as { lat?: unknown; lon?: unknown; zone?: unknown } | undefined;
  const canonical = [
    systemId,
    birth.calendar, birth.year, birth.month, birth.day, birth.hour, birth.minute,
    birth.isLeapMonth === true, birth.gender ?? null,
    place ? [place.lat, place.lon, place.zone] : null,
    birth.trueSolar === true, birth.dayDivide ?? DEFAULT_DAY_DIVIDE,
  ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
