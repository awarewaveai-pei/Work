// rebindManualDocumentUrl (lib/kb/db.ts) — the FAQ-duplication pre-crawl fix (operator decision
// 2026-09-12, option A). The safety-relevant behaviour: refuse rather than silently merge whenever
// the target isn't a genuinely-unclaimed manual document, and move canonical_url + doc_family_id
// TOGETHER (changing just the URL column would leave the old family id in place, reproducing the
// exact duplication bug this function exists to close).
//
// Critic finding 2026-09-12 (Major): the source-row update now checks the actual affected-row COUNT
// via `.select("id")`, not just `!error` — Supabase/PostgREST returns error:null even when the WHERE
// clause (which re-checks `canonical_url IS NULL` at write time) matched zero rows, which a lost
// race against a concurrent rebind of the SAME source used to report as success while
// canonical_url/doc_family_id silently kept their PREVIOUS values. The chunks cleanup is also now
// gated on that confirmed success, never run against a family id the source row does not have.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { docFamilyId } from "@/lib/kb/family";

type Call = { table: string; op: "select" | "update"; eqs: string[][]; patch?: Record<string, unknown> };

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  // Queued responses for each `.select(...)...maybeSingle()` read call, consumed in order.
  selectResponses: [] as Array<{ data: unknown; error: unknown }>,
  // Queued responses for each `.update(...).select("id")` write call, consumed in order.
  updateResponses: [] as Array<{ data: unknown; error: unknown }>,
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
          neq: (k: string, v: unknown) => {
            call.eqs.push([`neq:${k}`, String(v)]);
            return chain;
          },
          limit: () => chain,
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
          is: (k: string, v: unknown) => {
            call.eqs.push([`is:${k}`, String(v)]);
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

const { rebindManualDocumentUrl } = await import("@/lib/kb/db");

const ORG = "11111111-1111-4111-8111-111111111111";
const URL = "https://client.example.com/faq/returns";

beforeEach(() => {
  state.calls = [];
  state.selectResponses = [];
  state.updateResponses = [];
  client = fakeClient();
});

describe("rebindManualDocumentUrl", () => {
  it("moves canonical_url AND doc_family_id together, to the hash a future crawl of that URL would compute", async () => {
    state.selectResponses = [
      { data: { id: "s1", canonical_url: null }, error: null }, // existing-source read
      { data: null, error: null }, // no collision
    ];
    state.updateResponses = [
      { data: [{ id: "s1" }], error: null }, // source update: 1 row affected
      { data: [{ id: "c1" }], error: null }, // chunks update
    ];

    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: true });

    const sourceUpdate = state.calls.find((c) => c.table === "cs_knowledge_sources" && c.op === "update");
    expect(sourceUpdate?.patch).toMatchObject({ canonical_url: URL, doc_family_id: docFamilyId(ORG, URL) });
    expect(sourceUpdate?.eqs).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["id", "s1"],
        ["is:canonical_url", "null"],
      ]),
    );

    const chunksUpdate = state.calls.find((c) => c.table === "cs_knowledge_chunks" && c.op === "update");
    expect(chunksUpdate?.patch).toMatchObject({ doc_family_id: docFamilyId(ORG, URL) });
  });

  it("refuses a source that already has a canonicalUrl, without touching the database further", async () => {
    state.selectResponses = [{ data: { id: "s1", canonical_url: "https://already.example.com" }, error: null }];
    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: false, error: "already_has_url" });
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("refuses when the target URL's family already belongs to a different source (a crawl got there first)", async () => {
    state.selectResponses = [
      { data: { id: "s1", canonical_url: null }, error: null },
      { data: { id: "s2" }, error: null }, // collision: another row already owns this family
    ];
    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: false, error: "url_already_claimed" });
    expect(state.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("reports not_found for a nonexistent or cross-tenant source id", async () => {
    state.selectResponses = [{ data: null, error: null }];
    const result = await rebindManualDocumentUrl(ORG, "does-not-exist", URL);
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("MAJOR: reports lost_race (not ok:true) when the source update's WHERE matched zero rows, and never touches chunks", async () => {
    state.selectResponses = [
      { data: { id: "s1", canonical_url: null }, error: null },
      { data: null, error: null },
    ];
    state.updateResponses = [{ data: [], error: null }]; // lost the race: 0 rows affected
    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: false, error: "lost_race" });
    expect(state.calls.some((c) => c.table === "cs_knowledge_chunks")).toBe(false);
  });

  it("still reports success even if the best-effort chunks cleanup fails — the source row is the one that matters", async () => {
    state.selectResponses = [
      { data: { id: "s1", canonical_url: null }, error: null },
      { data: null, error: null },
    ];
    state.updateResponses = [{ data: [{ id: "s1" }], error: null }, { data: null, error: { message: "chunks boom" } }];
    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: true });
  });

  it("reports write_failed when the source update itself errors", async () => {
    state.selectResponses = [
      { data: { id: "s1", canonical_url: null }, error: null },
      { data: null, error: null },
    ];
    state.updateResponses = [{ data: null, error: { message: "boom" } }];
    const result = await rebindManualDocumentUrl(ORG, "s1", URL);
    expect(result).toEqual({ ok: false, error: "write_failed" });
  });

  it("degrades to write_failed with no Supabase client", async () => {
    client = null;
    expect(await rebindManualDocumentUrl(ORG, "s1", URL)).toEqual({ ok: false, error: "write_failed" });
  });
});
