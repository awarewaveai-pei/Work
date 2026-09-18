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

const {
  listFolders,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  moveSourceToFolder,
  folderDescendantIds,
  findOrCreateFolderByName,
  getFolder,
  getFolderCognitiveOsProjectId,
  setFolderCognitiveOsProjectId,
} = await import("@/lib/kb/folders");

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

describe("findOrCreateFolderByName", () => {
  // lib/collect/sinks/kb.ts's auto-foldering (operator, 2026-09-18) calls this on every doc from a
  // search-driven run — it must reuse the SAME folder across a whole run, not fight the unique
  // constraint every time, hence the create-then-fallback shape under test here.
  it("creates and returns the new folder when the name is free", async () => {
    state.queue.push({ data: { id: "new1" }, error: null }); // createFolder's own insert
    expect(await findOrCreateFolderByName(ORG, "art therapy_202609180304", null)).toEqual({ ok: true, id: "new1" });
  });

  it("on a name collision, resolves to the EXISTING folder's id instead of failing", async () => {
    state.queue.push({ data: null, error: { code: "23505" } }); // createFolder's insert -> duplicate_name
    state.queue.push({ data: [{ id: "existing1", name: "art therapy_202609180304", parent_id: null }], error: null }); // listFolders fallback
    expect(await findOrCreateFolderByName(ORG, "art therapy_202609180304", null)).toEqual({ ok: true, id: "existing1" });
  });

  it("a collision whose row is not visible on the fallback read reports write_failed, not a silent miss", async () => {
    state.queue.push({ data: null, error: { code: "23505" } });
    state.queue.push({ data: [], error: null }); // fallback listFolders finds nothing (RLS/replica lag)
    expect(await findOrCreateFolderByName(ORG, "art therapy_202609180304", null)).toEqual({ ok: false, error: "write_failed" });
  });

  it("a non-duplicate failure (e.g. bad parentId) is returned as-is, no fallback lookup attempted", async () => {
    state.queue.push({ data: null, error: null }); // createFolder's own parent-existence check -> not found
    expect(await findOrCreateFolderByName(ORG, "x", "missing-parent")).toEqual({ ok: false, error: "parent_not_found" });
    expect(state.queue).toHaveLength(0); // no listFolders call was made
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

describe("getFolder", () => {
  it("returns the folder scoped to organizationId", async () => {
    state.queue.push({ data: { id: "f1", name: "Research", parent_id: null }, error: null });
    expect(await getFolder(ORG, "f1")).toEqual({ id: "f1", name: "Research", parentId: null });
  });
  it("returns null for a folder that does not exist (or belongs to another organization)", async () => {
    state.queue.push({ data: null, error: null });
    expect(await getFolder(ORG, "gone")).toBeNull();
  });
});

describe("getFolderCognitiveOsProjectId / setFolderCognitiveOsProjectId (migration 0089)", () => {
  it("getFolderCognitiveOsProjectId returns the stored id when present", async () => {
    state.queue.push({ data: { cognitive_os_project_id: "proj-1" }, error: null });
    expect(await getFolderCognitiveOsProjectId(ORG, "f1")).toBe("proj-1");
  });
  it("getFolderCognitiveOsProjectId returns null when never sent (column is genuinely null)", async () => {
    state.queue.push({ data: { cognitive_os_project_id: null }, error: null });
    expect(await getFolderCognitiveOsProjectId(ORG, "f1")).toBeNull();
  });
  it("getFolderCognitiveOsProjectId returns null for a folder that does not exist", async () => {
    state.queue.push({ data: null, error: null });
    expect(await getFolderCognitiveOsProjectId(ORG, "gone")).toBeNull();
  });

  // db-expert review, 2026-09-18: this is the third occurrence in this codebase of a documented bug
  // class (lib/kb/db.ts's markSourceSentToCognitiveOs/markSourceSentToHci comments) — Supabase/
  // PostgREST returns error:null even when an UPDATE's WHERE clause matches zero rows, so a
  // void-returning write would make a stale/foreign folderId fail silently.
  it("setFolderCognitiveOsProjectId returns true when the update actually matched a row", async () => {
    state.queue.push({ data: [{ id: "f1" }], error: null });
    expect(await setFolderCognitiveOsProjectId(ORG, "f1", "proj-1")).toBe(true);
  });
  it("setFolderCognitiveOsProjectId returns false when the update matches zero rows (stale/foreign folderId) — error is still null, only the row-count check catches this", async () => {
    state.queue.push({ data: [], error: null });
    expect(await setFolderCognitiveOsProjectId(ORG, "gone", "proj-1")).toBe(false);
  });
  it("setFolderCognitiveOsProjectId returns false on a real Postgres error", async () => {
    state.queue.push({ data: null, error: { message: "boom" } });
    expect(await setFolderCognitiveOsProjectId(ORG, "f1", "proj-1")).toBe(false);
  });
});
