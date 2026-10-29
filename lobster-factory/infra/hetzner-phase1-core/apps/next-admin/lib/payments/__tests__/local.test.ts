import { describe, expect, it } from "vitest";
import { paymentProvider } from "@/lib/payments";
import { LOCAL_SIGNATURE_HEADER, signLocalPayment } from "../local";

const SECRET = "local-payments-test-secret-0123456789";
const ORG = "00000000-0000-4000-8000-0000000000c1";
const env = { PAYMENTS_PROVIDERS: "local", PAYMENTS_LOCAL_SECRET: SECRET };
const local = () => paymentProvider("local", env)!;
const headers = (body: string, secret = SECRET) => new Headers({ [LOCAL_SIGNATURE_HEADER]: signLocalPayment(body, secret) });
const body = (o: object) => JSON.stringify({ event_id: "bank-2026-10-23-001", ...o });

describe("local payment provider (ADR 017 step 4a)", () => {
  it("answers only when PAYMENTS_PROVIDERS names it", () => {
    expect(paymentProvider("local", {})).toBeNull();
    expect(paymentProvider("local", { PAYMENTS_PROVIDERS: "woo" })).toBeNull();
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local" })).toBeNull();
    expect(paymentProvider("woo", { PAYMENTS_PROVIDERS: "local,woo" })?.name).toBe("woo");
    expect(paymentProvider("local", { PAYMENTS_PROVIDERS: " Local , woo" })?.name).toBe("local");
  });

  it("a forged request is refused: wrong secret, edited body, no header, or a secret too short to trust", () => {
    const raw = body({ kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "TX-1" });
    expect(local().verify(headers(raw), raw)).toEqual({});   // verified, and no site: a transfer has none (0133)
    expect(local().verify(headers(raw, SECRET + "x"), raw)).toBeNull();
    expect(local().verify(headers(raw), raw.replace("500", "5000"))).toBeNull();
    expect(local().verify(new Headers(), raw)).toBeNull();
    const short = paymentProvider("local", { PAYMENTS_PROVIDERS: "local", PAYMENTS_LOCAL_SECRET: "short" })!;
    expect(short.verify(headers(raw, "short"), raw)).toBeNull();
  });

  it("parses each event kind into the control plane's PaymentEvent and nothing else", async () => {
    const p = local();
    expect(await p.parse(body({ kind: "subscription_paid", organization_id: ORG, plan_key: "social_pro", period_end: "2026-11-23T00:00:00Z", external_ref: "TX-9", extra: 1 }), {}))
      .toEqual({ eventId: "bank-2026-10-23-001", event: { kind: "subscription_paid", organization_id: ORG, plan_key: "social_pro", period_end: "2026-11-23T00:00:00Z", external_ref: "TX-9" } });
    expect((await p.parse(body({ kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "TX-1" }), {})).event).toEqual({ kind: "credit_pack", organization_id: ORG, units: 500, order_ref: "TX-1" });
    expect((await p.parse(body({ kind: "refund", target: "credit_pack", organization_id: ORG, order_ref: "TX-1" }), {})).event.kind).toBe("refund");
    expect((await p.parse(body({ kind: "chargeback_cleared", organization_id: ORG, note: "bank confirmed" }), {})).event).toEqual({ kind: "chargeback_cleared", organization_id: ORG, note: "bank confirmed" });
  });

  it("what the operator's scripts/record-payment.mjs signs is exactly what the local provider accepts", async () => {
    const { buildPayment } = await import("../../../scripts/record-payment.mjs");
    for (const argv of [
      ["credit_pack", "--org", ORG, "--units", "500", "--ref", "TX-20261023-01"],
      ["subscription_paid", "--org", ORG, "--plan", "social_pro", "--until", "2026-11-23", "--ref", "TX-02"],
      ["refund", "--org", ORG, "--ref", "TX-20261023-01"],
      ["chargeback_cleared", "--org", ORG, "--ref", "CASE-7", "--note", "bank confirmed", "--url", "http://localhost:3000/"],
    ]) {
      const p = buildPayment(argv, SECRET);
      expect(local().verify(new Headers({ [LOCAL_SIGNATURE_HEADER]: p.signature }), p.body)).toEqual({});
      expect((await local().parse(p.body, {})).event.kind).toBe(argv[0]);
      expect(p.url).toMatch(/\/api\/webhooks\/payments\/local$/);
    }
    expect(buildPayment(["credit_pack", "--org", ORG, "--units", "5", "--ref", "TX-9"], SECRET).body).toContain(`"event_id":"credit_pack:${ORG}:TX-9"`);
    // two refunds of the same plan in different periods are two events, never a silent replay (critic 2026-10-23)
    const refund = (ref: string) => JSON.parse(buildPayment(["refund", "--org", ORG, "--plan", "social_pro", "--ref", ref], SECRET).body).event_id;
    expect(refund("RF-2026-11")).not.toBe(refund("RF-2027-02"));
    expect(() => buildPayment(["refund", "--org", ORG, "--plan", "social_pro"], SECRET)).toThrow("--ref");
    expect(() => buildPayment(["credit_pack", "--org", ORG, "--ref", "x"], "short")).toThrow("PAYMENTS_LOCAL_SECRET");
  });

  it("refuses malformed events before they reach the database", () => {
    const code = (o: unknown) => { try { local().parse(typeof o === "string" ? o : JSON.stringify(o), {}); return "parsed"; } catch (e) { return (e as { code?: string }).code; } };
    expect(code("{")).toBe("invalid_json");
    expect(code({ kind: "credit_pack", organization_id: ORG, units: 1, order_ref: "x" })).toBe("invalid_event_id");
    expect(code({ event_id: "e1", kind: "credit_pack", organization_id: "acme", units: 1, order_ref: "x" })).toBe("invalid_organization_id");
    expect(code({ event_id: "e1", kind: "credit_pack", organization_id: ORG, units: 1.5, order_ref: "x" })).toBe("invalid_units");
    expect(code({ event_id: "e1", kind: "credit_pack", organization_id: ORG, units: 0, order_ref: "x" })).toBe("invalid_units");
    expect(code({ event_id: "e1", kind: "subscription_paid", organization_id: ORG, plan_key: "p", period_end: "next month" })).toBe("invalid_period_end");
    expect(code({ event_id: "e1", kind: "refund", target: "everything", organization_id: ORG })).toBe("invalid_target");
    expect(code({ event_id: "e1", kind: "teleport", organization_id: ORG })).toBe("unknown_kind");
  });
});
