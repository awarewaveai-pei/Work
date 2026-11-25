// POST /api/webhooks/awarewave-wp-member — member events a cash-register site's plugin (aware-wave-store) signs, apart
// from payments: `member_invite` (ADR 021 D4, M6: a member who signed up through a staff invite and proved the email),
// `member_deleted` and `member_email_changed` (G10, M10: WordPress deleted the user / changed its email). A kind not
// listed is 400. Every event carries event_id (the payment events' format) and occurred_at (the site's clock, ISO UTC);
// the database decides each once (0184 member_events): the same event_id answers its first result, an event older than
// the member's latest applied change is event_stale (final). Auth = the payment-event signature and site row
// (lib/payments/woo-billing.ts verify: X-AwareWave-Site names the seller_sites key id, that row's own payment key proves
// the bytes; no header = aware-wave.com). /api/webhooks is outside middleware. Answers, read by the plugin
// (PaymentSender::classify's rule): 200 done; 4xx final (409 carries the refusal code unchanged); 401 / 404 / 5xx (a
// closed site too) = the sender retries the same event.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { deleteClientAccount, normalizeEmail } from "@/lib/accounts/client-invite";
import {
  deletedMemberAccount, findMemberInviteByCode, inviteTarget, memberDeletedEvent, memberEmailChangedEvent, memberEventCheck, memberInviteTransferOf,
  redeemMemberInviteEvent, type Identity, type MemberEventStamp,
} from "@/lib/entitlements/identities";
import { ensureWpCustomer, WpCustomerRefused, type MemberInviteDeps } from "@/lib/entitlements/wp-customers";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { paymentProvider } from "@/lib/payments";
import { EVENT_ID } from "@/lib/payments/woo-billing";
import { siteIdentityProvider, type SellerSite } from "@/lib/payments/sites";
import { recordOpsAudit } from "@/lib/ops-audit";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;
type Event = { site: SellerSite; body: Json; stamp: MemberEventStamp; identity: Identity };
const fail = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/** The plugin's gmdate('Y-m-d\TH:i:s\Z'); fractions allowed. */
const OCCURRED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
/** A stamp this far past the app's clock is a broken site clock: it would make the member's later events stale. */
const MAX_FUTURE_MS = 3_600_000;
/** Answers that are the event's own fault, final for the sender. */
const STAMP_REFUSALS = new Set(["event_stale", "event_id_reused"]);

const orgName = async (db: SupabaseClient, organizationId: string | null): Promise<string | null> => {
  if (!organizationId) return null;
  // The result page's 「已連上〈單位〉」; the link is already made, so an unreadable name is not a failure.
  const org = await db.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return !org.error && typeof (org.data as { name?: unknown } | null)?.name === "string" ? (org.data as { name: string }).name : null;
};

/** member_invite: {kind, wp_user_id, email, email_verified, invite_code, event_id, occurred_at}. Linking is
 *  wp-customers.ts's decision (redeemMemberInvite: every refusal, email_unverified first) with the database's redeem
 *  replaced by the stamped one; a known or stale event is answered before any app account is made. */
async function memberInvite(db: SupabaseClient, ev: Event): Promise<Response> {
  const { body, site, stamp, identity } = ev;
  const email = normalizeEmail(body.email);
  if (!email) return fail("invalid_email", 400);
  if (typeof body.invite_code !== "string" || body.invite_code === "") return fail("invalid_invite_code", 400);
  const prior = await memberEventCheck(db, { ...identity, ...stamp, kind: "member_invite" });
  if (prior) {
    if (prior.result !== "ok") return fail(prior.result, 409);
    return NextResponse.json({ ok: true, organization: { name: await orgName(db, prior.organizationId) } });
  }
  const inviteDeps: MemberInviteDeps = {
    memberInvite: findMemberInviteByCode, inviteTarget, transferOf: memberInviteTransferOf,
    redeem: (d, input) => redeemMemberInviteEvent(d, { ...input, ...stamp }),
  };
  let organizationId: string;
  try {
    ({ organizationId } = await ensureWpCustomer(db, {
      site, wpUserId: body.wp_user_id as number, email, emailVerified: body.email_verified === true, inviteCode: body.invite_code,
    }, undefined, false, undefined, inviteDeps));
  } catch (error) {
    if (error instanceof WpCustomerRefused) return fail(error.code, 409);
    throw error;
  }
  return NextResponse.json({ ok: true, organization: { name: await orgName(db, organizationId) } });
}

const answer = (result: string) => (STAMP_REFUSALS.has(result) ? fail(result, 409) : NextResponse.json({ ok: true, result }));

/** member_deleted: {kind, wp_user_id, event_id, occurred_at}. Sent for every deleted user: the app decides (no identity =
 *  recorded, 200; a member a transfer replaced has none, so their account stays staff's call). The database moves the
 *  identity (0184, one transaction); then the app account it named is removed -- a client account belongs to one unit
 *  only, so ending its access there is ending it (deleteClientAccount sourceDeleted: brand roles too). A failed removal
 *  is a retryable 503: the plugin resends the same event, the database answers its stored "deleted", the removal runs
 *  again (an account already gone counts as done). */
async function memberDeleted(db: SupabaseClient, ev: Event): Promise<Response> {
  const result = await memberDeletedEvent(db, { ...ev.identity, ...ev.stamp });
  if (result !== "deleted") return answer(result);
  const account = await deletedMemberAccount(db, ev.identity);
  if (!account) throw new Error("member_deleted without its former row");
  const out = await deleteClientAccount(db, account.organizationId, account.userId, { sourceDeleted: true });
  const audit = { user_id: account.userId, event_id: ev.stamp.eventId, site_id: ev.site.id };
  if (out.ok === false && out.error === "not_this_client") {
    // not a client account of this unit (an identity only ever links one; kept and recorded, never removed)
    await recordOpsAudit(account.organizationId, "operator", "member_event", "member_account_kept", { ...audit, why: out.error });
    return NextResponse.json({ ok: true, result, account: "kept_not_client" });
  }
  if (out.ok === false && out.error === "still_member") {
    // a brand role in another unit's brand: not this event's to remove; final, staff decide
    await recordOpsAudit(account.organizationId, "operator", "member_event", "member_account_kept", { ...audit, why: out.error });
    return fail("member_account_kept_brand_role_elsewhere", 409);
  }
  if (out.ok === false) return fail("member_account_not_removed", 503);
  await recordOpsAudit(account.organizationId, "operator", "member_event", "member_account_deleted", {
    ...audit, already_gone: out.gone === true, brands_without_owner: out.brandsWithoutOwner ?? [],
  });
  return NextResponse.json({ ok: true, result, account: "deleted" });
}

/** member_email_changed: {kind, wp_user_id, old_email, new_email, event_id, occurred_at}. Audit only, by email domain. */
async function memberEmailChanged(db: SupabaseClient, ev: Event): Promise<Response> {
  const oldEmail = normalizeEmail(ev.body.old_email);
  const newEmail = normalizeEmail(ev.body.new_email);
  if (!oldEmail || !newEmail) return fail("invalid_email", 400);
  const domain = (e: string) => e.slice(e.lastIndexOf("@") + 1);
  return answer(await memberEmailChangedEvent(db, { ...ev.identity, ...ev.stamp, oldDomain: domain(oldEmail), newDomain: domain(newEmail) }));
}

const EVENTS: Record<string, (db: SupabaseClient, ev: Event) => Promise<Response>> = {
  member_invite: memberInvite,
  member_deleted: memberDeleted,
  member_email_changed: memberEmailChanged,
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
  let parsed: unknown;
  try { parsed = JSON.parse(read.raw); } catch { return fail("invalid_json", 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("not_an_object", 400);
  const body = parsed as Json;
  const kind = body.kind;
  const handle = typeof kind === "string" && Object.prototype.hasOwnProperty.call(EVENTS, kind) ? EVENTS[kind] : null;
  if (!handle) return fail("unknown_kind", 400);
  if (typeof body.event_id !== "string" || !EVENT_ID.test(body.event_id)) return fail("invalid_event_id", 400);
  const at = typeof body.occurred_at === "string" && OCCURRED_AT.test(body.occurred_at) ? Date.parse(body.occurred_at) : NaN;
  if (!Number.isFinite(at) || at > Date.now() + MAX_FUTURE_MS) return fail("invalid_occurred_at", 400);
  const wpUserId = body.wp_user_id;
  if (!Number.isSafeInteger(wpUserId) || (wpUserId as number) < 1) return fail("invalid_wp_user_id", 400);
  const db = getSupabaseWriteClient();
  if (!db) return fail("member_event_not_recorded", 500);
  const ev: Event = {
    site, body,
    // the signed bytes' hash: a replay must be the same content, not only the same id (0184 member_event_prior)
    stamp: { eventId: body.event_id, occurredAt: new Date(at).toISOString(), bodySha256: createHash("sha256").update(read.raw, "utf8").digest("hex") },
    identity: { provider: siteIdentityProvider(site), siteId: site.id, externalId: String(wpUserId) },
  };
  try {
    return await handle(db, ev);
  } catch (error) {
    // Not recorded: the database decides inside one transaction, so the sender retries the same event.
    console.error("[wp-member] event failed", String(kind), String(error).slice(0, 200));
    return fail("member_event_not_recorded", 500);
  }
}
