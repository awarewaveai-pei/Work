// PUT /api/ops/clients/[slug]/cs-config/chatwoot-token — the three named cases: a saved token is never
// echoed, a non-owner/admin is refused, a bot token is refused before anything is stored.
// checkUserToken runs for real against a stubbed fetch (Chatwoot's answer to the contacts probe).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
const TOKEN = "user-token-SECRET-value-123";

const vault = vi.hoisted(() => ({
  putSecret: vi.fn(async (name: string) => name),
  getSecret: vi.fn(async (): Promise<string | null> => null),
  deleteSecret: vi.fn(async () => true),
}));
const audit = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/secret-vault", () => vault);
vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: audit }));
vi.mock("@/lib/cs/cis", () => ({
  loadCis: async (organizationId: string) => ({ organizationId, chatwoot: { accountId: 2, baseUrl: "https://chatwoot.example" } }),
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: ORG }, error: null }) }) }) }),
  }),
}));

const { PUT } = await import("./route");

const fetchMock = vi.fn();
const ctx = () => ({ params: Promise.resolve({ slug: "soulful" }) });
const put = (role: string) =>
  new Request("http://localhost/api/ops/clients/soulful/cs-config/chatwoot-token", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-ops-claims-role": role },
    body: JSON.stringify({ token: TOKEN }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("PUT chatwoot-token", () => {
  it("stores a member's User token under user_token and never returns or audits the value", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ payload: [] }), { status: 200 }));
    const res = await PUT(put("admin"), ctx());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, configured: true });
    expect(text).not.toContain(TOKEN);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://chatwoot.example/api/v1/accounts/2/contacts?page=1");
    expect(vault.putSecret).toHaveBeenCalledWith(`cs:chatwoot:${ORG}:user_token`, TOKEN);
    expect(JSON.stringify(audit.mock.calls)).not.toContain(TOKEN);
  });

  it("refuses a role below owner/admin without calling Chatwoot or the vault", async () => {
    const res = await PUT(put("viewer"), ctx());
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vault.putSecret).not.toHaveBeenCalled();
  });

  it("refuses an AgentBot token (Chatwoot 401 on contacts) and stores nothing", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    const res = await PUT(put("admin"), ctx());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "token_rejected" });
    expect(vault.putSecret).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
