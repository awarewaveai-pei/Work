// PATCH (archive/restore) and the ?status=archived list — the two things operator decision
// 2026-09-12 added. GET/POST/DELETE's existing behaviour is left alone here (no prior test file
// existed for this route at all; adding coverage for everything would be its own, separate task).

import { describe, expect, it, vi, beforeEach } from "vitest";

const kb = vi.hoisted(() => ({
  listKnowledgeSources: vi.fn(),
  listArchivedKnowledgeSources: vi.fn(),
  archiveKnowledgeSource: vi.fn(),
  restoreKnowledgeSource: vi.fn(),
  rebindManualDocumentUrl: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  ingestKnowledge: vi.fn(),
}));
vi.mock("@/lib/kb", () => kb);

const ORG = "11111111-1111-4111-8111-111111111111";
const sb = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: ORG }, error: null }) }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { GET, PATCH } = await import("./route");

function ctx() {
  return { params: Promise.resolve({ slug: "acme" }) };
}
function req(method: string, opts: { role?: string; body?: unknown; qs?: string } = {}): Request {
  return new Request(`http://localhost/api/ops/clients/acme/cs-knowledge${opts.qs ?? ""}`, {
    method,
    headers: { "content-type": "application/json", ...(opts.role ? { "x-ops-claims-role": opts.role } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/ops/clients/[slug]/cs-knowledge", () => {
  it("defaults to the active list", async () => {
    kb.listKnowledgeSources.mockResolvedValue([{ id: "s1" }]);
    const res = await GET(req("GET"), ctx());
    expect(await res.json()).toEqual({ ok: true, sources: [{ id: "s1" }] });
    expect(kb.listArchivedKnowledgeSources).not.toHaveBeenCalled();
  });

  it("?status=archived reads the archived view instead", async () => {
    kb.listArchivedKnowledgeSources.mockResolvedValue([{ id: "s2" }]);
    const res = await GET(req("GET", { qs: "?status=archived" }), ctx());
    expect(await res.json()).toEqual({ ok: true, sources: [{ id: "s2" }] });
    expect(kb.listKnowledgeSources).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/ops/clients/[slug]/cs-knowledge", () => {
  it("rejects a viewer/operator role — archive/restore is owner/admin only, same gate as delete", async () => {
    const res = await PATCH(req("PATCH", { role: "operator", body: { sourceId: "s1", action: "archive" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.archiveKnowledgeSource).not.toHaveBeenCalled();
  });

  it("rejects a body with no recognised action instead of silently doing nothing", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "delete_forever" } }), ctx());
    expect(res.status).toBe(400);
    expect(kb.archiveKnowledgeSource).not.toHaveBeenCalled();
    expect(kb.restoreKnowledgeSource).not.toHaveBeenCalled();
  });

  it("archives", async () => {
    kb.archiveKnowledgeSource.mockResolvedValue(true);
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "archive" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.archiveKnowledgeSource).toHaveBeenCalledWith(ORG, "s1");
    expect(kb.restoreKnowledgeSource).not.toHaveBeenCalled();
  });

  it("restores", async () => {
    kb.restoreKnowledgeSource.mockResolvedValue(true);
    const res = await PATCH(req("PATCH", { role: "owner", body: { sourceId: "s1", action: "restore" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.restoreKnowledgeSource).toHaveBeenCalledWith(ORG, "s1");
  });

  it("reports failure as non-200 rather than a bare ok:true", async () => {
    kb.archiveKnowledgeSource.mockResolvedValue(false);
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "archive" } }), ctx());
    expect(res.status).toBe(409);
  });

  it("rebinds a manual document to a real URL", async () => {
    kb.rebindManualDocumentUrl.mockResolvedValue({ ok: true });
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "rebind", canonicalUrl: "https://client.example.com/faq/returns" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.rebindManualDocumentUrl).toHaveBeenCalledWith(ORG, "s1", "https://client.example.com/faq/returns");
  });

  it("rejects a rebind with no valid https URL, before ever calling the store", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "rebind", canonicalUrl: "not-a-url" } }), ctx());
    expect(res.status).toBe(400);
    expect(kb.rebindManualDocumentUrl).not.toHaveBeenCalled();
  });

  it("surfaces the store's specific refusal reason and a human-readable hint, not a bare failure", async () => {
    kb.rebindManualDocumentUrl.mockResolvedValue({ ok: false, error: "url_already_claimed" });
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "rebind", canonicalUrl: "https://client.example.com/faq/returns" } }), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "url_already_claimed" });
    expect(body.hint).toBeTruthy();
  });

  it("rejects rebind from a viewer/operator role — same write gate as every other action here", async () => {
    const res = await PATCH(req("PATCH", { role: "viewer", body: { sourceId: "s1", action: "rebind", canonicalUrl: "https://client.example.com/faq/returns" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.rebindManualDocumentUrl).not.toHaveBeenCalled();
  });
});
