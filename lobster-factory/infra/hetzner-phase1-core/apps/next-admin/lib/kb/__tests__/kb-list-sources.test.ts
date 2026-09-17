// listKnowledgeSources pagination + search + folder filter (K2h). listArchivedKnowledgeSources
// shares the exact same query-building logic in db.ts; kb-archive.test.ts already covers its own
// camelCase mapping and empty-client degradation, so this file focuses on the filter/paging behaviour
// itself rather than duplicating that coverage for both functions.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Resp = { data: unknown; error: unknown; count?: number };

const state = vi.hoisted(() => ({
  sourcesResp: { data: [], error: null, count: 0 } as Resp,
  chunksResp: { data: [], error: null } as Resp,
  rpcResp: { data: [], error: null } as Resp,
  calls: [] as Array<Record<string, unknown>>,
}));

function fakeClient() {
  return {
    from(table: string) {
      if (table === "cs_knowledge_sources") {
        const rec: Record<string, unknown> = { table, eqs: [] as Array<[string, unknown]> };
        state.calls.push(rec);
        const chain = {
          select: (_cols?: string, _opts?: unknown) => chain,
          eq: (k: string, v: unknown) => { (rec.eqs as Array<[string, unknown]>).push([k, v]); return chain; },
          neq: (k: string, v: unknown) => { (rec.eqs as Array<[string, unknown]>).push([`neq:${k}`, v]); return chain; },
          ilike: (k: string, v: unknown) => { rec.ilike = [k, v]; return chain; },
          in: (k: string, v: unknown) => { rec.in = [k, v]; return chain; },
          is: (k: string, v: unknown) => { rec.is = [k, v]; return chain; },
          order: () => ({ range: (from: number, to: number) => { rec.range = [from, to]; return Promise.resolve(state.sourcesResp); } }),
        };
        return chain;
      }
      if (table === "cs_knowledge_chunks") {
        const rec: Record<string, unknown> = { table, eqs: [] as Array<[string, unknown]> };
        state.calls.push(rec);
        const chain = {
          select: (_cols?: string) => chain,
          eq: (k: string, v: unknown) => { (rec.eqs as Array<[string, unknown]>).push([k, v]); return chain; },
          in: (k: string, v: unknown) => { rec.in = [k, v]; return Promise.resolve(state.chunksResp); },
        };
        return chain;
      }
      throw new Error(`fake client asked for unexpected table: ${table}`);
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ rpc: fn, args });
      return Promise.resolve(state.rpcResp);
    },
  };
}

let client: ReturnType<typeof fakeClient> | null;
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => client }));

const { listKnowledgeSources, KB_UNFILED_FOLDER_ID } = await import("@/lib/kb/db");

const ORG = "11111111-1111-4111-8111-111111111111";
const ROW = { id: "s1", title: "退貨政策", kind: "doc", is_sensitive: false, status: "active", source_version: 1, doc_family_id: "f1", canonical_url: null, folder_id: "fold1" };

beforeEach(() => {
  state.calls = [];
  state.sourcesResp = { data: [ROW], error: null, count: 1 };
  state.chunksResp = { data: [], error: null };
  state.rpcResp = { data: [], error: null };
  client = fakeClient();
});

describe("listKnowledgeSources — pagination", () => {
  it("defaults to page 1 of 50, mapping folder_id to camelCase", async () => {
    const result = await listKnowledgeSources(ORG);
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.range).toEqual([0, 49]);
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    expect(result.items[0]).toMatchObject({ id: "s1", folderId: "fold1" });
  });

  it("computes range from an explicit page/pageSize", async () => {
    await listKnowledgeSources(ORG, { page: 3, pageSize: 20 });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.range).toEqual([40, 59]);
  });

  it("caps pageSize at 200 so a crafted request can't force an unpaginated scan", async () => {
    await listKnowledgeSources(ORG, { pageSize: 999999 });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.range).toEqual([0, 199]);
  });

  it("floors page at 1 for a zero/negative input", async () => {
    await listKnowledgeSources(ORG, { page: -5 });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.range).toEqual([0, 49]);
  });

  it("degrades to an empty first page with no Supabase client", async () => {
    client = null;
    expect(await listKnowledgeSources(ORG)).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });
});

describe("listKnowledgeSources — search", () => {
  it("applies an ILIKE title filter when search is given", async () => {
    await listKnowledgeSources(ORG, { search: "退貨" });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.ilike).toEqual(["title", "%退貨%"]);
  });

  it("does not apply a filter for whitespace-only search", async () => {
    await listKnowledgeSources(ORG, { search: "   " });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.ilike).toBeUndefined();
  });
});

describe("listKnowledgeSources — folder filter", () => {
  it("expands a real folder id to itself + its descendants via the RPC (cross-level filtering)", async () => {
    state.rpcResp = { data: [{ id: "fold1" }, { id: "fold2" }], error: null };
    await listKnowledgeSources(ORG, { folderId: "fold1" });
    const rpcCall = state.calls.find((c) => c.rpc === "cs_folder_descendants")!;
    expect(rpcCall.args).toEqual({ p_organization_id: ORG, p_folder_id: "fold1" });
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.in).toEqual(["folder_id", ["fold1", "fold2"]]);
  });

  it("the unfiled sentinel filters to folder_id IS NULL instead of calling the descendants RPC", async () => {
    await listKnowledgeSources(ORG, { folderId: KB_UNFILED_FOLDER_ID });
    expect(state.calls.some((c) => c.rpc === "cs_folder_descendants")).toBe(false);
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.is).toEqual(["folder_id", null]);
  });

  it("no folderId at all applies neither filter", async () => {
    await listKnowledgeSources(ORG);
    const sourcesCall = state.calls.find((c) => c.table === "cs_knowledge_sources")!;
    expect(sourcesCall.in).toBeUndefined();
    expect(sourcesCall.is).toBeUndefined();
  });
});

describe("listKnowledgeSources — chunk counts", () => {
  it("counts chunks per source id from the second query", async () => {
    state.sourcesResp = { data: [ROW, { ...ROW, id: "s2" }], error: null, count: 2 };
    state.chunksResp = { data: [{ source_id: "s1" }, { source_id: "s1" }, { source_id: "s2" }], error: null };
    const result = await listKnowledgeSources(ORG);
    expect(result.items.find((r) => r.id === "s1")?.chunks).toBe(2);
    expect(result.items.find((r) => r.id === "s2")?.chunks).toBe(1);
  });

  it("skips the chunk-count query entirely when the page is empty", async () => {
    state.sourcesResp = { data: [], error: null, count: 0 };
    await listKnowledgeSources(ORG);
    expect(state.calls.some((c) => c.table === "cs_knowledge_chunks")).toBe(false);
  });
});
