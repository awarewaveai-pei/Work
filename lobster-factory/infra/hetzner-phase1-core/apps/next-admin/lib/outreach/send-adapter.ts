// The automatic send (card C8.3-C8.4; SPEC §5.5, D17, D21, D25): the one file that sends mail. never-sends.test.ts
// allows sendGmailDraft (google-oauth.ts, drafts.send) here and nowhere else. Run at the end of each reply-sync tick
// (app/api/internal/outreach/gmail-sync), after reconciliation, for every mailbox in the pool (sender-pool.ts inPool:
// active, healthy, send_mode='auto', linked connector) -- a draft mailbox is never read here. Per mailbox:
//   window      Taipei 09:00-18:00, Monday to Friday; outside it nothing is sent.
//   tick quota  ceil(what is left of its stage cap today / ticks left today), after a 0-120 s jitter.
//   per mail    its Gmail draft (status 'drafted', newest draft_created event names this mailbox), oldest first. A
//               follow-up goes only when it is the lead's lowest unsent step, due (previous sent mail + its delay, and
//               the lead's next_followup_date), drafted in the previous sent mail's thread (card C5.2), and no other
//               mail of that lead went out this tick (critic M3/M4); then Cold Gate again (warm / Meta / evidence) + I6 (contact-guard: do_not_contact, suppression, MX invalid)
//               + a paid verdict valid within 90 days (mailbox-verify.ts; no key = held; risky / unknown stay for a
//               person; invalid is suppressed), except a self-published address whose domain takes mail (D25) -> co_begin_send (lead lock, three caps, drafted -> sending, one
//               transaction) -> drafts.send -> co_mark_sent.
//   failure     Gmail 4xx refused = nothing was sent: the claim is given back, the mail is drafted again, the mailbox
//               paused + timeline + push (sender-health's "重新檢查並恢復" brings it back). 404 (draft gone), timeout,
//               5xx, an unreadable answer: the mail may have gone out, so it stays 'sending' and is never resent here;
//               gmail-sync reconciles it by message id and, 30 minutes on with the draft still unsent, marks it
//               needs_edit and releases the claim (co_mark_unsent).
import type { SupabaseClient } from "@supabase/supabase-js";
import { needsNotice } from "./brand-context";
import { checkColdGate, type ColdGateLead } from "./cold-gate";
import { contactBlock, type ContactBlock, type GuardedLead } from "./contact-guard";
import { sendGmailDraft } from "./google-oauth";
import { freshPaid, saveVerdict, storedVerdict, type PaidProvider, type StoredVerdict } from "./mailbox-verify";
import { beginSend, capOf, inPool, POOL_COLS, releaseClaim, sendCaps, todayClaims, type PoolAccount, type SendCaps } from "./sender-pool";
import { MX_PROVIDER, type EmailStatus } from "./verify-email";

export const WINDOW_START_HOUR = 9;
export const WINDOW_END_HOUR = 18;
export const TICK_MINUTES = 10;
export const JITTER_MAX_MS = 120_000;
// Held mail (a risky address) stays drafted at the head of the queue, its stored verdict read with the queue at no
// extra cost: read far past the quota (critic M2) -- 400 is eight days of a full mailbox held.
const QUEUE_READ = 400;

/** What a follow-up needs to be sent in order and in its thread (C5), read in batches with the queue. */
export interface FollowupInfo {
  /** The step number, and the delay after the previous sent mail. */
  version: number;
  delayDays: number | null;
  /** Another follow-up of this lead with a lower version is not yet sent, skipped or done. */
  lowerUnsent: boolean;
  /** The lead's latest sent mail: when, and its Gmail thread. */
  prevSentAt: string | null;
  prevThreadId: string | null;
  /** The thread of this mail's newest Gmail draft. */
  draftThreadId: string | null;
}

export type SendLead = GuardedLead & ColdGateLead & { id: string; organization_id: string | null; email: string | null; next_followup_date: string | null };
/** verdict: the stored one read with the queue (undefined = not read, ask the store). */
export interface QueuedMail { messageId: string; draftId: string; outputType: string; lead: SendLead; approvedEvidence: number; verdict?: StoredVerdict | null;
  /** Only for outputType 'followup'; absent = unknown, held. */
  followup?: FollowupInfo | null }

export interface SendStore {
  poolAccounts(): Promise<PoolAccount[]>;
  claimsToday(accountIds: string[]): Promise<Map<string, number>>;
  /** This mailbox's Gmail drafts still to send (status 'drafted'), oldest first. */
  queue(accountId: string, limit: number): Promise<QueuedMail[]>;
  contactBlock(lead: SendLead): Promise<ContactBlock | null>;
  verdict(lead: SendLead): Promise<StoredVerdict | null>;
  saveVerdict(lead: SendLead, status: EmailStatus, provider: PaidProvider): Promise<void>;
  /** invalid by a paid verifier: suppression invalid_email (SPEC D25) */
  suppressInvalid(lead: SendLead, provider: PaidProvider): Promise<void>;
  beginSend(messageId: string, accountId: string, email: string, caps: SendCaps): Promise<boolean>;
  markSent(messageId: string, sentAtIso: string, gmailMessageId: string, threadId: string): Promise<boolean>;
  /** Gmail refused: nothing was sent. The claim is released first, so a crash between the two leaves 'sending' with a
   *  released claim, which reconciliation closes 30 minutes on (gmail-sync reads the newest claim, released or not);
   *  the other order could leave a live claim that blocks the mail forever. */
  giveBack(messageId: string): Promise<void>;
  pause(account: PoolAccount, reason: string): Promise<void>;
  timeline(lead: SendLead, eventType: string, title: string, metadata: Record<string, unknown>): Promise<void>;
}

export interface SendDeps {
  store: SendStore;
  tokenFor(account: PoolAccount): Promise<string>;
  /** One paid verification under the organization's outreach.verify grant; null = no verifier key or not allowed. */
  verify(lead: SendLead): Promise<{ status: EmailStatus; provider: PaidProvider } | null>;
  notify(text: string): Promise<void>;
  send?: (token: string, draftId: string) => Promise<{ id: string; threadId: string }>;
  now?: () => Date;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Epoch ms after which no new send starts. */
  deadline?: number;
}

export interface SendResult { window: boolean; mailboxes: number; sent: number; held: number; refused: number; uncertain: number; errors: string[] }

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Taipei clock parts (Taipei has no DST). */
function taipei(at: Date): { weekday: number; minutes: number } {
  const t = new Date(at.getTime() + 8 * 3_600_000);
  return { weekday: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export function inSendWindow(at: Date): boolean {
  const { weekday, minutes } = taipei(at);
  return weekday >= 1 && weekday <= 5 && minutes >= WINDOW_START_HOUR * 60 && minutes < WINDOW_END_HOUR * 60;
}

/** Ticks left in today's window, this one included (≥ 1). */
export function ticksLeft(at: Date): number {
  return Math.max(1, Math.ceil((WINDOW_END_HOUR * 60 - taipei(at).minutes) / TICK_MINUTES));
}

/** How many a mailbox may send this tick: what is left of today's cap spread over the ticks left. */
export const tickQuota = (cap: number, claimedToday: number, at: Date): number =>
  Math.max(0, Math.ceil(Math.max(0, cap - claimedToday) / ticksLeft(at)));

/** The Taipei calendar date (YYYY-MM-DD) of an instant. */
export const taipeiDate = (at: Date): string => new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number): string => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Why a follow-up may not go out now (SPEC §5.7), or null: the lead's lowest unsent step only, due, and drafted in the
 *  thread of the mail it follows (a draft made outside that thread would start a new conversation). */
export function followupHold(mail: QueuedMail, now: Date): string | null {
  const f = mail.followup;
  if (!f) return "followup_no_data";
  if (f.lowerUnsent) return "followup_out_of_order";
  const today = taipeiDate(now);
  const next = mail.lead.next_followup_date;
  if (!f.prevSentAt || f.delayDays === null || addDays(taipeiDate(new Date(f.prevSentAt)), f.delayDays) > today || !next || next > today) return "followup_not_due";
  if (!f.prevThreadId || f.draftThreadId !== f.prevThreadId) return "followup_not_threaded";
  return null;
}

/** Why this queued mail is not sent automatically now, or null. Paid verification runs only for a mail that passed
 *  everything else, so nobody pays to verify a mail that would not go out anyway. */
async function holdReason(deps: SendDeps, mail: QueuedMail, now: Date): Promise<string | null> {
  const lead = mail.lead;
  if (!lead.email) return "no_email";
  if (mail.outputType === "followup") { const hold = followupHold(mail, now); if (hold) return hold; }
  else if (mail.outputType !== "cold_email") return "not_auto";
  if (checkColdGate(lead, mail.approvedEvidence).status === "block") return "cold_gate";
  // A stored risky / unknown / invalid verdict holds the mail without any further lookup (it stays for a person).
  const stored = mail.verdict !== undefined ? mail.verdict : await deps.store.verdict(lead);
  let verdict: { status: EmailStatus; provider: string | null } | null = freshPaid(stored, now);
  if (verdict && verdict.status !== "valid") return `verify_${verdict.status}`;
  const blocked = await deps.store.contactBlock(lead);
  if (blocked) return blocked;
  // SPEC D25 (2026-11-02): an address the business published itself (research read it off its own site or page) whose
  // domain was checked to take mail goes without a paid check; the free paid quota is spent on the rest (inferred,
  // imported, third-party), where mailboxes that do not exist come from. Bounces still pause the mailbox at 3 %.
  // The exemption rests on the MX row only: any verifier verdict (risky / unknown, or one past its 90 days) is asked again.
  if (!verdict && !needsNotice(lead.consent_source) && stored?.provider === MX_PROVIDER && stored.status !== "invalid") return null;
  if (!verdict) {
    const v = await deps.verify(lead);
    if (!v) return "no_verifier";
    await deps.store.saveVerdict(lead, v.status, v.provider);
    if (v.status === "invalid") await deps.store.suppressInvalid(lead, v.provider);
    else if (v.status !== "valid") {
      await deps.store.timeline(lead, "auto_send_held", "信箱驗證結果不確定，這封留給人決定（Gmail 草稿還在）",
        { message_id: mail.messageId, verify_status: v.status, provider: v.provider });
    }
    verdict = v;
  }
  return verdict.status === "valid" ? null : `verify_${verdict.status}`;
}

export async function runAutoSend(deps: SendDeps): Promise<SendResult> {
  const now = deps.now ?? (() => new Date());
  const send = deps.send ?? sendGmailDraft;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const late = (extra = 0) => deps.deadline !== undefined && Date.now() + extra > deps.deadline;
  const r: SendResult = { window: inSendWindow(now()), mailboxes: 0, sent: 0, held: 0, refused: 0, uncertain: 0, errors: [] };
  if (!r.window) return r;

  const pool = (await deps.store.poolAccounts()).filter(inPool);
  if (!pool.length) return r;
  const claimed = await deps.store.claimsToday(pool.map((a) => a.id));
  // At most one mail per lead per tick: the queue was read before any send, so a lead's second follow-up would look due.
  const leadsSent = new Set<string>();

  const runMailbox = async (a: PoolAccount): Promise<void> => {
    const quota = tickQuota(capOf(a), claimed.get(a.id) ?? 0, now());
    if (quota <= 0) return;
    const queue = await deps.store.queue(a.id, QUEUE_READ);
    if (!queue.length) return;
    r.mailboxes++;
    const jitter = Math.floor(random() * JITTER_MAX_MS);
    if (late(jitter)) return;
    await sleep(jitter);
    let token: string | null = null;
    let sent = 0;
    for (const mail of queue) {
      if (sent >= quota || late() || !inSendWindow(now())) return;
      // One mail's failure (a verifier error) holds that mail only, never the mailbox (critic M2).
      let why: string | null;
      try { why = await holdReason(deps, mail, now()); }
      catch (e) { why = "error"; r.errors.push(`${a.email}: ${mail.messageId}: ${errText(e)}`); }
      if (!why && leadsSent.has(mail.lead.id)) why = "lead_sent_this_tick";
      if (why) { r.held++; continue; }
      token ??= await deps.tokenFor(a);
      if (!(await deps.store.beginSend(mail.messageId, a.id, mail.lead.email!, sendCaps(a, pool)))) continue;
      sent++;
      leadsSent.add(mail.lead.id);
      let gmail: { id: string; threadId: string };
      try {
        gmail = await send(token, mail.draftId);
      } catch (e) {
        const outcome = (e as { outcome?: string }).outcome;
        if (outcome === "refused") {
          r.refused++;
          await deps.store.giveBack(mail.messageId);
          await deps.store.pause(a, errText(e));
          await deps.notify(`外聯寄件信箱 ${a.email} 被 Gmail 拒絕寄出，已暫停自動寄出。原因：${errText(e).slice(0, 200)}。到 Connectors 頁按「重新檢查並恢復」。`);
          return;
        }
        // may have gone out: leave 'sending' to reconciliation, and stop this mailbox for the tick
        r.uncertain++;
        r.errors.push(`${a.email}: ${errText(e)}`);
        return;
      }
      r.sent++;
      // The mail is out. A failed write here is reconciled by gmail-sync (it finds the SENT message), never resent.
      try { await deps.store.markSent(mail.messageId, now().toISOString(), gmail.id, gmail.threadId); }
      catch (e) { r.errors.push(`${a.email}: sent ${gmail.id} but not recorded yet: ${errText(e)}`); }
    }
  };

  await Promise.all(pool.map((a) => runMailbox(a).catch((e) => { r.errors.push(`${a.email}: ${errText(e)}`); })));
  return r;
}

const fail = (what: string, error: { message: string } | null): void => { if (error) throw new Error(`${what}: ${error.message}`); };
const LEAD_COLS = "id, organization_id, name, email, website, do_not_contact, status, consent_source, source_url, next_followup_date";

const FOLLOWUP_DONE = new Set(["sent", "skipped", "copied"]);

/** The batch read behind followupHold: every follow-up row of the queued follow-ups' leads (step order), each lead's latest
 *  sent mail and that mail's thread. A few queries for the whole queue, none per mail. */
async function followupInfo(db: SupabaseClient, queued: Array<{ messageId: string; leadId: string; draftThreadId: string | null }>): Promise<Map<string, FollowupInfo>> {
  const out = new Map<string, FollowupInfo>();
  if (!queued.length) return out;
  const leadIds = [...new Set(queued.map((q) => q.leadId))];
  type Msg = { id: string; lead_id: string; output_type: string; version: number; status: string; sent_at: string | null; followup_delay_days: number | null };
  const msgs: Msg[] = [];
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error } = await db.from("co_messages").select("id, lead_id, output_type, version, status, sent_at, followup_delay_days").in("lead_id", leadIds.slice(i, i + 100));
    fail("follow-up rows read failed", error);
    msgs.push(...((data ?? []) as Msg[]));
  }
  const lastSent = new Map<string, Msg>();
  for (const m of msgs) {
    if (m.status !== "sent" || !m.sent_at) continue;
    const cur = lastSent.get(m.lead_id);
    if (!cur || Date.parse(m.sent_at) > Date.parse(cur.sent_at!)) lastSent.set(m.lead_id, m);
  }
  const threads = new Map<string, string>();
  const sentIds = [...lastSent.values()].map((m) => m.id);
  for (let i = 0; i < sentIds.length; i += 100) {
    const { data, error } = await db.from("co_sending_events").select("message_id, metadata, created_at").eq("event_type", "sent")
      .in("message_id", sentIds.slice(i, i + 100)).order("created_at", { ascending: false });
    fail("sent events read failed", error);
    for (const e of (data ?? []) as Array<{ message_id: string; metadata: { threadId?: string } | null }>) {
      if (e.metadata?.threadId && !threads.has(e.message_id)) threads.set(e.message_id, e.metadata.threadId);
    }
  }
  for (const q of queued) {
    const me = msgs.find((m) => m.id === q.messageId);
    if (!me) continue;
    const prev = lastSent.get(q.leadId);
    out.set(q.messageId, {
      version: me.version, delayDays: me.followup_delay_days,
      lowerUnsent: msgs.some((m) => m.lead_id === q.leadId && m.output_type === "followup" && m.version < me.version && !FOLLOWUP_DONE.has(m.status)),
      prevSentAt: prev?.sent_at ?? null, prevThreadId: prev ? threads.get(prev.id) ?? null : null, draftThreadId: q.draftThreadId,
    });
  }
  return out;
}

export function supabaseSendStore(db: SupabaseClient): SendStore {
  return {
    async poolAccounts() {
      // A disabled or token-less Gmail connector stops its mailbox, the same rule the reply sync reads (Codex F2).
      const { data, error } = await db.from("co_sender_accounts").select(`${POOL_COLS}, co_connector_accounts!inner(id)`)
        .eq("stream_type", "cold").eq("provider", "gmail").eq("send_mode", "auto").eq("is_active", true).eq("health_status", "healthy")
        .not("connector_id", "is", null).eq("co_connector_accounts.is_enabled", true).not("co_connector_accounts.credentials_ref", "is", null)
        .order("created_at").limit(500);
      fail("pool read failed", error);
      return ((data ?? []) as unknown as Array<PoolAccount & { co_connector_accounts?: unknown }>).map(({ co_connector_accounts: _c, ...a }) => a);
    },
    claimsToday: (ids) => todayClaims(db, ids),
    async queue(accountId, limit) {
      // The newest draft_created event of each drafted email names the mailbox whose Gmail holds the draft.
      const { data, error } = await db.from("co_sending_events")
        .select("message_id, provider_event_id, metadata, created_at, co_messages!inner(id, status, output_type, lead_id)")
        .eq("event_type", "draft_created").eq("sender_account_id", accountId).eq("co_messages.status", "drafted")
        .order("created_at", { ascending: true }).limit(limit * 2);
      fail("send queue read failed", error);
      type Row = { message_id: string; provider_event_id: string | null; metadata: { draftId?: string; threadId?: string | null } | null; sender_account_id?: string;
        co_messages: { id: string; output_type: string; lead_id: string } };
      const seen: Row[] = [];
      for (const row of (data ?? []) as unknown as Row[]) if (!seen.some((x) => x.message_id === row.message_id)) seen.push(row);
      if (!seen.length) return [];
      // A mail drafted again (needs_edit -> re-approved -> new draft) has a newer event: only the newest names the live
      // draft and its mailbox (Codex F3), the same rule gmail-sync pendingSends uses.
      const { data: latest, error: lateErr } = await db.from("co_sending_events").select("message_id, provider_event_id, metadata, sender_account_id")
        .eq("event_type", "draft_created").in("message_id", seen.map((x) => x.message_id)).order("created_at", { ascending: false });
      fail("latest draft events read failed", lateErr);
      const newest = new Map<string, Row>();
      for (const e of (latest ?? []) as unknown as Row[]) if (!newest.has(e.message_id)) newest.set(e.message_id, e);
      const rows: Row[] = [];
      for (const x of seen) {
        const n = newest.get(x.message_id);
        if (n && n.sender_account_id === accountId) rows.push({ ...x, provider_event_id: n.provider_event_id, metadata: n.metadata });
      }
      const leadIds = [...new Set(rows.map((x) => x.co_messages.lead_id))];
      if (!leadIds.length) return [];
      const { data: leads, error: lErr } = await db.from("co_leads").select(LEAD_COLS).in("id", leadIds);
      fail("queue leads read failed", lErr);
      const { data: ev, error: eErr } = await db.from("co_evidence").select("lead_id").in("lead_id", leadIds).eq("status", "approved");
      fail("queue evidence read failed", eErr);
      const evidence = new Map<string, number>();
      for (const e of (ev ?? []) as Array<{ lead_id: string }>) evidence.set(e.lead_id, (evidence.get(e.lead_id) ?? 0) + 1);
      const byId = new Map(((leads ?? []) as SendLead[]).map((l) => [l.id, l]));
      // Every queued address's newest stored verdict, read in chunks with the queue (cached holds cost nothing per mail).
      const verdicts = new Map<string, StoredVerdict>();
      const emails = [...new Set([...byId.values()].map((l) => (l.email ?? "").trim().toLowerCase()).filter(Boolean))];
      for (let i = 0; i < emails.length; i += 200) {
        const { data: vs, error: vErr } = await db.from("co_verified_emails").select("organization_id, email, status, provider, verified_at")
          .in("email", emails.slice(i, i + 200)).order("verified_at", { ascending: false });
        fail("queue verdicts read failed", vErr);
        for (const v of (vs ?? []) as Array<StoredVerdict & { organization_id: string | null; email: string }>) {
          const k = `${v.organization_id ?? ""}|${v.email}`;
          if (!verdicts.has(k)) verdicts.set(k, v);
        }
      }
      const followups = await followupInfo(db, rows.filter((x) => x.co_messages.output_type === "followup").map((x) => ({ messageId: x.message_id, leadId: x.co_messages.lead_id,
        draftThreadId: x.metadata?.threadId ?? null })));
      const out: QueuedMail[] = [];
      for (const x of rows) {
        const lead = byId.get(x.co_messages.lead_id);
        const draftId = x.metadata?.draftId ?? x.provider_event_id;
        if (lead && draftId) out.push({ messageId: x.message_id, draftId, outputType: x.co_messages.output_type, lead, approvedEvidence: evidence.get(lead.id) ?? 0,
          verdict: verdicts.get(`${lead.organization_id ?? ""}|${(lead.email ?? "").trim().toLowerCase()}`) ?? null,
          ...(x.co_messages.output_type === "followup" ? { followup: followups.get(x.message_id) ?? null } : {}) });
      }
      return out.slice(0, limit);
    },
    contactBlock: (lead) => contactBlock(db, lead),
    verdict: (lead) => storedVerdict(db, lead.organization_id, lead.email ?? ""),
    saveVerdict: (lead, status, provider) => saveVerdict(db, lead.organization_id, lead.email ?? "", status, provider, new Date()),
    async suppressInvalid(lead, provider) {
      const email = (lead.email ?? "").trim().toLowerCase();
      const { error } = await db.from("co_suppression_list").insert({ organization_id: lead.organization_id, email, lead_id: lead.id,
        reason: "invalid_email", source: `verify:${provider}`, applies_to: "all", scope: "email" });
      fail("suppression insert failed", error);
      await this.timeline(lead, "suppressed", "付費驗證判定信箱不存在，已加入拒收", { email, provider });
    },
    beginSend: (messageId, accountId, email, caps) => beginSend(db, messageId, accountId, email, caps),
    async markSent(messageId, sentAtIso, gmailMessageId, threadId) {
      const { data, error } = await db.rpc("co_mark_sent", { p_message_id: messageId, p_sent_at: sentAtIso, p_gmail_message_id: gmailMessageId, p_thread_id: threadId });
      fail("co_mark_sent failed", error);
      return data === true;
    },
    async giveBack(messageId) {
      await releaseClaim(db, messageId);
      const { error } = await db.from("co_messages").update({ status: "drafted" }).eq("id", messageId).eq("status", "sending");
      fail("message give-back failed", error);
    },
    async pause(account, reason) {
      const { error } = await db.from("co_sender_accounts").update({ health_status: "paused", updated_at: new Date().toISOString() })
        .eq("id", account.id).neq("health_status", "blocked");
      fail("sender pause failed", error);
      const { error: tErr } = await db.from("co_timeline_events").insert({ organization_id: account.organization_id, lead_id: null,
        event_type: "sender_health", title: `${account.email}：Gmail 拒絕寄出，已暫停自動寄出`,
        metadata: { sender_account_id: account.id, health: "paused", reasons: [reason.slice(0, 500)] } });
      fail("timeline insert failed", tErr);
    },
    async timeline(lead, eventType, title, metadata) {
      const { error } = await db.from("co_timeline_events").insert({ organization_id: lead.organization_id, lead_id: lead.id, event_type: eventType, title, metadata });
      fail("timeline insert failed", error);
    },
  };
}
