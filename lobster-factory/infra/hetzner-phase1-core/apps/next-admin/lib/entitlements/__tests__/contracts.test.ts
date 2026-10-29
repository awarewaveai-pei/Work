import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { applyPaymentEvent } from "../contracts";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const received = { eventId: "bank-1", event: { kind: "credit_pack" as const, organization_id: ORG, units: 500, order_ref: "TX-1" } };
const client = (result: { data?: unknown; error?: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { rpc, db: { rpc } as unknown as SupabaseClient };
};

describe("applyPaymentEvent: carries one PaymentEvent to 0120 and names the outcome", () => {
  it("sends provider, event id and event to billing_apply_payment_event", async () => {
    const { rpc, db } = client({ data: { ok: true, event: "e", kind: "credit_pack", units: 500 } });
    await expect(applyPaymentEvent("local", received, db)).resolves.toMatchObject({ ok: true, units: 500 });
    expect(rpc).toHaveBeenCalledWith("billing_apply_payment_event", { p_provider: "local", p_event_id: "bank-1", p_event: received.event, p_site_id: null });
  });

  it("a business rejection is a 422 (409 for a reused id or a frozen account); an infrastructure error throws", async () => {
    await expect(applyPaymentEvent("local", received, client({ error: { message: "payment_rejected:unknown_plan" } }).db)).resolves.toEqual({ ok: false, status: 422, code: "unknown_plan" });
    await expect(applyPaymentEvent("local", received, client({ error: { message: "payment_rejected:event_id_reused" } }).db)).resolves.toEqual({ ok: false, status: 409, code: "event_id_reused" });
    await expect(applyPaymentEvent("local", received, client({ error: { message: "payment_rejected:account_frozen" } }).db)).resolves.toEqual({ ok: false, status: 409, code: "account_frozen" });
    await expect(applyPaymentEvent("local", received, client({ error: { message: "payment_invariant:more_than_one_live_grant" } }).db)).rejects.toThrow("more_than_one_live_grant");
    await expect(applyPaymentEvent("local", received, client({ data: { ok: false } }).db)).rejects.toThrow("invalid_payment_result");
    await expect(applyPaymentEvent("local", received, null)).rejects.toThrow("payments_db_unavailable");
  });
});
