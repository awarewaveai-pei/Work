// POST /api/webhooks/awarewave-wp-member — member events a cash-register site's plugin (aware-wave-store) signs, apart
// from payments: today `member_invite` (ADR 021 D4, M6: a member who signed up through a staff invite and proved the
// email). The next card adds more kinds to EVENTS (M10: member deleted / email changed); a kind not listed is 400.
// Auth = the payment-event signature and site row (lib/payments/woo-billing.ts verify: X-AwareWave-Site names the
// seller_sites key id, that row's own payment key proves the bytes; no header = aware-wave.com). /api/webhooks is outside
// middleware. Answers, read by the plugin (PaymentSender::classify's rule): 200 done; 4xx final (409 carries the refusal
// code from lib/entitlements/wp-customers.ts unchanged); 401 / 404 / 5xx (a closed site too) = the sender retries.
// No ts / event id yet: a replayed member_invite only re-redeems the same identity; M10 must add one before unlink events.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/accounts/client-invite";
import { ensureWpCustomer, WpCustomerRefused } from "@/lib/entitlements/wp-customers";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { paymentProvider } from "@/lib/payments";
import type { SellerSite } from "@/lib/payments/sites";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/** member_invite: {kind, wp_user_id, email, email_verified, invite_code}. Linking is wp-customers.ts's decision
 *  (redeemMemberInvite: every refusal, email_unverified first); this only checks the shape and names the unit. */
async function memberInvite(db: SupabaseClient, site: SellerSite, body: Json): Promise<Response> {
  const wpUserId = body.wp_user_id;
  if (!Number.isSafeInteger(wpUserId) || (wpUserId as number) < 1) return fail("invalid_wp_user_id", 400);
  const email = normalizeEmail(body.email);
  if (!email) return fail("invalid_email", 400);
  if (typeof body.invite_code !== "string" || body.invite_code === "") return fail("invalid_invite_code", 400);
  let organizationId: string;
  try {
    ({ organizationId } = await ensureWpCustomer(db, {
      site, wpUserId: wpUserId as number, email, emailVerified: body.email_verified === true, inviteCode: body.invite_code,
    }, undefined, false));
  } catch (error) {
    if (error instanceof WpCustomerRefused) return fail(error.code, 409);
    throw error;
  }
  // The result page's 「已連上〈單位〉」; the link is already made, so an unreadable name is not a failure.
  const org = await db.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const name = !org.error && typeof (org.data as { name?: unknown } | null)?.name === "string" ? (org.data as { name: string }).name : null;
  return NextResponse.json({ ok: true, organization: { name } });
}

const EVENTS: Record<string, (db: SupabaseClient, site: SellerSite, body: Json) => Promise<Response>> = {
  member_invite: memberInvite,
};

export async function POST(req: Request): Promise<Response> {
  // Same switch as the payment events: the plugin's member events come from the woo sender, off until it is named.
  const woo = paymentProvider("woo");
  if (!woo) return fail("member_events_disabled", 404);
  const read = await readWebhookBody(req);
  if (read.ok === false) return fail(read.status === 413 ? "body_too_large" : "invalid_json", read.status);
  let site: SellerSite | undefined;
  try {
    site = (await woo.verify(req.headers, read.raw))?.site;
  } catch (error) {
    console.error("[wp-member] verify failed", String(error).slice(0, 200));
    return fail("member_event_not_recorded", 500);
  }
  if (!site) return fail("invalid_signature", 401);
  // A closed site (key rotation, ...) is retryable here: a final 4xx would make the plugin drop an unused invite code.
  if (site.status !== "active") return fail("site_disabled", 503);
  let body: unknown;
  try { body = JSON.parse(read.raw); } catch { return fail("invalid_json", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("not_an_object", 400);
  const kind = (body as Json).kind;
  const handle = typeof kind === "string" && Object.prototype.hasOwnProperty.call(EVENTS, kind) ? EVENTS[kind] : null;
  if (!handle) return fail("unknown_kind", 400);
  const db = getSupabaseWriteClient();
  if (!db) return fail("member_event_not_recorded", 500);
  try {
    return await handle(db, site, body as Json);
  } catch (error) {
    // Not recorded: every step is safe to repeat (wp-customers.ts), so the sender retries the same event.
    console.error("[wp-member] event failed", String(kind), String(error).slice(0, 200));
    return fail("member_event_not_recorded", 500);
  }
}
