// /api/ops/clients/[slug]/member-transfer -- the named cases (DISPATCH M8): staff who are not owner/admin → 403, a client
// identity → 403, nothing written either way; owner/admin → a transfer invite whose code is answered once and audited
// without it. The swap itself is the database's (packages/db/tests/test_0182_member_transfer.py).
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
const rpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
  data: { id: "inv-1", expires_at: "2026-12-08T00:00:00.000Z" }, error: null as null | { code?: string; message: string },
})));
const audit = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));

vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: audit }));
// the cash-register host comes from aware-wave.com's seller_sites row, never from the code (a non-default host proves it)
const siteByKey = vi.hoisted(() => vi.fn(async (_db: unknown, keyId: string) => (keyId === "aware-wave-com" ? { host: "shop.example.test" } : null)));
vi.mock("@/lib/payments/sites", async (importOriginal) => ({ ...(await importOriginal<object>()), findSiteByKeyId: siteByKey }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table === "organizations" ? { id: ORG, type: "client" } : null, error: null }) }),
      }),
    }),
  }),
}));

const { POST } = await import("./route");

const ctx = () => ({ params: Promise.resolve({ slug: "soulful" }) });
const post = (kind: string, role: string) =>
  new Request("http://localhost/api/ops/clients/soulful/member-transfer", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ops-user-kind": kind, "x-ops-claims-role": role, "x-ops-user-id": "staff-9" },
    body: JSON.stringify({ email: "New.Boss@Client.example", reason: "聯絡人離職" }),
  });

describe("member-transfer route", () => {
  beforeEach(() => {
    rpc.mockClear();
    audit.mockClear();
  });

  it.each([["operator"], ["viewer"]])("staff %s → 403, nothing issued", async (role) => {
    const res = await POST(post("staff", role), ctx());
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("a client identity → 403, nothing issued", async () => {
    const res = await POST(post("client", "admin"), ctx());
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("owner/admin staff → a transfer invite; the code is answered once and never audited", async () => {
    const res = await POST(post("staff", "admin"), ctx());
    const body = (await res.json()) as { ok: boolean; code: string; email: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.email).toBe("new.boss@client.example");
    expect(body.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rpc).toHaveBeenCalledWith("member_transfer_issue", expect.objectContaining({
      p_organization_id: ORG, p_email: "new.boss@client.example", p_reason: "聯絡人離職", p_actor_role: "admin", p_created_by: "staff-9",
    }));
    expect(audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.mock.calls[0])).not.toContain(body.code);
  });

  it("the answer carries the landing link on the site row's host: https://<host>/?aw_invite=<code>", async () => {
    const res = await POST(post("staff", "owner"), ctx());
    const body = (await res.json()) as { code: string; url: string | null };
    expect(body.url).toBe(`https://shop.example.test/?aw_invite=${body.code}`);
    siteByKey.mockResolvedValueOnce(null);   // no site row: the code alone, never a guessed host
    const bare = (await (await POST(post("staff", "owner"), ctx())).json()) as { code: string; url: string | null };
    expect(bare.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bare.url).toBeNull();
  });
});
