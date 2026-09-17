// archiveKnowledgeSource / restoreKnowledgeSource / listArchivedKnowledgeSources (lib/kb/db.ts).
//
// The safety-relevant part is the WHERE guard: archive must only touch a currently-ACTIVE row and
// restore must only touch a currently-ARCHIVED one, or the two actions can race K1's own versioning
// (archiveOtherVersions) — resurrecting a row a newer version already superseded, or "archiving" a
// row that was already archived for an unrelated reason and silently no-op-ing the operator's click.
//
// Critic finding 2026-09-12 (Critical): restoreKnowledgeSource used to have NO check for an already-
// active sibling in the same document family — restoring a superseded version put two "active" rows
// in one family, and retrieval's `status='active'` predicate has no version-recency concept, so both
// would be served side by side with no error anywhere. Deterministically reproducible with one
// operator (upload -> re-upload same title -> open 已封存 -> restore the old one), not just a race.
// Also (Major/Minor): every write here now checks the actual affected-row COUNT via `.select("id")`,
// not just `!error` — Supabase/PostgREST returns error:null even when a WHERE clause matched zero
// rows, so a stale/foreign sourceId used to report success and log an audit event for nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; op: "select" | "update"; eqs: string[][]; patch?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  selectResponses: [] as Array<{ data: unknown; error: unknown }>,
  updateResponses: [] as Array<{ data: unknown; error: unknown }>,
  listResponse: { data: [{ id: "s1", title: "t", kind: "doc", is_sensitive: false, source_version: 1, doc_family_id: "f1", folder_id: null }], error: null, count: 1 } as { data: unknown; error: unknown; count?: number },
}));

function fakeClient() {
  return {
    from: (table: string) => ({
      select: () => {
        const call: Call = { table, op: "select", eqs: [] };
        state.calls.push(call);
        const chain = {
          eq: (k: string, v: unknown) => {
            call.eqs.push([k, String(v)]);
            return chain;
          },
          limit: () => chain,
          ilike: () => chain,
          in: () => chain,
          is: () => chain,
          // listArchivedKnowledgeSources chains .order(...).range(...) after the eq()s; the other
          // two functions in this file only ever call .maybeSingle() straight off eq() and never
          // reach this branch — same fake serves both shapes.
          order: () => ({ range: () => Promise.resolve(state.listResponse) }),
          maybeSingle: () => Promise.resolve(state.selectResponses.shift() ?? { data: null, error: null }),
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => {
        const call: Call = { table, op: "update", eqs: [], patch };
        state.calls.push(call);
        const chain = {
          eq: (k: string, v: unknown) => {
            call.eqs.push([k, String(v)]);
            return chain;
          },
          select: () => Promise.resolve(state.updateResponses.shift() ?? { data: [{ id: "s1" }], error: null }),
        };
        return chain;
      },
    }),
  };
}

let client: ReturnType<typeof fakeClient> | null;
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => client }));

const { archiveKnowledgeSource, restoreKnowledgeSource, listArchivedKnowledgeSources } = await import("@/lib/kb/db");

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.calls = [];
  state.selectResponses = [];
  state.updateResponses = [];
  client = fakeClient();
});

describe("archiveKnowledgeSource", () => {
  it("updates status to archived, guarded to only an ACTIVE row", async () => {
    const ok = await archiveKnowledgeSource(ORG, "s1");
    expect(ok).toBe(true);
    const update = state.calls.find((c) => c.op === "update")!;
    expect(update.patch).toMatchObject({ status: "archived" });
    expect(update.eqs).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["id", "s1"],
        ["status", "active"],
      ]),
    );
  });

  it("returns false when the WHERE clause matched nothing, not just when there was an error", async () => {
    state.updateResponses = [{ data: [], error: null }];
    expect(await archiveKnowledgeSource(ORG, "s1")).toBe(false);
  });

  it("returns false, not throw, on a write error", async () => {
    state.updateResponses = [{ data: null, error: { message: "boom" } }];
    expect(await archiveKnowledgeSource(ORG, "s1")).toBe(false);
  });

  it("degrades to false with no Supabase client", async () => {
    client = null;
    expect(await archiveKnowledgeSource(ORG, "s1")).toBe(false);
  });
});

describe("restoreKnowledgeSource", () => {
  it("updates status to active when no sibling in the family is active", async () => {
    state.selectResponses = [
      { data: { doc_family_id: "f1" }, error: null }, // target read
      { data: null, error: null }, // no active sibling
    ];
    const ok = await restoreKnowledgeSource(ORG, "s1");
    expect(ok).toBe(true);
    const update = state.calls.find((c) => c.op === "update")!;
    expect(update.patch).toMatchObject({ status: "active" });
    expect(update.eqs).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["id", "s1"],
        ["status", "archived"],
      ]),
    );
  });

  it("CRITICAL: refuses when a sibling in the same family is already active — never creates two live versions", async () => {
    state.selectResponses = [
      { data: { doc_family_id: "f1" }, error: null },
      { data: { id: "s2" }, error: null }, // an active sibling exists
    ];
    const ok = await restoreKnowledgeSource(ORG, "s1");
    expect(ok).toBe(false);
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("returns false for a sourceId that isn't currently archived (stale id, wrong tenant, typo)", async () => {
    state.selectResponses = [{ data: null, error: null }];
    expect(await restoreKnowledgeSource(ORG, "s1")).toBe(false);
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("returns false when the final update matched zero rows (lost a race after the sibling check)", async () => {
    state.selectResponses = [
      { data: { doc_family_id: "f1" }, error: null },
      { data: null, error: null },
    ];
    state.updateResponses = [{ data: [], error: null }];
    expect(await restoreKnowledgeSource(ORG, "s1")).toBe(false);
  });

  it("degrades to false with no Supabase client", async () => {
    client = null;
    expect(await restoreKnowledgeSource(ORG, "s1")).toBe(false);
  });
});

describe("listArchivedKnowledgeSources", () => {
  it("returns the archived rows mapped to camelCase, paginated (K2h)", async () => {
    const result = await listArchivedKnowledgeSources(ORG);
    expect(result.items).toEqual([{ id: "s1", title: "t", kind: "doc", isSensitive: false, version: 1, docFamilyId: "f1", folderId: null }]);
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 50 });
  });

  it("degrades to an empty page with no Supabase client", async () => {
    client = null;
    expect(await listArchivedKnowledgeSources(ORG)).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });
});
