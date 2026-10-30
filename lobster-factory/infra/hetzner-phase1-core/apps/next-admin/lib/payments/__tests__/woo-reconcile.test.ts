import { describe, expect, it } from "vitest";
import { reconcileSignature, reconcileWoo, runWooReconciliation, type WooEventFact, type WooOrderFact } from "../woo-reconcile";

const T = 1_800_000_000;
const iso = (u: number) => new Date(u * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const order = (o: Partial<WooOrderFact> & { id: number }): WooOrderFact =>
  ({ datePaid: T, paymentMethod: "ecpay", credit: false, subscriptions: [], auto: true, refunded: false, granted: true, ...o });
const ev = (e: Partial<WooEventFact> & { eventId: string }): WooEventFact => ({ kind: "credit_pack", externalRef: null, planKey: null, paidAt: iso(T), receivedAt: iso(T + 5), ...e });
const sub = (id: number, planKey: string, more: Partial<WooEventFact> = {}) =>
  ev({ eventId: `wc:payment_complete:${id}:${planKey}:1803000000`, kind: "subscription_paid", externalRef: String(id), planKey, ...more });

describe("reconcileWoo -- paid AwareWave orders against payment_events", () => {
  it("a credit pack and a subscription payment that arrived match; one that did not is missing", () => {
    const r = reconcileWoo(
      [order({ id: 10, credit: true }), order({ id: 11, subscriptions: [{ id: 7, plans: ["studio_basic"] }] }), order({ id: 12, credit: true })],
      [ev({ eventId: "wc:payment_complete:10:credit_pack" }), sub(7, "studio_basic")],
      T - 100, T + 100);
    expect(r.matched).toBe(2);
    expect(r.missing).toEqual([{ orderId: 12, expected: "wc:payment_complete:12:credit_pack" }]);
    expect(r.extra).toEqual([]);
  });

  it("a subscription with two plans expects one event per plan (critic 2026-10-30 M1)", () => {
    const o = order({ id: 40, subscriptions: [{ id: 7, plans: ["studio_basic", "tarot_basic"] }] });
    expect(reconcileWoo([o], [sub(7, "studio_basic"), sub(7, "tarot_basic")], T - 100, T + 100)).toMatchObject({ matched: 2, missing: [], extra: [] });
    expect(reconcileWoo([o], [sub(7, "studio_basic")], T - 100, T + 100).missing).toHaveLength(1);
  });

  it("a fully refunded order the plugin had granted needs its refund event (M5)", () => {
    const o = order({ id: 50, credit: true, refunded: true });
    const paid = ev({ eventId: "wc:payment_complete:50:credit_pack" });
    expect(reconcileWoo([o], [paid], T - 100, T + 100).missing).toEqual([{ orderId: 50, expected: "wc:order_status_refunded:50:* (full refund)" }]);
    expect(reconcileWoo([o], [paid, ev({ eventId: "wc:order_status_refunded:50:credit_pack", kind: "refund" })], T - 100, T + 100).missing).toEqual([]);
  });

  it("an event no paid order accounts for is extra; a plan switch is never extra; an order left to a person is listed, not missing", () => {
    const r = reconcileWoo(
      [order({ id: 20, credit: true, auto: false, granted: false, paymentMethod: "cod", reason: "method_not_allowed" })],
      [ev({ eventId: "wc:payment_complete:99:credit_pack" }), sub(7, "x", { eventId: "wc:subscriptions_switched_item:7:x:5:1" })],
      T - 100, T + 100);
    expect(r.missing).toEqual([]);
    expect(r.extra.map((e) => e.eventId)).toEqual(["wc:payment_complete:99:credit_pack"]);
    expect(r.manual.map((o) => o.id)).toEqual([20]);
  });

  it("a renewal matches only the event with its own paid_at, not an older payment of the same subscription", () => {
    const r = reconcileWoo([order({ id: 30, subscriptions: [{ id: 7, plans: ["p"] }], datePaid: T })],
      [sub(7, "p", { eventId: "old", paidAt: iso(T - 30 * 86_400) })], T - 100, T + 100);
    expect(r.missing).toHaveLength(1);
  });

  it("the request signature matches the plugin's fixed vector (aware-wave-store tests/ReconcileTest.php)", () => {
    expect(reconcileSignature("test-secret", 1700000000, 1700604800, 1700604900)).toBe("qjddtxgRPDNXBt0SNPj7A36sCY74T0ZSnPBHz8Pl54k=");
  });

  it("with Woo payments off there is nothing to reconcile: no WordPress call, no database read", async () => {
    const fetchImpl = (() => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
    const db = { from: () => { throw new Error("must not read"); } } as never;
    expect(await runWooReconciliation(db, undefined, { PAYMENTS_PROVIDERS: "local" }, fetchImpl)).toEqual({ enabled: false });
  });
});
