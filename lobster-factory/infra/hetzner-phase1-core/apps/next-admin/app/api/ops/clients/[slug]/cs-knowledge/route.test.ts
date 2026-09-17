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
  getSourceDetail: vi.fn(),
  listVersionsForFamily: vi.fn(),
  moveSourceToFolder: vi.fn(),
  setKeywordMode: vi.fn(),
}));
vi.mock("@/lib/kb", () => kb);

const ORG = "11111111-1111-4111-8111-111111111111";
const sb = vi.hoisted(() => ({
  // Parameter typed explicitly: an inferred `() => {...}` gives vi.fn() a zero-arg signature, which
  // makes `sb.from.mock.calls` a `[][]` (empty-tuple) type — `c[0]` on such a call then fails to
  // typecheck even though the mock is actually invoked with one argument everywhere it's used.
  from: vi.fn((_table: string) => ({
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
  it("defaults to the active list, page 1 (K2h pagination)", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "s1" }], total: 1, page: 1, pageSize: 50 });
    const res = await GET(req("GET"), ctx());
    expect(await res.json()).toEqual({ ok: true, sources: [{ id: "s1" }], total: 1, page: 1, pageSize: 50 });
    expect(kb.listArchivedKnowledgeSources).not.toHaveBeenCalled();
  });

  it("?status=archived reads the archived view instead", async () => {
    kb.listArchivedKnowledgeSources.mockResolvedValue({ items: [{ id: "s2" }], total: 1, page: 1, pageSize: 50 });
    const res = await GET(req("GET", { qs: "?status=archived" }), ctx());
    expect(await res.json()).toEqual({ ok: true, sources: [{ id: "s2" }], total: 1, page: 1, pageSize: 50 });
    expect(kb.listKnowledgeSources).not.toHaveBeenCalled();
  });

  it("passes search/folderId/page/pageSize query params through to the list function (K2h)", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20 });
    await GET(req("GET", { qs: "?search=退貨&folderId=f1&page=2&pageSize=20" }), ctx());
    expect(kb.listKnowledgeSources).toHaveBeenCalledWith(ORG, { search: "退貨", folderId: "f1", page: 2, pageSize: 20 });
  });

  it("?sourceId= returns the detail + version history instead of the list (K2g)", async () => {
    kb.getSourceDetail.mockResolvedValue({ id: "s1", docFamilyId: "f1", body: "全文" });
    kb.listVersionsForFamily.mockResolvedValue([{ id: "s1", version: 1, status: "active", createdAt: "2026-09-17T00:00:00Z" }]);
    const res = await GET(req("GET", { qs: "?sourceId=s1" }), ctx());
    expect(await res.json()).toEqual({
      ok: true,
      detail: { id: "s1", docFamilyId: "f1", body: "全文" },
      versions: [{ id: "s1", version: 1, status: "active", createdAt: "2026-09-17T00:00:00Z" }],
    });
    expect(kb.listVersionsForFamily).toHaveBeenCalledWith(ORG, "f1");
    expect(kb.listKnowledgeSources).not.toHaveBeenCalled();
  });

  it("?sourceId= for an unknown/foreign id returns 404, not an empty detail", async () => {
    kb.getSourceDetail.mockResolvedValue(null);
    const res = await GET(req("GET", { qs: "?sourceId=nope" }), ctx());
    expect(res.status).toBe(404);
    expect(kb.listVersionsForFamily).not.toHaveBeenCalled();
  });

  it("audits a sensitive document's detail view (critic finding 2026-09-17)", async () => {
    kb.getSourceDetail.mockResolvedValue({ id: "s1", docFamilyId: "f1", isSensitive: true });
    kb.listVersionsForFamily.mockResolvedValue([]);
    await GET(req("GET", { qs: "?sourceId=s1" }), ctx());
    const auditCall = sb.from.mock.calls.find((c) => c[0] === "ops_audit_events");
    expect(auditCall, "expected an insert into ops_audit_events").toBeTruthy();
  });

  it("does not audit an ordinary (non-sensitive) document view — noise, not signal", async () => {
    kb.getSourceDetail.mockResolvedValue({ id: "s1", docFamilyId: "f1", isSensitive: false });
    kb.listVersionsForFamily.mockResolvedValue([]);
    await GET(req("GET", { qs: "?sourceId=s1" }), ctx());
    const auditCall = sb.from.mock.calls.find((c) => c[0] === "ops_audit_events");
    expect(auditCall).toBeUndefined();
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

  it("files a document into a folder (K2h)", async () => {
    kb.moveSourceToFolder.mockResolvedValue({ ok: true });
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "move_folder", folderId: "f1" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.moveSourceToFolder).toHaveBeenCalledWith(ORG, "s1", "f1");
  });

  it("passes an explicit null folderId through to unfile a document, not treating it as missing", async () => {
    kb.moveSourceToFolder.mockResolvedValue({ ok: true });
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "move_folder", folderId: null } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.moveSourceToFolder).toHaveBeenCalledWith(ORG, "s1", null);
  });

  it("rejects move_folder with folderId entirely missing from the body", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "move_folder" } }), ctx());
    expect(res.status).toBe(400);
    expect(kb.moveSourceToFolder).not.toHaveBeenCalled();
  });

  it("surfaces a move_folder failure with its hint, not a bare 200", async () => {
    kb.moveSourceToFolder.mockResolvedValue({ ok: false, error: "parent_not_found" });
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "move_folder", folderId: "gone" } }), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "parent_not_found" });
    expect(body.hint).toBeTruthy();
  });

  it("rejects move_folder from a viewer role — same write gate as every other action here", async () => {
    const res = await PATCH(req("PATCH", { role: "viewer", body: { sourceId: "s1", action: "move_folder", folderId: "f1" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.moveSourceToFolder).not.toHaveBeenCalled();
  });

  it("sets a document's keyword-mode override (K2i)", async () => {
    kb.setKeywordMode.mockResolvedValue(true);
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "set_keyword_mode", mode: "exact" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.setKeywordMode).toHaveBeenCalledWith(ORG, "s1", "exact");
  });

  it("rejects set_keyword_mode with an invalid mode value", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "s1", action: "set_keyword_mode", mode: "bogus" } }), ctx());
    expect(res.status).toBe(400);
    expect(kb.setKeywordMode).not.toHaveBeenCalled();
  });

  it("reports a set_keyword_mode failure (stale/foreign sourceId) as 404, not a bare 200", async () => {
    kb.setKeywordMode.mockResolvedValue(false);
    const res = await PATCH(req("PATCH", { role: "admin", body: { sourceId: "gone", action: "set_keyword_mode", mode: "fuzzy" } }), ctx());
    expect(res.status).toBe(404);
  });

  it("rejects set_keyword_mode from a viewer role", async () => {
    const res = await PATCH(req("PATCH", { role: "viewer", body: { sourceId: "s1", action: "set_keyword_mode", mode: "exact" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.setKeywordMode).not.toHaveBeenCalled();
  });
});
