// lib/kb/folders.ts — nested-folder CRUD (K2h, migration 0085).
//
// The one safety-relevant piece is moveFolder's cycle guard: Postgres has no CHECK constraint that
// can express "not an ancestor of itself" over a self-referencing FK, so a folder moved into its own
// descendant would otherwise silently detach the whole subtree from the tree (cs_folder_descendants'
// recursive CTE would loop forever walking parent_id pointers that lead back to where it started).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({ queue: [] as Resp[], rpcQueue: [] as Resp[], rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }> }));

function nextResp(): Resp {
  return state.queue.shift() ?? { data: null, error: null };
}

// One generic chainable object serves every call shape folders.ts uses (select/insert/update/delete
// × eq × order/maybeSingle/single, or awaited directly) — each terminal step (or a direct `await` on
// the chain itself, via `.then`) pulls the next canned response off `state.queue`, in the exact order
// the function under test issues its calls. This mirrors kb-archive.test.ts's fake-client pattern.
function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    maybeSingle: () => Promise.resolve(nextResp()),
    single: () => Promise.resolve(nextResp()),
    then: (resolve: (v: Resp) => void, reject?: (e: unknown) => void) => Promise.resolve(nextResp()).then(resolve, reject),
  };
  return chain;
}

let client: { from: () => Record<string, unknown>; rpc: (fn: string, args: Record<string, unknown>) => Promise<Resp> } | null;
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => client }));

const { listFolders, createFolder, renameFolder, moveFolder, deleteFolder, moveSourceToFolder, folderDescendantIds } = await import("@/lib/kb/folders");

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.queue = [];
  state.rpcQueue = [];
  state.rpcCalls = [];
  client = {
    from: () => makeChain(),
    rpc: (fn, args) => { state.rpcCalls.push({ fn, args }); return Promise.resolve(state.rpcQueue.shift() ?? { data: null, error: null }); },
  };
});

describe("listFolders", () => {
  it("maps rows to camelCase parentId", async () => {
    state.queue.push({ data: [{ id: "f1", name: "A", parent_id: null }, { id: "f2", name: "B", parent_id: "f1" }], error: null });
    expect(await listFolders(ORG)).toEqual([{ id: "f1", name: "A", parentId: null }, { id: "f2", name: "B", parentId: "f1" }]);
  });
  it("degrades to an empty list with no Supabase client", async () => {
    client = null;
    expect(await listFolders(ORG)).toEqual([]);
  });
});

describe("createFolder", () => {
  it("rejects an empty/whitespace name before ever touching the DB", async () => {
    expect(await createFolder(ORG, "   ", null)).toEqual({ ok: false, error: "name_required" });
    expect(state.queue).toHaveLength(0); // nothing was consumed — no DB call happened
  });
  it("refuses when the given parent doesn't exist in this org", async () => {
    state.queue.push({ data: null, error: null }); // parent existence check -> not found
    expect(await createFolder(ORG, "Sub", "missing-parent")).toEqual({ ok: false, error: "parent_not_found" });
  });
  it("creates a root folder and returns its id", async () => {
    state.queue.push({ data: { id: "new1" }, error: null }); // insert(...).select("id").single()
    expect(await createFolder(ORG, "Top", null)).toEqual({ ok: true, id: "new1" });
  });
  it("maps a unique-violation (23505) to duplicate_name, not a bare write_failed", async () => {
    state.queue.push({ data: null, error: { code: "23505" } });
    expect(await createFolder(ORG, "Dup", null)).toEqual({ ok: false, error: "duplicate_name" });
  });
});

describe("renameFolder", () => {
  it("rejects an empty name", async () => {
    expect(await renameFolder(ORG, "f1", "")).toEqual({ ok: false, error: "name_required" });
  });
  it("reports not_found when the WHERE clause matched nothing (stale/foreign id)", async () => {
    state.queue.push({ data: [], error: null });
    expect(await renameFolder(ORG, "gone", "New")).toEqual({ ok: false, error: "not_found" });
  });
  it("renames successfully", async () => {
    state.queue.push({ data: [{ id: "f1" }], error: null });
    expect(await renameFolder(ORG, "f1", "New name")).toEqual({ ok: true });
  });
});

describe("moveFolder — delegates atomically to the cs_folder_move RPC (critic finding 2026-09-17: a prior JS-orchestrated check-then-write had a TOCTOU window where two concurrent moves could each pass a cycle check before either write landed)", () => {
  it("passes through a successful move", async () => {
    state.rpcQueue.push({ data: "ok", error: null });
    expect(await moveFolder(ORG, "f1", "f9")).toEqual({ ok: true });
  });
  it("maps every RPC-reported refusal to its typed FolderError", async () => {
    state.rpcQueue.push({ data: "would_create_cycle", error: null });
    expect(await moveFolder(ORG, "f1", "f2")).toEqual({ ok: false, error: "would_create_cycle" });
    state.rpcQueue.push({ data: "not_found", error: null });
    expect(await moveFolder(ORG, "gone", "f9")).toEqual({ ok: false, error: "not_found" });
    state.rpcQueue.push({ data: "parent_not_found", error: null });
    expect(await moveFolder(ORG, "f1", "gone")).toEqual({ ok: false, error: "parent_not_found" });
  });
  it("treats a network/RPC-call error as write_failed", async () => {
    state.rpcQueue.push({ data: null, error: { message: "boom" } });
    expect(await moveFolder(ORG, "f1", "f9")).toEqual({ ok: false, error: "write_failed" });
  });
  it("treats an unrecognised RPC result as write_failed rather than silently reporting success", async () => {
    state.rpcQueue.push({ data: "something_new_the_client_does_not_know_about", error: null });
    expect(await moveFolder(ORG, "f1", "f9")).toEqual({ ok: false, error: "write_failed" });
  });
  it("passes null through for a move to root, not omitted or coerced to a string", async () => {
    state.rpcQueue.push({ data: "ok", error: null });
    await moveFolder(ORG, "f1", null);
    expect(state.rpcCalls[0]).toEqual({ fn: "cs_folder_move", args: { p_organization_id: ORG, p_folder_id: "f1", p_new_parent_id: null } });
  });
});

describe("deleteFolder", () => {
  it("returns true when a row was actually deleted", async () => {
    state.queue.push({ data: [{ id: "f1" }], error: null });
    expect(await deleteFolder(ORG, "f1")).toBe(true);
  });
  it("returns false for a foreign/stale id (WHERE matched nothing)", async () => {
    state.queue.push({ data: [], error: null });
    expect(await deleteFolder(ORG, "gone")).toBe(false);
  });
});

describe("moveSourceToFolder", () => {
  it("unfiles a document (folderId null) without checking any folder's existence", async () => {
    state.queue.push({ data: [{ id: "s1" }], error: null }); // update(...).select("id")
    expect(await moveSourceToFolder(ORG, "s1", null)).toEqual({ ok: true });
  });
  it("refuses a folderId that doesn't exist in this org", async () => {
    state.queue.push({ data: null, error: null }); // folder existence check -> not found
    expect(await moveSourceToFolder(ORG, "s1", "gone")).toEqual({ ok: false, error: "parent_not_found" });
  });
  it("files a document into a real folder", async () => {
    state.queue.push({ data: { id: "f1" }, error: null }); // folder existence check
    state.queue.push({ data: [{ id: "s1" }], error: null }); // update(...).select("id")
    expect(await moveSourceToFolder(ORG, "s1", "f1")).toEqual({ ok: true });
  });
});

describe("folderDescendantIds", () => {
  it("returns ids from the RPC, folder itself included", async () => {
    state.rpcQueue.push({ data: [{ id: "f1" }, { id: "f2" }], error: null });
    expect(await folderDescendantIds(ORG, "f1")).toEqual(["f1", "f2"]);
  });
  it("degrades to just the folder itself on an RPC error — never an empty scope that would silently widen a caller's filter", async () => {
    state.rpcQueue.push({ data: null, error: { message: "boom" } });
    expect(await folderDescendantIds(ORG, "f1")).toEqual(["f1"]);
  });
  it("degrades to just the folder itself on a successful-but-empty RPC result too (stale/foreign id) — not relying on a caller's downstream .in([]) behaviour to fail safe", async () => {
    state.rpcQueue.push({ data: [], error: null });
    expect(await folderDescendantIds(ORG, "gone")).toEqual(["gone"]);
  });
});
