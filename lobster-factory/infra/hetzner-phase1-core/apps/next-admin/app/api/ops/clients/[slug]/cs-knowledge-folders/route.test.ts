// GET/POST/PATCH/DELETE /api/ops/clients/[slug]/cs-knowledge-folders (K2h).

import { describe, expect, it, vi, beforeEach } from "vitest";

const kb = vi.hoisted(() => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));
vi.mock("@/lib/kb", () => kb);

const ORG = "11111111-1111-4111-8111-111111111111";
const sb = vi.hoisted(() => ({
  from: vi.fn((_table: string) => ({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: ORG }, error: null }) }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { GET, POST, PATCH, DELETE } = await import("./route");

function ctx() {
  return { params: Promise.resolve({ slug: "acme" }) };
}
function req(method: string, opts: { role?: string; body?: unknown } = {}): Request {
  return new Request(`http://localhost/api/ops/clients/acme/cs-knowledge-folders`, {
    method,
    headers: { "content-type": "application/json", ...(opts.role ? { "x-ops-claims-role": opts.role } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET", () => {
  it("returns the flat folder list — viewer+ may read", async () => {
    kb.listFolders.mockResolvedValue([{ id: "f1", name: "A", parentId: null }]);
    const res = await GET(req("GET"), ctx());
    expect(await res.json()).toEqual({ ok: true, folders: [{ id: "f1", name: "A", parentId: null }] });
  });
});

describe("POST", () => {
  it("creates a folder", async () => {
    kb.createFolder.mockResolvedValue({ ok: true, id: "new1" });
    const res = await POST(req("POST", { role: "admin", body: { name: "Docs", parentId: "f1" } }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "new1" });
    expect(kb.createFolder).toHaveBeenCalledWith(ORG, "Docs", "f1");
  });
  it("treats an omitted parentId as root-level (null), not undefined", async () => {
    kb.createFolder.mockResolvedValue({ ok: true, id: "new1" });
    await POST(req("POST", { role: "admin", body: { name: "Docs" } }), ctx());
    expect(kb.createFolder).toHaveBeenCalledWith(ORG, "Docs", null);
  });
  it("surfaces a duplicate-name refusal with its hint", async () => {
    kb.createFolder.mockResolvedValue({ ok: false, error: "duplicate_name" });
    const res = await POST(req("POST", { role: "admin", body: { name: "Docs" } }), ctx());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "duplicate_name" });
    expect(body.hint).toBeTruthy();
  });
  it("rejects a viewer role — write gate, same as cs-knowledge", async () => {
    const res = await POST(req("POST", { role: "viewer", body: { name: "Docs" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.createFolder).not.toHaveBeenCalled();
  });
});

describe("PATCH", () => {
  it("renames", async () => {
    kb.renameFolder.mockResolvedValue({ ok: true });
    const res = await PATCH(req("PATCH", { role: "admin", body: { folderId: "f1", action: "rename", name: "New" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.renameFolder).toHaveBeenCalledWith(ORG, "f1", "New");
  });
  it("moves", async () => {
    kb.moveFolder.mockResolvedValue({ ok: true });
    const res = await PATCH(req("PATCH", { role: "admin", body: { folderId: "f1", action: "move", parentId: "f2" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.moveFolder).toHaveBeenCalledWith(ORG, "f1", "f2");
  });
  it("surfaces a would_create_cycle refusal as 400, not a generic failure", async () => {
    kb.moveFolder.mockResolvedValue({ ok: false, error: "would_create_cycle" });
    const res = await PATCH(req("PATCH", { role: "admin", body: { folderId: "f1", action: "move", parentId: "f2" } }), ctx());
    expect(res.status).toBe(400);
  });
  it("rejects a body with no recognised action", async () => {
    const res = await PATCH(req("PATCH", { role: "admin", body: { folderId: "f1", action: "delete_forever" } }), ctx());
    expect(res.status).toBe(400);
    expect(kb.renameFolder).not.toHaveBeenCalled();
    expect(kb.moveFolder).not.toHaveBeenCalled();
  });
  it("rejects a viewer role", async () => {
    const res = await PATCH(req("PATCH", { role: "viewer", body: { folderId: "f1", action: "rename", name: "New" } }), ctx());
    expect(res.status).toBe(403);
  });
});

describe("DELETE", () => {
  it("deletes", async () => {
    kb.deleteFolder.mockResolvedValue(true);
    const res = await DELETE(req("DELETE", { role: "admin", body: { folderId: "f1" } }), ctx());
    expect(res.status).toBe(200);
    expect(kb.deleteFolder).toHaveBeenCalledWith(ORG, "f1");
  });
  it("reports failure as non-200", async () => {
    kb.deleteFolder.mockResolvedValue(false);
    const res = await DELETE(req("DELETE", { role: "admin", body: { folderId: "f1" } }), ctx());
    expect(res.status).toBe(409);
  });
  it("rejects a viewer role", async () => {
    const res = await DELETE(req("DELETE", { role: "viewer", body: { folderId: "f1" } }), ctx());
    expect(res.status).toBe(403);
    expect(kb.deleteFolder).not.toHaveBeenCalled();
  });
});
