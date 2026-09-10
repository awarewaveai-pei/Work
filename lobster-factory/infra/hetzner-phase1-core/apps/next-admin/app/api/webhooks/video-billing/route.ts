import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { verifyStripeWebhook } from "@/lib/content/video/payment-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Apply only verified Stripe subscription lifecycle events to the billing account. */
export async function POST(req: Request): Promise<Response> {
  if ((process.env.MEDIA_PAYMENT_PROVIDER ?? "").trim().toLowerCase() !== "stripe") return new NextResponse("payment provider disabled", { status: 404 });
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const signature = req.headers.get("stripe-signature") ?? "";
  const rawBody = await req.text();
  if (!secret || !verifyStripeWebhook(rawBody, signature, secret)) return new NextResponse("invalid signature", { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const type = typeof event.type === "string" ? event.type : "";
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Record<string, unknown> : {};
  const object = data.object && typeof data.object === "object" && !Array.isArray(data.object) ? data.object as Record<string, unknown> : {};
  const metadata = object.metadata && typeof object.metadata === "object" && !Array.isArray(object.metadata) ? object.metadata as Record<string, unknown> : {};
  const organizationId = typeof metadata.organization_id === "string" ? metadata.organization_id.trim() : typeof object.client_reference_id === "string" ? object.client_reference_id.trim() : "";
  if (!organizationId) return NextResponse.json({ ok: true, ignored: "organization_id_missing" });
  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("db unavailable", { status: 503 });
  const status = type === "customer.subscription.deleted" ? "canceled" : type === "invoice.payment_failed" ? "past_due" : ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "invoice.paid"].includes(type) ? "active" : null;
  if (!status) return NextResponse.json({ ok: true, ignored: type });
  const saved = await db.from("media_billing_accounts").upsert({ organization_id: organizationId, plan: "subscription", status, metadata: { source: "stripe", eventType: type, eventId: event.id ?? null }, updated_at: new Date().toISOString() }, { onConflict: "organization_id" }).select("organization_id, plan, status").single();
  if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, account: saved.data });
}

