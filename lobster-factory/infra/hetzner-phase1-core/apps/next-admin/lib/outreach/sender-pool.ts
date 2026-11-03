// The sender pool (card C8.1; SPEC §5.5, D21): which mailbox writes and sends next, and the RPC that takes a send's
// place in the three caps. Caps are the warm-up stage caps (sender.ts stageCap), never a raised limit on one mailbox
// (I10). co_begin_send (0152) only counts: the caps it compares against are computed here.
//   pickSender: the in-pool mailbox with the lowest load / today's cap (round-robin by fill).
//   sendCaps:   mailbox today = its stage cap; sender domain today = the stage caps of its in-pool mailboxes summed;
//               recipient (domain, or the address on free mail) = 2 in 30 days (deliverability §6.1-6.2).
//   beginSend:  co_begin_send -- false = a cap is full, another send took it first, or the lead may no longer be mailed.
//   releaseClaim: only after reconciliation proved the mail was not sent (co_mark_unsent does the same in its transaction).
import type { SupabaseClient } from "@supabase/supabase-js";
import { stageCap, taipeiDay } from "./sender";

export const RECIPIENT_30D_CAP = 2;

export interface PoolAccount {
  id: string;
  organization_id: string | null;
  email: string;
  is_active: boolean;
  health_status: string;
  send_mode: string;
  warmup_stage: string;
  daily_limit: number;
  connector_id: string | null;
  /** Read by send-adapter only (0157): a draft-mode mailbox's test-send window; never makes a mailbox part of the pool. */
  test_send_until?: string | null;
  test_recipients?: string[];
}
export const POOL_COLS = "id, organization_id, email, is_active, health_status, send_mode, warmup_stage, daily_limit, connector_id";

export interface SendCaps { mailbox: number; sender_domain: number; recipient_30d: number }

/** In the pool and allowed to send now: active, healthy, auto, and linked to the Gmail connector that holds its token. */
export const inPool = (a: PoolAccount): boolean =>
  a.is_active && a.health_status === "healthy" && a.send_mode === "auto" && !!a.connector_id;
/** A draft-mode mailbox whose test-send window is open now (0157): active, healthy, linked, with recipients. Sends only to them. */
export const testingNow = (a: PoolAccount, at: Date): boolean =>
  a.send_mode === "draft" && a.is_active && a.health_status === "healthy" && !!a.connector_id && !!a.test_send_until
  && Date.parse(a.test_send_until) > at.getTime() && (a.test_recipients?.length ?? 0) > 0;
export const capOf = (a: Pick<PoolAccount, "warmup_stage" | "daily_limit">): number => stageCap(a.warmup_stage, a.daily_limit);
/** A test-send window's daily cap: every mail goes to the operator's own addresses, so a test run is not throttled like cold mail. */
export const TEST_DAILY_CAP = 100;
/** Today's cap of a mailbox runAutoSend sends from: a pool mailbox's stage cap; the only other kind it sends from is a test window. */
export const mailboxCap = (a: PoolAccount): number => (inPool(a) ? capOf(a) : TEST_DAILY_CAP);
/** A test recipient's identity: lower-case, any +tag dropped, so one listed mailbox covers name+t1@, name+t2@ ... (each still its own
 *  address for the 2-in-30-days recipient cap). */
export const testRecipientKey = (email: string): string => {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
};
export const domainOfEmail = (email: string): string => (email.trim().toLowerCase().split("@")[1] ?? "");

/** The in-pool mailbox whose load is the smallest share of its cap (ties: the smaller load, then the id), or null when
 *  none is in the pool. A full one can still be chosen: mail written today may go out on a later day, and whether it may
 *  go out now is co_begin_send's to say. load = today's claims plus the first emails queued for the mailbox. */
export function pickSender(accounts: readonly PoolAccount[], load: ReadonlyMap<string, number>): PoolAccount | null {
  const open = accounts.filter(inPool).map((a) => ({ a, cap: capOf(a), n: load.get(a.id) ?? 0 })).filter((x) => x.cap > 0);
  open.sort((x, y) => x.n / x.cap - y.n / y.cap || x.n - y.n || (x.a.id < y.a.id ? -1 : 1));
  return open[0]?.a ?? null;
}

/** The caps co_begin_send compares against. pool = every in-pool candidate on any domain; only this domain's count. */
export function sendCaps(account: PoolAccount, pool: readonly PoolAccount[]): SendCaps {
  const domain = domainOfEmail(account.email);
  const onDomain = pool.filter((a) => inPool(a) && domainOfEmail(a.email) === domain);
  const sum = onDomain.reduce((n, a) => n + capOf(a), 0);
  return { mailbox: mailboxCap(account), sender_domain: Math.max(sum, mailboxCap(account)), recipient_30d: RECIPIENT_30D_CAP };
}

/** The Asia/Taipei midnight that today's caps count from, as an ISO instant (0152 v_today). */
export const taipeiDayStartIso = (at: Date = new Date()): string => new Date(`${taipeiDay(at)}T00:00:00+08:00`).toISOString();

const fail = (what: string, error: { message: string } | null): void => { if (error) throw new Error(`${what}: ${error.message}`); };

/** Today's live (unreleased) claims per mailbox. */
export async function todayClaims(sb: SupabaseClient, accountIds: readonly string[], now: Date = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>(accountIds.map((id) => [id, 0]));
  if (!accountIds.length) return out;
  // ≤ 50 a mailbox a day: one page holds every account's claims.
  const { data, error } = await sb.from("co_send_claims").select("sender_account_id").in("sender_account_id", [...accountIds])
    .is("released_at", null).gte("claimed_at", taipeiDayStartIso(now)).limit(10_000);
  fail("send claims read failed", error);
  for (const r of (data ?? []) as Array<{ sender_account_id: string }>) out.set(r.sender_account_id, (out.get(r.sender_account_id) ?? 0) + 1);
  return out;
}

/** The load used when choosing the mailbox an email is written for (sender.ts senderFor): today's claims plus the first
 *  emails already written for it and not yet sent. Claims alone would hand a whole generation batch to one mailbox. */
export async function writingLoad(sb: SupabaseClient, accountIds: readonly string[], now: Date = new Date()): Promise<Map<string, number>> {
  const out = await todayClaims(sb, accountIds, now);
  for (const id of accountIds) {
    const { count, error } = await sb.from("co_messages").select("id", { count: "exact", head: true })
      .eq("output_type", "cold_email").in("status", ["draft", "approved", "drafted"]).eq("prompt_snapshot->>sender_id", id);
    fail("queued messages count failed", error);
    out.set(id, (out.get(id) ?? 0) + (count ?? 0));
  }
  return out;
}

export async function beginSend(sb: SupabaseClient, messageId: string, accountId: string, recipientEmail: string, caps: SendCaps): Promise<boolean> {
  const { data, error } = await sb.rpc("co_begin_send", { p_message_id: messageId, p_sender_account_id: accountId,
    p_recipient_email: recipientEmail, p_caps: caps });
  fail("co_begin_send failed", error);
  return data === true;
}

export async function releaseClaim(sb: SupabaseClient, messageId: string): Promise<void> {
  const { error } = await sb.from("co_send_claims").update({ released_at: new Date().toISOString() })
    .eq("message_id", messageId).is("released_at", null);
  fail("claim release failed", error);
}
