// POST /api/webhooks/payments/<provider> — ADR 017 step 4: a payment notification becomes a contract, grants and a
// wallet entry. Auth is the provider's signature over the raw body (no session: /api/webhooks is outside middleware).
// A provider answers only when PAYMENTS_PROVIDERS names it: `local` (operator-recorded bank transfer), `woo` (wp-bridge).
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
  let sender;
  try {
    sender = await provider.verify(req.headers, raw);
  } catch (error) {
    // woo looks the signing site up; an outage there is "not recorded", and the sender retries the same event.
    console.error("[payments] verify failed", provider.name, String(error).slice(0, 200));
    return NextResponse.json({ ok: false, error: "payment_not_recorded" }, { status: 500 });
  }
  if (!sender) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  let received;
  try {
    received = await provider.parse(raw, sender);
  } catch (error) {
    if (error instanceof PaymentParseError) {
      await provider.refused?.(raw, error.detail ?? error.code, sender);
      return NextResponse.json({ ok: false, error: error.code }, { status: 400 });
    }
    // woo resolves the payer while parsing; an outage there is "not recorded", and the sender retries the same event.
    console.error("[payments] parse failed", provider.name, String(error).slice(0, 200));
    return NextResponse.json({ ok: false, error: "payment_not_recorded" }, { status: 500 });
  }
  try {
    const outcome = await applyPaymentEvent(provider.name, received);
    if (outcome.ok === false) {
      await provider.refused?.(raw, outcome.code, sender);
      return NextResponse.json({ ok: false, error: outcome.code }, { status: outcome.status });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    // 500 = not recorded (the transaction rolled back): the sender retries with the same event id.
    console.error("[payments] apply failed", provider.name, received.eventId, error);
    return NextResponse.json({ ok: false, error: "payment_not_recorded" }, { status: 500 });
  }
}
