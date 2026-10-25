// ADR 017 step 4a against a real Postgres + PostgREST: signed local payments through the real route, 0120's
// billing_apply_payment_event, and /ops/billing. Run only by
//   python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py --suite payments
// (sets ENTITLEMENTS_REST); skipped otherwise (npm test, the deploy gate). Touches no production.
import type http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOCAL_SIGNATURE_HEADER, signLocalPayment } from "@/lib/payments/local";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const CUSTOMER = "00000000-0000-4000-8000-0000000000c7";
const PACK_BUYER = "00000000-0000-4000-8000-0000000000c8";   // its own account: the pack tests do not depend on the order of the others
const PACK_BUYER = "00000000-0000-4000-8000-0000000000c8";   // its own account: the pack tests do not depend on the order of the others
const SECRET = "payments-e2e-secret-0123456789-0123456789";

describe.skipIf(!REST)("payments against a real database (ADR 017 step 4a)", () => {
  let proxy: http.Server;
  let db: SupabaseClient;
  const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  const send = async (event: object, opts: { secret?: string; provider?: string } = {}) => {
    const { POST } = await import("../../../app/api/webhooks/payments/[provider]/route");
    const body = JSON.stringify(event);
    const provider = opts.provider ?? "local";
    const res = await POST(new Request(`http://app.test/api/webhooks/payments/${provider}`, { method: "POST",
      headers: { "content-type": "application/json", [LOCAL_SIGNATURE_HEADER]: signLocalPayment(body, opts.secret ?? SECRET) }, body }),
      { params: Promise.resolve({ provider }) });
    return { status: res.status, body: await res.json() };
  };
  const rows = async (table: string, filter: Record<string, string>) => {
    let q = db.from(table).select("*");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Array<Record<string, unknown>>;
  };
  const balance = async () => {
    const { data, error } = await db.rpc("entitlement_credit_balance", { p_organization_id: CUSTOMER });
    if (error) throw new Error(error.message);
    return Number(data);
  };
  // A minute of margin: a row the DB ended "now" must not look live to a host clock a few ms behind the container's.
  const live = async () => (await rows("organization_entitlements", { organization_id: CUSTOMER, status: "active" }))
    .filter((r) => r.ends_at === null || Date.parse(r.ends_at as string) > Date.now() + 60_000);

  beforeAll(async () => {
    proxy = await startRestProxy(REST as string);
    Object.assign(process.env, { PAYMENTS_PROVIDERS: "local", PAYMENTS_LOCAL_SECRET: SECRET });
    db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    for (const [table, value] of [
      ["organizations", [
        { id: CUSTOMER, type: "client", name: "Payments Customer", slug: "e2e-payments-customer", kind: "customer" },
        { id: PACK_BUYER, type: "client", name: "Pack Buyer", slug: "e2e-pack-buyer", kind: "customer" },
      ]],
      ["plans", [
        { plan_key: "social_pro", product_key: "social", kind: "base", features: ["social.rewrite", "social.dispatch", "social.ads"], limits: {} },
        { plan_key: "social_basic", product_key: "social", kind: "base", features: ["social.rewrite"], limits: {} },
        // 0128: a pack's add-on plan must mark every feature {"pay":"credits"}
        { plan_key: "content_pack", product_key: "content", kind: "addon", features: ["content.title", "content.outline"],
          limits: { "content.title": { pay: "credits" }, "content.outline": { pay: "credits" } } },
        { plan_key: "content_pack_unmarked", product_key: "content", kind: "addon", features: ["content.title"], limits: { "content.title": {} } },
      ]],
    ] as const) {
      const { error } = await db.from(table).insert(value);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  });
  afterAll(() => new Promise<void>((ok) => proxy?.close(() => ok())));

  const paid = { event_id: "bank-001", kind: "subscription_paid", organization_id: CUSTOMER, plan_key: "social_pro", period_end: days(30), external_ref: "TX-001" };

  it("an invalid X-AwareWave-Payment-Signature is refused with 401", async () => {
    expect(await send(paid, { secret: "forged-secret-0123456789-0123456789" })).toEqual({ status: 401, body: { ok: false, error: "invalid_signature" } });
    expect(await rows("payment_events", { organization_id: CUSTOMER })).toEqual([]);
  });

  it("one paid event yields one contract row and one entitlement set", async () => {
    const r = await send(paid);
    expect(r).toMatchObject({ status: 200, body: { ok: true, kind: "subscription_paid", entitlements: 3 } });
    const contracts = await rows("organization_product_subscriptions", { organization_id: CUSTOMER });
    expect(contracts.map((c) => [c.id, c.plan_key, c.status, c.source_ref])).toEqual([[r.body.contract, "social_pro", "active", "local:TX-001"]]);
    expect((await live()).map((e) => e.feature_key).sort()).toEqual(["social.ads", "social.dispatch", "social.rewrite"]);
  });

  it("replaying the same event id is a no-op via the inbox", async () => {
    const before = (await rows("organization_entitlements", { organization_id: CUSTOMER })).length;
    expect(await send(paid)).toMatchObject({ status: 200, body: { ok: true, replayed: true } });
    expect((await rows("organization_entitlements", { organization_id: CUSTOMER })).length).toBe(before);
    expect(await rows("payment_events", { organization_id: CUSTOMER })).toHaveLength(1);
    expect(await send({ ...paid, period_end: days(90) })).toEqual({ status: 409, body: { ok: false, error: "event_id_reused" } });
  });

  it("a cancel event keeps access until period end plus grace and a plan change ends the old row now", async () => {
    const old = await live();
    expect((await send({ ...paid, event_id: "bank-002", plan_key: "social_basic" })).body.entitlements).toBe(1);
    const ended = await rows("organization_entitlements", { organization_id: CUSTOMER, status: "expired" });
    expect(ended.map((e) => e.id).sort()).toEqual(old.map((e) => e.id).sort());
    // Ended now, not at period end (compared with the old rows themselves: the DB clock is not the test's clock).
    const was = new Map(old.map((e) => [e.id, Date.parse(e.ends_at as string)]));
    expect(ended.every((e) => Date.parse(e.ends_at as string) < (was.get(e.id) as number) - 29 * 86_400_000)).toBe(true);
    const r = await send({ event_id: "bank-003", kind: "subscription_canceled", organization_id: CUSTOMER, plan_key: "social_basic" });
    const [contract] = await rows("organization_product_subscriptions", { organization_id: CUSTOMER });
    expect([r.status, contract.status]).toEqual([200, "active"]);   // the launcher keeps it open while can() does
    const [still] = await live();
    expect(Date.parse(still.ends_at as string)).toBe(Date.parse(contract.current_period_end as string) + 7 * 86_400_000);
  });

  it("the daily sweep closes a canceled contract only once its grants have ended", async () => {
    const { POST } = await import("../../../app/api/internal/entitlements/expire/route");
    process.env.SCHEDULE_INGEST_TOKEN = "payments-e2e-sweep-token";
    const sweep = async () => (await POST(new Request("http://app.test/api/internal/entitlements/expire", { method: "POST",
      headers: { authorization: "Bearer payments-e2e-sweep-token" } }))).json();
    const [contract] = await rows("organization_product_subscriptions", { organization_id: CUSTOMER });
    await sweep();   // period not over: untouched
    expect((await rows("organization_product_subscriptions", { id: contract.id as string }))[0].status).toBe("active");
    // Time passes: the period and the grace both end (moved back in the data, not the clock).
    for (const [table, patch, filter] of [
      ["organization_product_subscriptions", { current_period_end: days(-8) }, { id: contract.id }],
      ["organization_entitlements", { starts_at: days(-40), ends_at: days(-1) }, { source_ref: contract.id, status: "active" }],
    ] as const) {
      let q = db.from(table).update(patch);
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as string);
      const { error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    expect(await sweep()).toMatchObject({ ok: true, trials_ended: 1 });
    expect((await rows("organization_product_subscriptions", { id: contract.id as string }))[0].status).toBe("canceled");
  });

  it("a credit pack grants once per order id", async () => {
    expect((await send({ event_id: "pack-001", kind: "credit_pack", organization_id: CUSTOMER, units: 100, order_ref: "O-1" })).body.units).toBe(100);
    expect((await send({ event_id: "pack-001-resent-by-hand", kind: "credit_pack", organization_id: CUSTOMER, units: 100, order_ref: "O-1" })).body)
      .toMatchObject({ ok: true, units: 0, already_granted: true });
    expect(await balance()).toBe(100);
  });

  it("a refund of a credit pack reverses only the unused part", async () => {
    const { data, error } = await db.rpc("media_credit_reserve", { p_organization_id: CUSTOMER, p_units: 30, p_idempotency_key: "e2e-debit-0001", p_reference_type: "test", p_reference_id: "x" });
    if (error) throw new Error(error.message);
    expect(data[0].allowed).toBe(true);
    expect((await send({ event_id: "refund-001", kind: "refund", target: "credit_pack", organization_id: CUSTOMER, order_ref: "O-1" })).body)
      .toMatchObject({ ok: true, refunded_units: 70, granted_units: 100 });
    expect(await balance()).toBe(0);
  });
  it("a pack that names its add-on plan grants that plan's rows with no end date, once (0128, decision 6)", async () => {
    const pack = (n: string) => ({ event_id: `pack-plan-${n}`, kind: "credit_pack", organization_id: PACK_BUYER, units: 200, order_ref: `PO-${n}`, plan_key: "content_pack" });
    const first = await send(pack("1"));
    expect(first).toMatchObject({ status: 200, body: { ok: true, units: 200, plan_key: "content_pack", pack_rows: 2 } });
    const grants = await rows("organization_entitlements", { organization_id: PACK_BUYER, status: "active" });
    expect(grants.map((g) => [g.feature_key, g.ends_at, g.limits]).sort()).toEqual([
      ["content.outline", null, { pay: "credits" }], ["content.title", null, { pay: "credits" }]]);
    const contracts = await rows("organization_product_subscriptions", { organization_id: PACK_BUYER });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({ plan_key: "content_pack", status: "active", current_period_end: null });
    // the same event again is the inbox's replay; a second order adds credits, never a second contract or row
    expect((await send(pack("1"))).body).toMatchObject({ ok: true, replayed: true });
    expect((await send(pack("2"))).body).toMatchObject({ ok: true, units: 200, pack_rows: 0, contract: contracts[0].id });
    expect(await rows("organization_entitlements", { organization_id: PACK_BUYER, status: "active" })).toHaveLength(2);
    expect(await rows("organization_product_subscriptions", { organization_id: PACK_BUYER })).toHaveLength(1);
  });

  it("a pack naming a plan that is not an add-on with every feature on credits is refused and grants nothing", async () => {
    const before = await rows("media_credit_ledger", { organization_id: PACK_BUYER });
    for (const [plan_key, code] of [["content_pack_unmarked", "pack_plan_not_credits"], ["social_pro", "pack_plan_not_addon"], ["no_such_plan", "unknown_plan"]]) {
      expect(await send({ event_id: `pack-bad-${plan_key}`, kind: "credit_pack", organization_id: PACK_BUYER, units: 10, order_ref: `PB-${plan_key}`, plan_key }))
        .toEqual({ status: 422, body: { ok: false, error: code } });
    }
    expect(await rows("media_credit_ledger", { organization_id: PACK_BUYER })).toHaveLength(before.length);   // same transaction: no credits either
  });


  it("a chargeback suspends entitlements and freezes the wallet", async () => {
    await send({ event_id: "pack-002", kind: "credit_pack", organization_id: CUSTOMER, units: 50, order_ref: "O-2" });
    const sub = (await send({ ...paid, event_id: "bank-004", external_ref: "TX-004" })).body.contract;
    expect((await send({ event_id: "cb-001", kind: "chargeback", organization_id: CUSTOMER, ref: "O-2" })).body).toMatchObject({ entitlements_suspended: 3, wallet_frozen: true });
    expect(await live()).toEqual([]);
    expect((await rows("organization_product_subscriptions", { id: sub }))[0].status).toBe("past_due");   // the launcher closes it too
    expect(await balance()).toBe(0);
    expect(await send({ event_id: "pack-003", kind: "credit_pack", organization_id: CUSTOMER, units: 50, order_ref: "O-3" })).toEqual({ status: 409, body: { ok: false, error: "account_frozen" } });
    expect((await send({ event_id: "cb-001-cleared", kind: "chargeback_cleared", organization_id: CUSTOMER, note: "bank confirmed" })).body).toMatchObject({ entitlements_restored: 3 });
    expect(await balance()).toBe(50);
  });

  it("/ops/billing shows the account: contract, grants, balance, ledger and payments", async () => {
    const { default: BillingPage } = await import("../../../app/(shell)/ops/billing/page");
    const html = renderToStaticMarkup(await BillingPage());
    expect(html).toContain("Payments Customer");
    expect(html).toContain("social_basic");
    expect(html).toContain("cb-001-cleared");
    expect(html).not.toContain("讀不到帳務資料");
  });
});
