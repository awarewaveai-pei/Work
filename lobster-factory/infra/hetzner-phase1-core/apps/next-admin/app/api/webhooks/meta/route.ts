// Public Meta webhook endpoint for C27 comment/DM auto-replies.
// GET is Meta's verification handshake; POST validates the raw-body signature before parsing JSON.
import { NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/social/meta-webhook";
import { processMetaWebhook } from "@/lib/social/meta-auto-reply";

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
  // A valid delivery is acknowledged even while the review gate or token is off; this prevents Meta retry storms.
  return NextResponse.json({ ok: true, ...await processMetaWebhook(payload) });
}
