// ADR 017 step 3 against a real Postgres + PostgREST in enforce mode. Run only by
// lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py (sets ENTITLEMENTS_REST);
// skipped otherwise (npm test, the deploy gate). Touches no production.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import type http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const INTERNAL = "00000000-0000-4000-8000-0000000000a1";
const EDD = "00000000-0000-4000-8000-0000000000e1";
const SOULFUL = "00000000-0000-4000-8000-0000000000f1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const ISSUER_TOKEN = "issuer-e2e-token-long-enough";

describe.skipIf(!REST)("entitlements against a real database (enforce)", () => {
  let proxy: http.Server;
  let db: SupabaseClient;
  const pair = generateKeyPairSync("ed25519");
  const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const staff = () => new Request("http://app.test/api/x", { method: "POST", headers: {
    "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "e2e-user", "content-type": "application/json" }, body: JSON.stringify({ keyword: "茶" }) });

  beforeAll(async () => {
    proxy = await startRestProxy(REST as string);
    Object.assign(process.env, {
      ENTITLEMENT_MODE: "enforce",
      ENTITLEMENT_SIGNING_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      ENTITLEMENT_SIGNING_KID: "k1",
      ENTITLEMENT_PUBLIC_KEYS: `k1:${publicPem}`,
      ENTITLEMENT_ISSUER_TOKEN_COGNITIVE: ISSUER_TOKEN,
    });
    delete process.env.ANTHROPIC_API_KEY;   // a passed gate ends at the handler's own 503, never a real model call
    db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    // The internal account (and edd/soulful) is seeded by the harness before 0118; only the customer under test is added here.
    const { error } = await db.from("organizations").insert({ id: CUSTOMER, type: "client", name: "Customer", slug: "e2e-customer", kind: "customer" });
    if (error) throw new Error(error.message);
  });
  afterAll(() => new Promise<void>((ok) => proxy?.close(() => ok())));

  it("zero balance: the button list greys content.title and the paid route answers 403 no_credits; a wallet grant opens both", async () => {
    const { GET } = await import("../../../app/api/entitlements/features/route");
    const { POST } = await import("../../../app/api/content/title/route");
    const { resetFeatureListCache } = await import("../features");

    const list = await (await GET(staff())).json();
    expect(list.list.mode).toBe("enforce");
    expect(list.list.subject).toBe(INTERNAL);
    expect(list.list.features["content.title"]).toEqual({ allowed: false, verdict: false, reason: "no_credits" });
    expect(typeof list.signature).toBe("string");
    const refused = await POST(staff());
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "no_credits" });

    const { error } = await db.from("media_credit_ledger").insert({ organization_id: INTERNAL, units: 10, entry_type: "grant", idempotency_key: "e2e-grant-1" });
    if (error) throw new Error(error.message);
    resetFeatureListCache();
    expect((await (await GET(staff())).json()).list.features["content.title"]).toEqual({ allowed: true, verdict: true, reason: null });
    const passed = await POST(staff());
    expect([passed.status, await passed.text()]).toEqual([503, "ANTHROPIC_API_KEY not configured"]);   // past the gate
  });

  it("the cognitive issuer refuses without an entitlement row and issues a permit with one", async () => {
    const { POST } = await import("../../../app/api/internal/entitlements/permit/[product]/route");
    const ask = (auth = ISSUER_TOKEN) => POST(new Request("http://app.test/api/internal/entitlements/permit/cognitive", { method: "POST",
      headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ organization_id: CUSTOMER, feature_key: "architecture.adr", actor: "cognitive:person-1" }) }), { params: Promise.resolve({ product: "cognitive" }) });

    expect((await ask("wrong")).status).toBe(401);
    expect(await (await ask()).json()).toEqual({ allowed: false, reason: "no_entitlement" });
    const { data, error } = await db.from("organization_entitlements").insert({ organization_id: CUSTOMER, product_key: "cognitive", feature_key: "architecture.adr",
      source: "comp", source_ref: "e2e", starts_at: new Date(Date.now() - 60_000).toISOString(), status: "active", limits: {} }).select("id").single();
    if (error) throw new Error(error.message);
    const issued = await (await ask()).json();
    expect(issued.allowed).toBe(true);
    if (process.env.ENTITLEMENTS_PERMIT_OUT) writeFileSync(process.env.ENTITLEMENTS_PERMIT_OUT, JSON.stringify({
      permit: issued.permit, public_pem: publicPem, org: CUSTOMER, feature: "architecture.adr", actor: "cognitive:person-1", entitlement_id: data.id }));
  });

  // Last: the sweep gives the internal account an entitlement per feature, which would hide the zero-balance path above.
  it("the expiry sweep ends a trial once its grants lapse and keeps one still in grace", async () => {
    const { POST } = await import("../../../app/api/internal/entitlements/expire/route");
    const day = 86_400_000;
    const at = (offset: number) => new Date(Date.now() + offset).toISOString();
    const insert = async (table: string, rows: object | object[]) => {
      const { data, error } = await db.from(table).insert(rows).select("*");
      if (error) throw new Error(`${table}: ${error.message}`);
      return data as Array<{ id: string }>;
    };
    await insert("plans", [
      { plan_key: "cognitive_trial", product_key: "cognitive", kind: "base", features: ["trial.lapsed"] },
      { plan_key: "hci_trial", product_key: "hci", kind: "base", features: ["trial.grace"] },
    ]);
    const [lapsed, grace] = await insert("organization_product_subscriptions", [
      { organization_id: CUSTOMER, product_key: "cognitive", plan_key: "cognitive_trial", status: "trial", started_at: at(-22 * day), current_period_end: at(-8 * day) },
      { organization_id: CUSTOMER, product_key: "hci", plan_key: "hci_trial", status: "trial", started_at: at(-15 * day), current_period_end: at(-day) },
    ]);
    await insert("organization_entitlements", [
      { organization_id: CUSTOMER, product_key: "cognitive", feature_key: "trial.lapsed", source: "contract", source_ref: lapsed.id, starts_at: at(-22 * day), ends_at: at(-day) },
      { organization_id: CUSTOMER, product_key: "hci", feature_key: "trial.grace", source: "contract", source_ref: grace.id, starts_at: at(-15 * day), ends_at: at(6 * day) },
    ]);
    process.env.SCHEDULE_INGEST_TOKEN = "expiry-e2e-token";
    const sweep = () => POST(new Request("http://app.test/api/internal/entitlements/expire", { method: "POST", headers: { authorization: "Bearer expiry-e2e-token" } }));

    // 0118 tops the internal / edd / soulful accounts up with one grant per registered feature; customers get none.
    const first = await (await sweep()).json();
    expect(first).toMatchObject({ ok: true, expired: 1, trials_ended: 1 });
    expect(first.all_features_added).toBeGreaterThan(0);
    const { data: topped, error: toppedError } = await db.from("organization_entitlements").select("organization_id").like("source_ref", "all-features:%");
    if (toppedError) throw new Error(toppedError.message);
    expect(new Set(topped?.map((r) => r.organization_id))).toEqual(new Set([INTERNAL, EDD, SOULFUL]));
    const { data, error } = await db.from("organization_product_subscriptions").select("product_key, status, trial_started_at").order("product_key");
    if (error) throw new Error(error.message);
    expect(data?.map((r) => [r.product_key, r.status, r.trial_started_at !== null])).toEqual([["cognitive", "canceled", true], ["hci", "trial", true]]);
    expect(await (await sweep()).json()).toEqual({ ok: true, expired: 0, trials_ended: 0, all_features_added: 0 });   // idempotent
  });
});
