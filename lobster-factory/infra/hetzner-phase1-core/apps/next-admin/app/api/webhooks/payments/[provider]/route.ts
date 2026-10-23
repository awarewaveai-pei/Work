// POST /api/webhooks/payments/<provider> — ADR 017 step 4: a payment notification becomes a contract, grants and a
// wallet entry. Auth is the provider's signature over the raw body (no session: /api/webhooks is outside middleware).
// A provider answers only when PAYMENTS_PROVIDERS names it. 4a: `local` (operator-recorded bank transfer); 4b: woo.
import { NextResponse } from "next/server";
import { applyPaymentEvent } from "@/lib/entitlements/contracts";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";
import { PaymentParseError, paymentProvider } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const provider = paymentProvider((await params).provider);
  if (!provider) return NextResponse.json({ ok: false, error: "payment_provider_disabled" }, { status: 404 });
  // Shared webhook reader: Content-Length over 256 KB is refused before the body is read (no unsigned OOM).
  const body = await readWebhookBody(req);
  if (body.ok === false) return NextResponse.json({ ok: false, error: body.status === 413 ? "body_too_large" : "invalid_json" }, { status: body.status });
  const raw = body.raw;
  if (!provider.verify(req.headers, raw)) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  let received;
  try {
    received = provider.parse(raw);
  } catch (error) {
    if (error instanceof PaymentParseError) return NextResponse.json({ ok: false, error: error.code }, { status: 400 });
    throw error;
  }
  try {
    const outcome = await applyPaymentEvent(provider.name, received);
    if (outcome.ok === false) return NextResponse.json({ ok: false, error: outcome.code }, { status: outcome.status });
    return NextResponse.json(outcome);
  } catch (error) {
    // 500 = not recorded (the transaction rolled back): the sender retries with the same event id.
    console.error("[payments] apply failed", provider.name, received.eventId, error);
    return NextResponse.json({ ok: false, error: "payment_not_recorded" }, { status: 500 });
  }
}
