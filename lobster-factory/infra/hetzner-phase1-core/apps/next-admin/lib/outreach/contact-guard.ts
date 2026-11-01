// Why a lead may not be contacted right now (SPEC I6). Asked again at every send-side step -- creating the draft
// (messages/gmail-draft) and sending (send-adapter, C8) -- not only at import, because a lead can be suppressed,
// marked do_not_contact or found undeliverable between generation and the draft. Suppression comes from the same
// reader the import uses (suppression.ts); the address is checked live (verify-email.ts, cached when definitive),
// so a lead added by hand, never imported, is checked too.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findSuppressed } from "./suppression";
import { verifyEmails } from "./verify-email";

export type ContactBlock = "do_not_contact" | "suppressed" | "email_invalid";
export interface GuardedLead { organization_id: string | null; email: string | null; website?: string | null; name?: string | null; do_not_contact?: boolean | null }

export async function contactBlock(db: SupabaseClient, lead: GuardedLead): Promise<ContactBlock | null> {
  if (lead.do_not_contact) return "do_not_contact";
  const [suppressed] = await findSuppressed(db, lead.organization_id, [{ email: lead.email, website: lead.website ?? null, name: lead.name ?? null }]);
  if (suppressed) return "suppressed";
  if (lead.email) {
    // A malformed address (whitespace, a line break that would inject a header after To:) is "invalid" there too.
    const status = (await verifyEmails(db, lead.organization_id, [lead.email])).get(lead.email.trim().toLowerCase());
    if (status === "invalid") return "email_invalid";
  }
  return null;
}
