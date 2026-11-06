// A client's own Gemini key serves its outreach JSON steps; the platform key is the fallback (operator 2026-11-06).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vault = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/secret-vault", () => ({ getSecret: vault.get, connectorSecretRef: (id: string) => `co_connector:${id}` }));
vi.mock("@/lib/ai/log-ai-call", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/log-ai-call")>()), logAiCall: async () => {} }));
vi.mock("@/lib/ai/gateway", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/gateway")>()), providerUrl: (_g: unknown, _p: string, path: string) => `https://gemini.test${path}` }));

const { outreachJson, resetOrgAiKeyCache } = await import("../org-ai-key");
const { GEMINI_LITE_MODEL } = await import("@/lib/ai/gemini-models");

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }), { status: 200 });
const grant = { subject: { kind: "org", orgId: "org-1" } } as never;
const fromOf = (row: { id: string } | null) => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: row });
  return () => q;
};
const db = (row: { id: string } | null) => ({ from: fromOf(row) }) as never;
const sc = (d: never, organizationId: string | null = "org-1") => ({ db: d, organizationId });
const args = { route: "t", system: "s", user: "u", maxTokens: 10, model: GEMINI_LITE_MODEL, grant };
let urls: string[];
const stubFetch = (...answers: Array<() => Response>) => {
  urls = [];
  vi.stubGlobal("fetch", async (u: string) => { urls.push(u); return (answers[urls.length - 1] ?? answers[answers.length - 1])(); });
};
const keyOf = (u: string) => decodeURIComponent(u.split("key=")[1]);

beforeEach(() => { process.env.GEMINI_API_KEY = "platform-key"; resetOrgAiKeyCache(); vault.get.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });

describe("outreachJson", () => {
  it("uses the organization's own key when it has one", async () => {
    vault.get.mockResolvedValue("org-key");
    stubFetch(() => ok("{}"));
    expect(await outreachJson(sc(db({ id: "c1" })), args)).toMatchObject({ ok: true });
    expect(urls.map(keyOf)).toEqual(["org-key"]);
    expect(vault.get).toHaveBeenCalledWith("co_connector:c1");
  });

  it("uses the platform key when the organization has no connector", async () => {
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db(null)), args);
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
    expect(vault.get).not.toHaveBeenCalled();
  });

  it("uses the platform key when neither the caller nor the grant names an organization", async () => {
    vault.get.mockResolvedValue("org-key");
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db({ id: "c1" }), null), { ...args, grant: {} as never });
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
  });

  it("a vault error means the platform key, and the warning carries no key text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vault.get.mockRejectedValue(new Error("secret-vault get failed: org-key"));
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db({ id: "c1" })), args);
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("org-key");
    warn.mockRestore();
  });

  it("the organization's daily cap, or a refused key, falls back to the platform key once", async () => {
    vault.get.mockResolvedValue("org-key");
    const daily = () => new Response(JSON.stringify({ error: { details: [{ retryDelay: "35336s" }] } }), { status: 429 });
    stubFetch(daily, () => ok("{}"));
    expect(await outreachJson(sc(db({ id: "c1" })), args)).toMatchObject({ ok: true });
    expect(urls.map(keyOf)).toEqual(["org-key", "platform-key"]);
    for (const refused of [new Response("{}", { status: 403 }), new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })]) {
      resetOrgAiKeyCache();
      stubFetch(() => refused.clone(), () => ok("{}"));
      expect(await outreachJson(sc(db({ id: "c1" })), args)).toMatchObject({ ok: true });
      expect(urls.map(keyOf)).toEqual(["org-key", "platform-key"]);
    }
  });

  it("any other failure is returned as it is, with no second call", async () => {
    vault.get.mockResolvedValue("org-key");
    stubFetch(() => new Response("{}", { status: 500 }));
    expect(await outreachJson(sc(db({ id: "c1" })), args)).toEqual({ ok: false, status: 502, error: "gemini_500" });
    expect(urls).toHaveLength(1);
  });

  it("the key is read once per organization within the cache window, an absent key too", async () => {
    vault.get.mockResolvedValue("org-key");
    stubFetch(() => ok("{}"));
    const one = db({ id: "c1" });
    await outreachJson(sc(one), args);
    await outreachJson(sc(one), args);
    expect(vault.get).toHaveBeenCalledTimes(1);
    resetOrgAiKeyCache();
    const from = vi.fn(fromOf(null));
    const none = { from } as never;
    await outreachJson(sc(none), args);
    await outreachJson(sc(none), args);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("the same organization id in two databases keeps two keys: the cache is per database", async () => {
    vault.get.mockImplementation(async (ref: string) => (ref === "co_connector:main" ? "main-key" : "own-key"));
    stubFetch(() => ok("{}"));
    const main = db({ id: "main" }), own = db({ id: "own" });
    await outreachJson(sc(main), args);
    await outreachJson(sc(own), args);
    await outreachJson(sc(main), args);
    expect(urls.map(keyOf)).toEqual(["main-key", "own-key", "main-key"]);
  });

  it("a child organization's own key wins over its billing root's; the root's serves a child with none", async () => {
    vault.get.mockImplementation(async (ref: string) => (ref === "co_connector:child" ? "child-key" : "root-key"));
    const byOrg = (rows: Record<string, { id: string }>) => ({ from: () => {
      let org = "";
      const q: Record<string, unknown> = {};
      for (const m of ["select", "not", "limit"]) q[m] = () => q;
      q.eq = (c: string, v: string) => { if (c === "organization_id") org = v; return q; };
      q.maybeSingle = async () => ({ data: rows[org] ?? null });
      return q;
    } }) as never;
    stubFetch(() => ok("{}"));
    await outreachJson(sc(byOrg({ "child-1": { id: "child" }, "org-1": { id: "root" } }), "child-1"), args);
    expect(urls.map(keyOf)).toEqual(["child-key"]);
    resetOrgAiKeyCache();
    stubFetch(() => ok("{}"));
    await outreachJson(sc(byOrg({ "org-1": { id: "root" } }), "child-1"), args);
    expect(urls.map(keyOf)).toEqual(["root-key"]);
  });

  it("no database in the scope means the platform key, and the lookup runs on the database it was given", async () => {
    stubFetch(() => ok("{}"));
    await outreachJson(sc(null as never), args);
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
    vault.get.mockResolvedValue("client-db-key");
    const from = vi.fn(fromOf({ id: "c9" }));
    stubFetch(() => ok("{}"));
    await outreachJson(sc({ from } as never), args);
    expect(from).toHaveBeenCalledWith("co_connector_accounts");
    expect(urls.map(keyOf)).toEqual(["client-db-key"]);
  });

  it("a failed lookup (query error or vault error) uses the platform key and is not cached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { from: () => { const q: Record<string, unknown> = {}; for (const m of ["select", "eq", "not", "limit"]) q[m] = () => q; q.maybeSingle = async () => ({ data: null, error: { message: "boom" } }); return q; } } as never;
    stubFetch(() => ok("{}"));
    await outreachJson(sc(bad), args);
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
    vault.get.mockResolvedValue("org-key");
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db({ id: "c1" })), args);
    expect(urls.map(keyOf)).toEqual(["org-key"]);
    resetOrgAiKeyCache();
    vault.get.mockRejectedValueOnce(new Error("vault down"));
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db({ id: "c1" })), args);
    expect(urls.map(keyOf)).toEqual(["platform-key"]);
    stubFetch(() => ok("{}"));
    await outreachJson(sc(db({ id: "c1" })), args);
    expect(urls.map(keyOf)).toEqual(["org-key"]);
    vi.restoreAllMocks();
  });
});
