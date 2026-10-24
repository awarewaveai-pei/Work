// POST /api/auth/wp-handoff — the aware-wave.com WordPress server asks for a one-time sign-in link into a product door
// for one of its members (login source `awarewave-wp`; logic and rules in lib/auth/sources/awarewave-wp.ts). Auth is the
// HMAC over the raw body; /api/auth is outside the middleware matcher. Off until AUTH_WP_HANDOFF_SECRET is set.
import { NextResponse } from "next/server";
import { HANDOFF_SIGNATURE_HEADER, wpHandoff } from "@/lib/auth/sources/awarewave-wp";
import { findBillingAccount } from "@/lib/entitlements/identities";
import { holdsProduct } from "@/lib/entitlements/door-holds";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await readWebhookBody(req);
  if (body.ok === false) return NextResponse.json({ ok: false, error: body.status === 413 ? "body_too_large" : "invalid_json" }, { status: body.status });
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  try {
    const out = await wpHandoff(body.raw, req.headers.get(HANDOFF_SIGNATURE_HEADER), process.env,
      { db, find: findBillingAccount, holds: holdsProduct, now: () => Math.floor(Date.now() / 1000) });
    if (out.ok === false) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
    return NextResponse.json(out);
  } catch (error) {
    console.error("[wp-handoff] failed", String(error).slice(0, 200));
    return NextResponse.json({ ok: false, error: "auth_unavailable" }, { status: 503 });
  }
}
