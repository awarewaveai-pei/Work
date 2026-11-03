// The cold Gmail mailbox an email is written for (drafts are Gmail-only until C8), and therefore whose signature it
// carries (SPEC D12). Same rule as
// gmail-draft/route.ts: the organization's own mailbox first; the agency's (organization_id IS NULL) only for staff --
// a customer never writes as the agency.
import type { SupabaseClient } from "@supabase/supabase-js";
import { inPool, pickSender, writingLoad, type PoolAccount } from "./sender-pool";

export interface SenderRow { id: string; organization_id: string | null; email: string; display_name: string | null; signature_block: string | null }

const COLS = "id, organization_id, email, display_name, signature_block";

/** The mailbox an email is written for. With sender-pool mailboxes (C8.1, SPEC §5.5): the least loaded of them
 *  (sender-pool.ts pickSender over writingLoad), since the signature binds the email to its mailbox and so the rotation
 *  happens here. Otherwise the oldest active cold Gmail mailbox whose Gmail connection still exists (a deleted
 *  connection leaves the mailbox row behind). */
export async function senderFor(db: SupabaseClient, orgId: string | null, opts: { agencyFallback: boolean }): Promise<SenderRow | null> {
  const pick = async (org: string | null): Promise<SenderRow | null> => {
    let q = db.from("co_sender_accounts").select(`${COLS}, is_active, health_status, send_mode, warmup_stage, daily_limit, connector_id, auto_draft`).eq("provider", "gmail").eq("stream_type", "cold").eq("is_active", true);
    q = org ? q.eq("organization_id", org) : q.is("organization_id", null);
    const { data, error } = await q.order("created_at", { ascending: true }).limit(20);
    if (error) throw new Error(error.message);
    const senders = (data ?? []) as Array<SenderRow & PoolAccount>;
    if (senders.length === 0) return null;
    const pool = senders.filter(inPool);
    if (pool.length) {
      const chosen = pickSender(pool, await writingLoad(db, pool.map((s) => s.id)));
      if (chosen) return senders.find((s) => s.id === chosen.id)!;
    }
    let c = db.from("co_connector_accounts").select("settings").eq("connector_name", "gmail").eq("is_enabled", true).not("credentials_ref", "is", null);
    c = org ? c.eq("organization_id", org) : c.is("organization_id", null);
    const { data: conns, error: cErr } = await c.limit(50);
    if (cErr) throw new Error(cErr.message);
    const connected = new Set(((conns ?? []) as Array<{ settings: { email?: string } | null }>).map((r) => (r.settings?.email ?? "").toLowerCase()).filter(Boolean));
    // A mailbox the pipeline drafts for (auto_draft, 0155) first: written mail must name it, or the pipeline never drafts it.
    const usable = senders.filter((s) => connected.has(s.email.toLowerCase()));
    return usable.find((s) => (s as { auto_draft?: boolean }).auto_draft === true && s.health_status === "healthy") ?? usable[0] ?? null;
  };
  if (orgId) {
    const own = await pick(orgId);
    if (own) return own;
  }
  return opts.agencyFallback ? pick(null) : null;
}

/** The signature a mailbox starts with (SPEC D12): its display name and the organization; the website line is the operator's. */
export function defaultSignature(sender: Pick<SenderRow, "display_name" | "email">, orgName: string | null): string {
  return [sender.display_name ?? sender.email.split("@")[0], orgName].filter(Boolean).join("\n");
}

export const DRAFT_DAILY_LIMIT = 20;
export const POOL_DAILY_LIMIT = 50;

/** The Asia/Taipei calendar day (YYYY-MM-DD): the day every outreach daily cap and warm-up step counts on. */
export const taipeiDay = (at: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** What the Gmail OAuth callback writes to the mailbox row it connected (0152). Every connect links the connector.
 *  A pool connect (SPEC D17, D21) makes a draft mailbox auto at 50/day starting warm-up at w1; a mailbox already in
 *  the pool keeps its stage and start date, so reconnecting never restarts warm-up. existing = null: a new row. */
export function connectedSenderFields(existing: { send_mode: string } | null, opts: { connectorId: string; pool: boolean; today: string }):
  Record<string, string | number> {
  const joinPool = opts.pool && existing?.send_mode !== "auto"
    ? { send_mode: "auto", daily_limit: POOL_DAILY_LIMIT, warmup_stage: "w1", warmup_started_at: opts.today } : {};
  return existing
    ? { connector_id: opts.connectorId, ...joinPool }
    : { provider: "gmail", stream_type: "cold", daily_limit: DRAFT_DAILY_LIMIT, connector_id: opts.connectorId, ...joinPool };
}

export type WarmupStage = "w1" | "w2" | "w3" | "full";
const STAGE_CAPS: Record<Exclude<WarmupStage, "full">, number> = { w1: 10, w2: 20, w3: 35 };
export const NEXT_STAGE: Record<WarmupStage, WarmupStage | null> = { w1: "w2", w2: "w3", w3: "full", full: null };

/** A mailbox's daily cap at its warm-up stage (SPEC D21): 10 / 20 / 35, then its own limit up to 50. */
export const stageCap = (stage: string, dailyLimit: number): number =>
  stage in STAGE_CAPS ? STAGE_CAPS[stage as keyof typeof STAGE_CAPS] : Math.min(POOL_DAILY_LIMIT, dailyLimit);
