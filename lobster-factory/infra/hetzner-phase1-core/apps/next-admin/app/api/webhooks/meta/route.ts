// Public Meta webhook endpoint for C27 comment/DM auto-replies.
// GET is Meta's verification handshake; POST validates the raw-body signature before parsing JSON.
import { NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/social/meta-webhook";
import { processMetaWebhook } from "@/lib/social/meta-auto-reply";
import { handleLeadgenChanges } from "@/lib/outreach/meta-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const mode = q.get("hub.mode");
  const token = q.get("hub.verify_token");
  const challenge = q.get("hub.challenge");
  const expected = configured("META_WEBHOOK_VERIFY_TOKEN");
  if (mode === "subscribe" && expected && token === expected && challenge !== null) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response("Forbidden", { status: expected ? 403 : 503 });
}

export async function POST(req: Request): Promise<Response> {
  const appSecret = configured("META_APP_SECRET");
  if (!appSecret) return NextResponse.json({ ok: false, error: "meta_webhook_not_configured" }, { status: 503 });
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ ok: false, error: "invalid_meta_signature" }, { status: 403 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // Lead-ad forms (card C14.2) are stored before the social auto-reply runs; that module is idempotent per event id, so a
  // delivery Meta repeats because a lead could not be finished (503 below) does not reply twice.
  const leads = await handleLeadgenChanges(payload);
  // A valid delivery is acknowledged even while the review gate or token is off; this prevents Meta retry storms.
  const social = await processMetaWebhook(payload);
  if (leads.retry > 0) return NextResponse.json({ ok: false, error: "leadgen_retry", leads, ...social }, { status: 503 });
  return NextResponse.json({ ok: true, ...social, ...(leads.received ? { leads } : {}) });
}
