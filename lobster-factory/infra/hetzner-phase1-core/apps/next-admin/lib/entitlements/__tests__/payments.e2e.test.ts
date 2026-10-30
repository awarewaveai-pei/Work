// ADR 017 step 4a against a real Postgres + PostgREST: signed local payments through the real route, 0120's
// billing_apply_payment_event, /ops/billing (0130 ledger) and the client hub 帳務 tab (0127). Run only by
//   python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py --suite payments
// (sets ENTITLEMENTS_REST); skipped otherwise (npm test, the deploy gate). Touches no production.
import type http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrivateKey, sign } from "node:crypto";
import { PAYMENT_SITE_HEADER } from "@/lib/payments/hmac";
import { LOCAL_SIGNATURE_HEADER, signLocalPayment } from "@/lib/payments/local";
import fixture from "@/lib/payments/__tests__/fixtures/ed25519-v1.json";
import { PRODUCTS } from "@/lib/portal/products";
import { debitCredits } from "@/lib/entitlements/ledger";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const CUSTOMER = "00000000-0000-4000-8000-0000000000c7";
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
        { plan_key: "tarot_pack", product_key: "tarot", kind: "addon", features: ["tarot.image"], limits: { "tarot.image": { pay: "credits" } } },
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
    expect(first).toMatchObject({ status: 200, body: { ok: true, units: 200, plans: [{ plan_key: "content_pack", pack_rows: 2 }] } });
    const grants = await rows("organization_entitlements", { organization_id: PACK_BUYER, status: "active" });
    expect(grants.map((g) => [g.feature_key, g.ends_at, g.limits]).sort()).toEqual([
      ["content.outline", null, { pay: "credits" }], ["content.title", null, { pay: "credits" }]]);
    const contracts = await rows("organization_product_subscriptions", { organization_id: PACK_BUYER });
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({ plan_key: "content_pack", status: "active", current_period_end: null });
    // the same event again is the inbox's replay; a second order adds credits, never a second contract or row
    expect((await send(pack("1"))).body).toMatchObject({ ok: true, replayed: true });
    expect((await send(pack("2"))).body).toMatchObject({ ok: true, units: 200, plans: [{ pack_rows: 0, contract: contracts[0].id }] });
    expect(await rows("organization_entitlements", { organization_id: PACK_BUYER, status: "active" })).toHaveLength(2);
    expect(await rows("organization_product_subscriptions", { organization_id: PACK_BUYER })).toHaveLength(1);
  });

  it("one pack naming several plans (0146) grants one ledger entry and each plan's rows; a bad plan refuses the whole pack", async () => {
    const org = "00000000-0000-4000-8000-0000000000ca";
    const { error } = await db.from("organizations").insert({ id: org, type: "client", name: "Gift Member", slug: "e2e-gift-member", kind: "customer" });
    if (error) throw new Error(error.message);
    const gift = { kind: "credit_pack", organization_id: org, units: 50, order_ref: "GIFT-1" };
    const bad = await send({ ...gift, event_id: "gift-bad", order_ref: "GIFT-0", plan_keys: ["tarot_pack", "content_pack_unmarked"] });
    expect(bad).toEqual({ status: 422, body: { ok: false, error: "pack_plan_not_credits" } });
    expect(await rows("media_credit_ledger", { organization_id: org })).toHaveLength(0);   // same transaction: nothing granted
    const ok = await send({ ...gift, event_id: "gift-1", plan_keys: ["tarot_pack", "content_pack"] });
    expect(ok).toMatchObject({ status: 200, body: { ok: true, units: 50, plans: [{ plan_key: "content_pack", pack_rows: 2 }, { plan_key: "tarot_pack", pack_rows: 1 }] } });
    expect(await rows("media_credit_ledger", { organization_id: org })).toHaveLength(1);
    expect((await rows("organization_product_subscriptions", { organization_id: org })).map((c) => c.plan_key).sort()).toEqual(["content_pack", "tarot_pack"]);
    expect((await rows("organization_entitlements", { organization_id: org, status: "active" })).map((g) => g.feature_key).sort())
      .toEqual(["content.outline", "content.title", "tarot.image"]);
  });

  it("a pack naming a plan that is not an add-on with every feature on credits is refused and grants nothing", async () => {
    const before = await rows("media_credit_ledger", { organization_id: PACK_BUYER });
    for (const [plan_key, code] of [["content_pack_unmarked", "pack_plan_not_credits"], ["social_pro", "pack_plan_not_addon"], ["no_such_plan", "unknown_plan"]]) {
      expect(await send({ event_id: `pack-bad-${plan_key}`, kind: "credit_pack", organization_id: PACK_BUYER, units: 10, order_ref: `PB-${plan_key}`, plan_key }))
        .toEqual({ status: 422, body: { ok: false, error: code } });
    }
    expect(await rows("media_credit_ledger", { organization_id: PACK_BUYER })).toHaveLength(before.length);   // same transaction: no credits either
  });

  it("the seeded studio_credits plan (0145) opens only registered credits features, each paid from the shared wallet", async () => {
    const org = "00000000-0000-4000-8000-0000000000c9";
    const { error } = await db.from("organizations").insert({ id: org, type: "client", name: "Studio Buyer", slug: "e2e-studio-buyer", kind: "customer" });
    if (error) throw new Error(error.message);
    expect((await send({ event_id: "studio-pack-1", kind: "credit_pack", organization_id: org, units: 100, order_ref: "SP-1", plan_key: "studio_credits" })).status).toBe(200);
    const grants = await rows("organization_entitlements", { organization_id: org, status: "active" });
    const studio = PRODUCTS.find((p) => p.key === "studio")!.features;
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g.limits).toEqual({ pay: "credits" });   // can.ts: no marker = the contract covers unlimited use
      expect(studio.find((f) => f.feature_key === g.feature_key)?.billing).toBe("credits");
    }
    // 4b-11: the reserve RPC reports the wallet on a refusal too, so a short wallet can be drained to 0
    const debit = (units: number, key: string) => debitCredits(db, { orgId: org, units, idempotencyKey: key, featureKey: "studio.image" });
    expect(await debit(30, "ai-call:e2e-1")).toEqual({ ok: true, balance: 70 });
    expect(await debit(30, "ai-call:e2e-1")).toEqual({ ok: true, balance: 70 });   // same key: charged once
    expect(await debit(200, "ai-call:e2e-2")).toEqual({ ok: false, balance: 70 });
  });

  it("a chargeback suspends entitlements and freezes the wallet", async () => {
    await send({ event_id: "pack-002", kind: "credit_pack", organization_id: CUSTOMER, units: 50, order_ref: "O-2" });
    const sub = (await send({ ...paid, event_id: "bank-004", external_ref: "TX-004" })).body.contract;
    expect((await send({ event_id: "cb-001", kind: "chargeback", organization_id: CUSTOMER, ref: "O-2" })).body).toMatchObject({ entitlements_suspended: 3, wallet_frozen: true });
    expect(await live()).toEqual([]);
    expect((await rows("organization_product_subscriptions", { id: sub }))[0].status).toBe("past_due");   // bookkeeping only: doors and the launcher close via the suspended entitlements above
    expect(await balance()).toBe(0);
    expect(await send({ event_id: "pack-003", kind: "credit_pack", organization_id: CUSTOMER, units: 50, order_ref: "O-3" })).toEqual({ status: 409, body: { ok: false, error: "account_frozen" } });
    expect((await send({ event_id: "cb-001-cleared", kind: "chargeback_cleared", organization_id: CUSTOMER, note: "bank confirmed" })).body).toMatchObject({ entitlements_restored: 3 });
    expect(await balance()).toBe(50);
  });

  it("/ops/billing lists every account with search and opens one on the page; the client's 帳務 tab shows the same detail", async () => {
    const { default: BillingPage } = await import("../../../app/(shell)/ops/billing/page");
    const page = (sp: Record<string, string>) => BillingPage({ searchParams: Promise.resolve(sp) }).then(renderToStaticMarkup);
    const list = await page({});
    expect(list).toContain("客戶未用點數");
    expect(list).toContain("Payments Customer");                      // listed without opening anything
    expect(list).not.toContain("讀不到帳務資料");
    expect(await page({ q: "e2e-payments-cust" })).toContain("Payments Customer");
    expect(await page({ q: "no-such-account-xyz" })).toContain("沒有符合的帳戶");
    const opened = await page({ account: CUSTOMER });
    expect(opened).toContain("social_basic");
    expect(opened).toContain("cb-001-cleared");
    const { billingAccount } = await import("../tables");
    const { BillingTab } = await import("../../../app/(shell)/ops/clients/[slug]/BillingTab");
    const account = await billingAccount(CUSTOMER);
    const tab = renderToStaticMarkup(createElement(BillingTab, { data: { account, error: null }, slug: account!.slug }));
    expect(tab).toContain("cb-001-cleared");
    expect(tab).not.toContain("讀不到帳務資料");
  });

  // 0133 (ADR 017 #12): the cash register is a seller_sites row. Called through the SQL function directly: which site
  // sent a request is the route's job (4c-2); here only what the function does with a site id it is given.
  describe("sellers (0133)", () => {
    const SELLER = "00000000-0000-4000-8000-0000000000d1";
    const BUYER_AW = "00000000-0000-4000-8000-0000000000d2";   // sold by AwareWave (sold_by null)
    const BUYER_B = "00000000-0000-4000-8000-0000000000d3";    // sold by SELLER
    const PEM = ["-----BEGIN PUBLIC KEY-----", "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=", "-----END PUBLIC KEY-----"].join("\n");
    const site: Record<string, string> = {};
    const apply = async (event: object, siteId: string | null) => {
      const { data, error } = await db.rpc("billing_apply_payment_event", { p_provider: "woo", p_event_id: (event as { event_id: string }).event_id, p_event: event, p_site_id: siteId });
      return error ? { error: error.message } : { data: data as Record<string, unknown> };
    };
    const sub = (id: string, org: string, plan: string) => ({ event_id: id, kind: "subscription_paid", organization_id: org, plan_key: plan, period_end: days(30) });

    beforeAll(async () => {
      for (const [table, value] of [
        ["organizations", { id: SELLER, type: "client", name: "Reseller", slug: "e2e-seller", kind: "customer" }],
        ["organizations", { id: BUYER_AW, type: "client", name: "AW Buyer", slug: "e2e-buyer-aw", kind: "customer" }],
        ["organizations", { id: BUYER_B, type: "client", name: "Seller B Buyer", slug: "e2e-buyer-b", kind: "customer", sold_by_organization_id: SELLER }],
        ["plans", { plan_key: "seller_plan", product_key: "social", kind: "base", features: ["social.rewrite"], limits: {}, owner_organization_id: SELLER }],
        ["plans", { plan_key: "seller_video", product_key: "video", kind: "base", features: ["video.script"], limits: {}, owner_organization_id: SELLER }],
        // the seller may sell social and content (staff-written licence rows); not video
        // started a day ago, as staff write them: the app compares whole seconds (can.ts liveRow), a row from this very second is not yet live
        ["organization_entitlements", [{ organization_id: SELLER, product_key: "social", feature_key: "social.resell", source: "comp", source_ref: "e2e-licence", starts_at: days(-1) },
          { organization_id: SELLER, product_key: "content", feature_key: "content.resell", source: "comp", source_ref: "e2e-licence", starts_at: days(-1) }]],
        ["seller_sites", { seller_organization_id: SELLER, host: "shop.seller.test", platform: "woo", key_id: "seller-b", verify_alg: "ed25519", public_key: PEM, status: "active" }],
        ["seller_sites", { seller_organization_id: SELLER, host: "old.seller.test", platform: "woo", key_id: "seller-off", verify_alg: "ed25519", public_key: PEM, status: "disabled" }],
      ] as const) {
        const { error } = await db.from(table).insert(value);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      for (const r of await rows("seller_sites", {})) site[r.key_id as string] = r.id as string;
    });

    it("a woo event with no site is the aware-wave.com site", async () => {
      expect(await apply(sub("wc:legacy-1", BUYER_AW, "social_basic"), null)).toMatchObject({ data: { ok: true } });
      expect((await rows("payment_events", { event_id: "wc:legacy-1" }))[0].site_id).toBe(site["aware-wave-com"]);
    });

    it("a payment from site B for a buyer sold by site A is refused", async () => {
      expect(await apply(sub("wc:b-1", BUYER_AW, "social_basic"), site["seller-b"])).toEqual({ error: "payment_rejected:buyer_belongs_to_another_seller" });
      expect(await apply(sub("wc:aw-1", BUYER_B, "social_basic"), null)).toEqual({ error: "payment_rejected:buyer_belongs_to_another_seller" });
      expect(await rows("payment_events", { organization_id: BUYER_B })).toEqual([]);
    });

    it("a plan owned by another seller is refused on this site", async () => {
      expect(await apply(sub("wc:aw-2", BUYER_AW, "seller_plan"), null)).toEqual({ error: "payment_rejected:plan_not_sellable_here" });
      expect(await apply(sub("wc:b-2", BUYER_B, "seller_plan"), site["seller-b"])).toMatchObject({ data: { ok: true, plan_key: "seller_plan" } });
    });

    it("two sites may send the same event id and order number for different buyers", async () => {
      // the store plugin builds both from the shop's own order number (PaymentEvents.php `wc:payment_complete:<order>:credit_pack`)
      const pack = (org: string) => ({ event_id: "wc:payment_complete:7:credit_pack", kind: "credit_pack", organization_id: org, units: 10, order_ref: "7" });
      expect(await apply(pack(BUYER_AW), null)).toMatchObject({ data: { ok: true, units: 10 } });
      expect(await apply({ ...pack(BUYER_B), plan_key: "content_pack" }, site["seller-b"])).toMatchObject({ data: { ok: true, units: 10 } });
      expect((await rows("media_credit_ledger", { organization_id: BUYER_B })).map((r) => r.idempotency_key)).toEqual(["pack:woo@seller-b:7"]);
      expect((await rows("media_credit_ledger", { organization_id: BUYER_AW })).map((r) => r.idempotency_key)).toEqual(["pack:woo:7"]);   // aware-wave.com keys unchanged
      expect(await apply({ ...pack(BUYER_B), plan_key: "content_pack" }, site["seller-b"])).toMatchObject({ data: { replayed: true } });
    });

    it("the operator may cancel a seller's plan by hand; another site may not", async () => {
      const cancel = { event_id: "wc:cancel-b", kind: "subscription_canceled", organization_id: BUYER_B, plan_key: "seller_plan" };
      expect(await apply(cancel, site["aware-wave-com"])).toEqual({ error: "payment_rejected:buyer_belongs_to_another_seller" });
      expect(await send({ ...cancel, event_id: "bank-cancel-b" })).toMatchObject({ status: 200, body: { ok: true, kind: "subscription_canceled" } });
    });

    it("another seller's site takes money only for a product it is licensed to sell", async () => {
      expect(await apply(sub("wc:b-video", BUYER_B, "seller_video"), site["seller-b"])).toEqual({ error: "payment_rejected:seller_not_licensed" });
      const bare = { event_id: "wc:b-pack-bare", kind: "credit_pack", organization_id: BUYER_B, units: 5, order_ref: "8" };
      expect(await apply(bare, site["seller-b"])).toEqual({ error: "payment_rejected:seller_pack_needs_plan" });
      expect(await rows("payment_events", { event_id: "wc:b-video" })).toEqual([]);
    });

    it("a disabled site is refused", async () => {
      expect(await apply(sub("wc:off-1", BUYER_B, "seller_plan"), site["seller-off"])).toEqual({ error: "payment_rejected:site_disabled" });
    });

    it("a seller's site signs a woo payment with its ed25519 key through the route (4c-2)", async () => {
      // the shared vector's key (fixtures/ed25519-v1.json); a member already known at that site, so no invite mail is sent
      const { registerSite } = await import("@/lib/payments/sites");
      const made = await registerSite(db, { host: "fixture.seller.test", keyId: "seller-fx", sellerOrganizationId: SELLER, publicKey: fixture.public_key_pem });
      if (made.ok === false) throw new Error(made.error);
      const USER = "00000000-0000-4000-8000-0000000000d4";
      for (const [table, value] of [
        ["profiles", { id: USER, email: "fx-member@seller.test", default_organization_id: BUYER_B }],
        ["customer_identities", { provider: "customer-wp", site_id: made.site.id, external_id: "7", user_id: USER, organization_id: BUYER_B }],
      ] as const) {
        const { error } = await db.from(table).insert(value);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      Object.assign(process.env, { PAYMENTS_PROVIDERS: "local,woo" });
      const key = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(fixture.seed_hex, "hex")]), format: "der", type: "pkcs8" });
      const body = JSON.stringify({ event_id: "wc:payment_complete:7:subscription", wp_user_id: 7, email: "fx-member@seller.test", email_verified: true,
        kind: "subscription_paid", plan_key: "seller_plan", period_end: days(30), external_ref: "7" });
      const post = async (siteKey: string) => {
        const { POST } = await import("../../../app/api/webhooks/payments/[provider]/route");
        const res = await POST(new Request("http://app.test/api/webhooks/payments/woo", { method: "POST", headers: { "content-type": "application/json",
          [PAYMENT_SITE_HEADER]: siteKey, "x-awarewave-payment-signature": sign(null, Buffer.from(body, "utf8"), key).toString("base64") }, body }),
          { params: Promise.resolve({ provider: "woo" }) });
        return { status: res.status, body: await res.json() };
      };
      // the same bytes and signature naming another site are not that site's request
      expect(await post("seller-b")).toEqual({ status: 401, body: { ok: false, error: "invalid_signature" } });
      expect(await post("seller-fx")).toMatchObject({ status: 200, body: { ok: true, kind: "subscription_paid" } });
      const [ev] = await rows("payment_events", { event_id: "wc:payment_complete:7:subscription" });
      expect([ev.site_id, ev.organization_id]).toEqual([made.site.id, BUYER_B]);
      // the contract reference carries the site's namespace (0133 v_ns): another shop's order 7 is another contract
      expect((await rows("organization_product_subscriptions", { organization_id: BUYER_B, plan_key: "seller_plan" })).map((r) => r.source_ref)).toEqual(["woo@seller-fx:7"]);
      // D4's monthly report counts what the seller's own sites took (wc:b-2, this one, pack order 7); the operator's
      // local entry for the seller's buyer (bank-cancel-b) and refused events are nobody's sale (critic 2026-10-29 M3)
      const { billingSellerMonth, taipeiMonthStart } = await import("@/lib/entitlements/tables");
      expect((await billingSellerMonth(taipeiMonthStart(), db)).rows.find((r) => r.seller_id === SELLER))
        .toMatchObject({ subscription_payments: 2, credit_pack_orders: 1, credit_pack_units: 10 });
    });
  });
});
