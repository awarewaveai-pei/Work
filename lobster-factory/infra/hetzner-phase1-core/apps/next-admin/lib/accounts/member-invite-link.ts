// The link staff hand a member invite or transfer over with (ADR 021 D4/D5): `https://<cash-register host>/?aw_invite=<code>`.
// The host is aware-wave.com's seller_sites row (0133; lib/payments/sites.ts), never written here. Server only: the
// routes answer the link, the browser never reads configuration.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AWARE_WAVE_KEY_ID, findSiteByKeyId } from "@/lib/payments/sites";

/** The landing page's query parameter. Must match the store plugin's MemberInvite.php (M6), which reads it. */
export const MEMBER_INVITE_PARAM = "aw_invite";

/** The invite link, null when the site row cannot be read (the code alone still works: staff send it as before). */
export async function memberInviteLink(db: SupabaseClient, code: string): Promise<string | null> {
  try {
    const site = await findSiteByKeyId(db, AWARE_WAVE_KEY_ID);
    if (!site?.host) return null;
    const url = new URL(`https://${site.host}/`);
    url.searchParams.set(MEMBER_INVITE_PARAM, code);
    return url.toString();
  } catch (e) {
    console.warn(`[member-invite-link] no link: ${String(e)}`);
    return null;
  }
}
