// video-unify-plan-20261116 §4 U3: 腳本's 送社群 in the video workbench saves through the social tool's own check and
// save (lib/social/posts.ts createDraftPost). Another organization's brand is refused before anything is saved.
// A customer must also hold social (Codex 2026-11-16: the video door does not ask it). The store and the entitlement
// read are mocked; authz and door-access are real.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ savePost: vi.fn(), memberRoles: vi.fn() }));
vi.mock("@/lib/social/store", async (orig) => ({ ...(await orig<typeof import("@/lib/social/store")>()), ...store }));
const holds = vi.hoisted(() => ({ holdsProduct: vi.fn() }));
vi.mock("@/lib/entitlements/door-holds", () => holds);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function post(who: { client: string; user?: string } | { role: string }, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if ("client" in who) Object.assign(headers, { "x-ops-user-kind": "client", "x-ops-org-id": who.client, "x-ops-claims-role": "viewer", ...(who.user ? { "x-ops-user-id": who.user } : {}) });
  else Object.assign(headers, { "x-ops-user-kind": "staff", "x-ops-claims-role": who.role });
  return new Request("http://localhost/api/video/social-drafts/text", { method: "POST", headers, body: JSON.stringify(body) });
}

beforeEach(async () => {
  (await import("@/lib/portal/door-access")).forgetDoorAccess();
  store.savePost.mockReset();
  store.savePost.mockResolvedValue({ id: "p1", version: 1 });
  store.memberRoles.mockResolvedValue(new Map());
  holds.holdsProduct.mockResolvedValue(true);
});

describe("POST /api/video/social-drafts/text", () => {
  it("another organization's brand is refused and nothing is saved", async () => {
    const { POST } = await import("../social-drafts/text/route");
    const res = await POST(post({ client: A }, { organizationId: B, fields: { body: "腳本全文", notes: "ScriptForge：x" } }));
    expect(res.status).toBe(403);
    expect(store.savePost).not.toHaveBeenCalled();
  });

  it("a customer editor of the brand who does not hold social is refused and nothing is saved", async () => {
    const { POST } = await import("../social-drafts/text/route");
    store.memberRoles.mockResolvedValue(new Map([[A, "editor"]]));
    holds.holdsProduct.mockImplementation(async ({ productKey }: { productKey: string }) => productKey !== "social");
    const res = await POST(post({ client: A, user: "u1" }, { organizationId: A, fields: { body: "腳本全文", notes: "x" } }));
    expect(res.status).toBe(403);
    expect(store.savePost).not.toHaveBeenCalled();
    // the same editor once the account holds social: saved (so the refusal above was the social check)
    (await import("@/lib/portal/door-access")).forgetDoorAccess();
    holds.holdsProduct.mockResolvedValue(true);
    expect((await POST(post({ client: A, user: "u1" }, { organizationId: A, fields: { body: "腳本全文", notes: "x" } }))).status).toBe(200);
    expect(store.savePost).toHaveBeenCalledTimes(1);
  });

  it("a caller who may write for the brand gets one text-only draft, the social tool's save", async () => {
    const { POST } = await import("../social-drafts/text/route");
    const res = await POST(post({ role: "operator" }, { organizationId: A, fields: { body: "腳本全文", notes: "ScriptForge：x" }, targets: [{ account_id: B }] }));
    expect(res.status).toBe(200);
    expect(store.savePost).toHaveBeenCalledWith(A, null, null, { body: "腳本全文", notes: "ScriptForge：x" }, null, null, "ops:operator", { comments: null, tags: null });
  });
});
