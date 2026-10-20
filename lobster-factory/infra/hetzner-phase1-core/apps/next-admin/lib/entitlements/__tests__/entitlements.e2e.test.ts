// ADR 017 step 3 against a real Postgres + PostgREST in enforce mode. Run only by
// lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py (sets ENTITLEMENTS_REST);
// skipped otherwise (npm test, the deploy gate). Touches no production.
import { createHmac, generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REST = process.env.ENTITLEMENTS_REST;
const INTERNAL = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const ISSUER_TOKEN = "issuer-e2e-token-long-enough";

function serviceToken(secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe.skipIf(!REST)("entitlements against a real database (enforce)", () => {
  let proxy: http.Server;
  let db: SupabaseClient;
  const pair = generateKeyPairSync("ed25519");
  const publicPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const staff = () => new Request("http://app.test/api/x", { method: "POST", headers: {
    "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "e2e-user", "content-type": "application/json" }, body: JSON.stringify({ keyword: "茶" }) });

  beforeAll(async () => {
    const target = new URL(REST as string);
    proxy = http.createServer((req, res) => {
      const up = http.request({ host: target.hostname, port: target.port, method: req.method, headers: req.headers,
        path: (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/" }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
    Object.assign(process.env, {
      SUPABASE_URL: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
      SUPABASE_SERVICE_ROLE_KEY: serviceToken(process.env.ENTITLEMENTS_JWT_SECRET as string),
      ENTITLEMENT_MODE: "enforce",
      ENTITLEMENT_SIGNING_KEY: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      ENTITLEMENT_SIGNING_KID: "k1",
      ENTITLEMENT_PUBLIC_KEYS: `k1:${publicPem}`,
      ENTITLEMENT_ISSUER_TOKEN_COGNITIVE: ISSUER_TOKEN,
    });
    delete process.env.ANTHROPIC_API_KEY;   // a passed gate ends at the handler's own 503, never a real model call
    db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    const { error } = await db.from("organizations").insert([
      { id: INTERNAL, type: "agency", name: "AwareWave", slug: "e2e-internal", kind: "internal" },
      { id: CUSTOMER, type: "client", name: "Customer", slug: "e2e-customer", kind: "customer" },
    ]);
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
});
