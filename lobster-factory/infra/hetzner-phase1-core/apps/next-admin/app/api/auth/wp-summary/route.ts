// POST /api/auth/wp-summary -- aware-wave.com's WordPress server reads, for one of its members, what My Account draws:
// the unit, its wallet, and every member door with the unit's right to it by app entitlements (blueprint §2A.4, ADR 021
// G13; logic in lib/auth/sources/awarewave-wp.ts wpSummary). Auth is the same hand-off signature as wp-handoff; /api/auth
// is outside the middleware matcher. Off until AUTH_WP_HANDOFF_SECRET (>= 32 characters) is set.
//
// Every refusal is {ok:false, error}. The one list of codes (status -> what the plugin shows):
//   invalid_json            400  body unreadable or over 256 KB (body_too_large 413)   -> 退場畫面「暫時讀不到你的產品清單」
//   invalid_key_id          400  key_id malformed                                      -> 退場畫面
//   invalid_wp_user_id      400  wp_user_id not a positive integer                     -> 退場畫面
//   invalid_nonce           400  nonce not 16-100 of [A-Za-z0-9_-]                     -> 退場畫面
//   unexpected_product_key  400  a wp-handoff body sent here                           -> 退場畫面
//   invalid_signature       401  signature does not verify with the site's hand-off key -> 退場畫面
//   stale_request           401  ts more than 60 s from the app's clock                -> 退場畫面
//   replayed_request        401  nonce already used (either route)                     -> 退場畫面
//   site_disabled           403  seller_sites row not active                           -> 不顯示產品區塊
//   login_source_not_allowed 403 a seller site's key (summary is aware-wave.com only)  -> 不顯示產品區塊
//   email_unverified        403  the account's email was never proven                  -> 「請先完成 email 確認」
//   not_this_account        403  the account is no longer this unit's client           -> 「尚未連結，請聯絡我們」
//   brand_unit_unsupported  403  the member's unit is a brand (child org)              -> 「尚未連結，請聯絡我們」
//   source_disabled         404  no hand-off key set (production default; no key_id: no DB read) -> 不顯示產品區塊
//   not_a_member            404  no billing identity for this WordPress user           -> 「尚未連結，請聯絡我們」
//   auth_lookup_failed      503  GoTrue user read failed                               -> 退場畫面
//   unavailable             503  database missing or any read failed                   -> 退場畫面
import { NextResponse } from "next/server";
import { HANDOFF_SIGNATURE_HEADER, wpSummary } from "@/lib/auth/sources/awarewave-wp";
import { findBillingAccount } from "@/lib/entitlements/identities";
import { billingAccount, createEntitlementStore } from "@/lib/entitlements/tables";
import { findSiteByKeyId } from "@/lib/payments/sites";
import { heldDoors } from "@/lib/portal/held-doors";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request): Promise<Response> {
  const body = await readWebhookBody(req);
  if (body.ok === false) return json({ ok: false, error: body.status === 413 ? "body_too_large" : "invalid_json" }, body.status);
  const db = getSupabaseWriteClient();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);
  try {
    const out = await wpSummary(body.raw, req.headers.get(HANDOFF_SIGNATURE_HEADER), process.env, {
      db, site: findSiteByKeyId, find: findBillingAccount, held: heldDoors, account: billingAccount, entitlements: createEntitlementStore(db).listActiveEntitlements,
      now: () => Math.floor(Date.now() / 1000),
    });
    if (out.ok === false) return json({ ok: false, error: out.error }, out.status);
    return json(out);
  } catch (error) {
    console.error("[wp-summary] failed", String(error).slice(0, 200));
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
