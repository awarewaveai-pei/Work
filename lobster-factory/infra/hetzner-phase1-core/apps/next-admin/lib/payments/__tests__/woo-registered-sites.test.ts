// Card SF-I: woo.ts reads sites the site flow registered (environments.metadata.bridge + the vault) besides the env
// clients. The env path keeps its exact behaviour (lib/studio/__tests__/wp-bridge-client-mode-gate.test.ts stays as
// is); these cases are the "DB site" half: signs with the vaulted key, gates on the owner org, never falls back to the
// default env client, and lists only sites whose owner is recorded.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createPrivateKey, createPublicKey, verify as edVerify } from "node:crypto";

const checkProductionChangeAllowed = vi.hoisted(() => vi.fn(async (_c: unknown, _org: string | null) => ({ allowed: true, mode: "normal" })));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

type Row = Record<string, unknown>;
const tables = vi.hoisted(() => ({ data: {} as Record<string, Row[]> }));
/** select/eq/neq + maybeSingle or await: all the registered-site reads need. */
const fakeClient = vi.hoisted(() => ({
  from: (t: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const rows = () => (tables.data[t] ?? []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
    };
    return q;
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeClient }));
const vaultStore = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secret-vault", () => ({ getSecret: async (n: string) => vaultStore.get(n) ?? null }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { bridgeRead, bridgePost, bridgeSiteOrg, listBridgeClients, listBridgeClientsWithRegistered, registeredBridgeClientId } = await import("../woo");

const ORG = "22222222-2222-4222-8222-222222222222";
const ENV = "7a1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const ENV2 = "8b1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const CRED = "c0c0c0c0-0000-4000-8000-000000000001";
const SEED = Buffer.alloc(32, 9).toString("base64");
const DEFAULT_SEED = Buffer.alloc(32, 7).toString("base64");
const savedEnv = { ...process.env };

const environment = (over: Row = {}): Row => ({
  id: ENV,
  organization_id: ORG,
  base_url: "https://acme.example.com/",
  status: "ready",
  metadata: { bridge: { key_id: "aw-7a1e2d3c-0001", credential_id: CRED } },
  ...over,
});

beforeEach(() => {
  tables.data = {
    environments: [environment()],
    client_credentials: [{ id: CRED, secret_ref: `client_cred:${CRED}` }],
    wp_sites: [
      { url: "https://soulfulexpression.org", organization_id: "org-soulful", active: true },
      { url: "https://acme.example.com", organization_id: ORG, active: true },
    ],
  };
  vaultStore.clear();
  vaultStore.set(`client_cred:${CRED}`, SEED);
  checkProductionChangeAllowed.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ posts: [] }) });
  // the default env client is configured: a registered id must never reach it
  process.env.WPBRIDGE_BASE_URL = "https://soulfulexpression.org";
  process.env.WPBRIDGE_KEY_ID = "SE-01";
  process.env.WPBRIDGE_PRIVATE_KEY = DEFAULT_SEED;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe("registered (site-flow) bridge sites", () => {
  it("bridgeSiteOrg answers the new site's organization, not global mode", async () => {
    expect(await bridgeSiteOrg(fakeClient as never, "https://acme.example.com")).toBe(ORG);
  });

  it("bridgeRead on env:<id> signs with the vaulted key for that site", async () => {
    const r = await bridgeRead("/drafts", {}, { clientId: registeredBridgeClientId(ENV) });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://acme.example.com/?rest_route=/aware-wave-bridge/v1/drafts");
    const h = init.headers as Record<string, string>;
    expect(h["X-AWBridge-Key-Id"]).toBe("aw-7a1e2d3c-0001");
    const canonical = `POST\n/aware-wave-bridge/v1/drafts\n${h["X-AWBridge-Timestamp"]}\n${h["X-AWBridge-Nonce"]}\n${createHash("sha256").update(String(init.body)).digest("hex")}`;
    const priv = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(SEED, "base64")]), format: "der", type: "pkcs8" });
    expect(edVerify(null, Buffer.from(canonical), createPublicKey(priv), Buffer.from(h["X-AWBridge-Signature"], "base64"))).toBe(true);
  });

  it("bridgePost on env:<id> gates on the owner organization", async () => {
    await bridgePost("/post", { title: "x" }, { clientId: registeredBridgeClientId(ENV) });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(fakeClient, ORG);
  });

  it("never falls back to the default env client: no owner row, unknown id, archived, empty vault -> not configured, no request", async () => {
    const cases: Array<() => void> = [
      () => (tables.data.wp_sites = tables.data.wp_sites.filter((w) => w.url !== "https://acme.example.com")),
      () => (tables.data.environments = []),
      () => (tables.data.environments = [environment({ status: "archived" })]),
      () => vaultStore.clear(),
      () => (tables.data.wp_sites = tables.data.wp_sites.map((w) => (w.url === "https://acme.example.com" ? { ...w, organization_id: "org-other" } : w))),
    ];
    for (const breakIt of cases) {
      breakIt();
      expect(await bridgeRead("/drafts", {}, { clientId: registeredBridgeClientId(ENV) })).toEqual({ ok: false, error: "bridge_not_configured" });
      expect(await bridgePost("/post", {}, { clientId: "env:not-a-uuid" })).toEqual({ ok: false, error: "bridge_not_configured" });
      expect(fetchMock).not.toHaveBeenCalled();
      // restore for the next case
      tables.data.environments = [environment()];
      tables.data.wp_sites = [{ url: "https://soulfulexpression.org", organization_id: "org-soulful", active: true }, { url: "https://acme.example.com", organization_id: ORG, active: true }];
      vaultStore.set(`client_cred:${CRED}`, SEED);
    }
  });

  it("the client list: env clients first and unchanged, then registered sites with a recorded owner on an install no env client serves", async () => {
    tables.data.environments = [
      environment(),
      environment({ id: ENV2, base_url: "https://soulfulexpression.org", metadata: { bridge: { key_id: "dup", credential_id: CRED } } }),
      environment({ id: "9c1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b", base_url: "https://no-owner.example.com" }),
    ];
    const env = listBridgeClients();
    expect(env).toEqual([{ id: "", name: "soulfulexpression.org", baseUrl: "https://soulfulexpression.org" }]);
    expect(await listBridgeClientsWithRegistered(fakeClient as never)).toEqual([
      ...env,
      { id: `env:${ENV}`, name: "acme.example.com", baseUrl: "https://acme.example.com" },
    ]);
  });
});
