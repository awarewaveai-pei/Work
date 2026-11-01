// The cold Gmail mailbox an email is written for (drafts are Gmail-only until C8), and therefore whose signature it
// carries (SPEC D12). Same rule as
// gmail-draft/route.ts: the organization's own mailbox first; the agency's (organization_id IS NULL) only for staff --
// a customer never writes as the agency.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SenderRow { id: string; organization_id: string | null; email: string; display_name: string | null; signature_block: string | null }

const COLS = "id, organization_id, email, display_name, signature_block";

/** The oldest active cold Gmail mailbox of the organization whose Gmail connection still exists (a deleted connection
 *  leaves the mailbox row behind; 0152 will link the two by id). */
export async function senderFor(db: SupabaseClient, orgId: string | null, opts: { agencyFallback: boolean }): Promise<SenderRow | null> {
  const pick = async (org: string | null): Promise<SenderRow | null> => {
    let q = db.from("co_sender_accounts").select(COLS).eq("provider", "gmail").eq("stream_type", "cold").eq("is_active", true);
    q = org ? q.eq("organization_id", org) : q.is("organization_id", null);
    const { data, error } = await q.order("created_at", { ascending: true }).limit(20);
    if (error) throw new Error(error.message);
    const senders = (data ?? []) as SenderRow[];
    if (senders.length === 0) return null;
    let c = db.from("co_connector_accounts").select("settings").eq("connector_name", "gmail").eq("is_enabled", true).not("credentials_ref", "is", null);
    c = org ? c.eq("organization_id", org) : c.is("organization_id", null);
    const { data: conns, error: cErr } = await c.limit(50);
    if (cErr) throw new Error(cErr.message);
    const connected = new Set(((conns ?? []) as Array<{ settings: { email?: string } | null }>).map((r) => (r.settings?.email ?? "").toLowerCase()).filter(Boolean));
    return senders.find((s) => connected.has(s.email.toLowerCase())) ?? null;
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
