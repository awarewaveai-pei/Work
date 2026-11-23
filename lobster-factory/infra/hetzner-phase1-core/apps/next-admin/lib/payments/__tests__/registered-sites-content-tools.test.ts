// Card SF-I2: the content tools reach sites the site flow registered (environments.metadata.bridge + the vault, client id
// `env:<environments.id>`), not only the env bridge clients. Real woo.ts over a fake DB; per caller one "the registered
// site is found / gets its client" case and one "it cannot be loaded -> not configured, never the default site" case.
// The default env client (soulful) is configured throughout, so any fallback to it would show as a request to it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, errors: {} as Record<string, { message: string }> }));
/** select/eq/neq/in + maybeSingle or await, with a per-table error switch. */
const fakeClient = vi.hoisted(() => ({
  from: (t: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const rows = () => (db.tables[t] ?? []).filter((r) => filters.every((f) => f(r)));
    const answer = (single: boolean) => (db.errors[t] ? { data: null, error: db.errors[t] } : { data: single ? rows()[0] ?? null : rows(), error: null });
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      order: () => q,
      maybeSingle: async () => answer(true),
      then: (resolve: (v: unknown) => void) => resolve(answer(false)),
    };
    return q;
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeClient }));
const vault = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/secret-vault", () => ({ getSecret: async (n: string) => vault.get(n) ?? null }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }) }));

const ACME = "https://acme.example.com";
const ORG = "22222222-2222-4222-8222-222222222222";
const ENV = "7a1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const CRED = "c0c0c0c0-0000-4000-8000-000000000001";
const REG = `env:${ENV}`;

// the content tools' site seam: the site flow's wp_sites row for acme (empty REST token)
const acmeSite = { site: { id: "w1", name: "Acme", color: "#000", username: "", url: ACME, organizationId: ORG }, token: "", username: "", authHeader: "" };
vi.mock("@/lib/content/wp-sites", () => ({
  getWpSites: async () => ({ sites: [acmeSite.site], tokens: { w1: "" }, usernames: { w1: "" } }),
  resolveWpSite: async () => acmeSite,
  listAccessibleWpSites: async () => ({ sites: [acmeSite.site], tokens: { w1: "" }, usernames: { w1: "" } }),
  wpAuthHeader: () => "",
}));
vi.mock("@/lib/content/video/delivery-receipts", () => ({ mediaPersistenceEnabled: () => false }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

const { listBridgeClientsWithRegistered, bridgeClientForSiteWithRegistered, BRIDGE_ONLY_SITE_ERROR, isBridgeConfigured, bridgeBaseUrl, canonicalRegisteredBridgeClientId } = await import("../woo");
const { publishToWordPress } = await import("@/lib/content/publish/wordpress-core");
const { listNotLiveDrafts } = await import("@/lib/content/video/embed-in-post");
const { memberNewsletterDeps } = await import("@/lib/crm/member-newsletter");
const { bridgeClientId } = await import("@/lib/outreach/warm-leads");

const savedEnv = { ...process.env };
const identity = { headers: new Headers() };
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  db.tables = {
    environments: [{ id: ENV, organization_id: ORG, base_url: `${ACME}/`, status: "ready", metadata: { bridge: { key_id: "aw-acme-01", credential_id: CRED } } }],
    client_credentials: [{ id: CRED, secret_ref: `client_cred:${CRED}` }],
    wp_sites: [
      { url: "https://soulfulexpression.org", organization_id: "org-soulful", active: true },
      { url: ACME, organization_id: ORG, active: true },
    ],
    organizations: [{ id: ORG, name: "Acme 客戶" }],
  };
  db.errors = {};
  vault.clear();
  vault.set(`client_cred:${CRED}`, Buffer.alloc(32, 9).toString("base64"));
  process.env.WPBRIDGE_BASE_URL = "https://soulfulexpression.org";
  process.env.WPBRIDGE_KEY_ID = "SE-01";
  process.env.WPBRIDGE_PRIVATE_KEY = Buffer.alloc(32, 7).toString("base64");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "committed", post_id: 9, posts: [] }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

/** The registry is readable but the key is gone: the site is listed, yet nothing may be signed for it. */
const keyGone = () => vault.clear();
/** The registry itself cannot be read. */
const registryDown = () => { db.errors.environments = { message: "db down" }; };

describe("woo.ts: the channel and the label", () => {
  it("bridgeClientForSiteWithRegistered: the registered site's id; an env client keeps its install; unreadable registry -> null, never the default", async () => {
    expect(await bridgeClientForSiteWithRegistered(ACME)).toBe(REG);
    expect(await bridgeClientForSiteWithRegistered("https://soulfulexpression.org")).toBe("");
    registryDown();
    expect(await bridgeClientForSiteWithRegistered(ACME)).toBeNull();
  });

  it("the sync env-only helpers never read an env:<id> as the default client; one spelling per registered id", () => {
    expect(isBridgeConfigured(REG)).toBe(false);
    expect(bridgeBaseUrl(REG.toUpperCase())).toBeNull();
    expect(canonicalRegisteredBridgeClientId(`ENV:${ENV.toUpperCase()}`)).toBe(REG);
    expect(canonicalRegisteredBridgeClientId("env:../x")).toBeNull();
  });

  it("the picker names a registered site by its client (URL beside it); a failed name read falls back to the host", async () => {
    expect((await listBridgeClientsWithRegistered()).find((c) => c.id === REG)).toEqual({ id: REG, name: "Acme 客戶", baseUrl: ACME });
    db.errors.organizations = { message: "denied" };
    expect((await listBridgeClientsWithRegistered()).find((c) => c.id === REG)?.name).toBe("acme.example.com");
  });
});

describe("publishToWordPress (wordpress-core)", () => {
  const publish = () => publishToWordPress({ markdown: "# Title\n\nBody text.", siteId: "w1" }, identity);

  it("a registered site publishes through its own bridge client, signed with its key", async () => {
    const r = await publish();
    expect(r.ok).toBe(true);
    expect(urls()).toEqual([`${ACME}/?rest_route=/aware-wave-bridge/v1/post`]);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)["X-AWBridge-Key-Id"]).toBe("aw-acme-01");
  });

  it("its key cannot be loaded: fails, no request at all (not to the default site, not an empty-token REST call)", async () => {
    keyGone();
    const r = await publish();
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the registry cannot be read: the bridge-only answer, no request", async () => {
    registryDown();
    expect(await publish()).toEqual({ ok: false, status: 503, error: BRIDGE_ONLY_SITE_ERROR, wire: "json" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listNotLiveDrafts (embed-in-post)", () => {
  it("a registered site's drafts are read through its bridge", async () => {
    expect(await listNotLiveDrafts(acmeSite)).toEqual({ ok: true, posts: [] });
    expect(urls()).toEqual([`${ACME}/?rest_route=/aware-wave-bridge/v1/drafts`]);
  });

  it("its key cannot be loaded: an error, no request to the default site", async () => {
    keyGone();
    expect((await listNotLiveDrafts(acmeSite)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the registry cannot be read: the bridge-only answer instead of an empty-token REST read", async () => {
    registryDown();
    expect(await listNotLiveDrafts(acmeSite)).toEqual({ ok: false, status: 503, error: BRIDGE_ONLY_SITE_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("member newsletter: bridgeFor", () => {
  const deps = () => memberNewsletterDeps(fakeClient as never, ORG);

  it("a registered site gets its own client id", async () => {
    expect(await deps().bridgeFor(ACME)).toBe(REG);
  });

  it("the registry cannot be read: no bridge (skipped), never the default one", async () => {
    registryDown();
    expect(await deps().bridgeFor(ACME)).toBeNull();
  });
});

describe("warm leads: bridgeClientId", () => {
  it("an organization whose site was registered syncs through that site", async () => {
    expect(await bridgeClientId(ORG)).toBe(REG);
  });

  it("the registry cannot be read: none (no_bridge), never the default one", async () => {
    registryDown();
    expect(await bridgeClientId(ORG)).toBeNull();
  });
});
