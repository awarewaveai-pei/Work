// getSourceDetail / listVersionsForFamily (lib/kb/db.ts) — K2g content-viewer backend.
//
// The load-bearing distinction this covers: a document ingested before migration 0084 has
// body = null in the database (no backfill), which must read back as an explicit "unavailable"
// signal, never as an empty string a UI could mistake for "this document has no content."

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  detailResponse: { data: null as unknown, error: null as unknown },
  versionsResponse: { data: null as unknown, error: null as unknown },
  lastEqs: [] as string[][],
}));

function fakeClient() {
  return {
    from: () => ({
      select: () => {
        const eqs: string[][] = [];
        const chain = {
          eq: (k: string, v: unknown) => {
            eqs.push([k, String(v)]);
            state.lastEqs = eqs;
            return chain;
          },
          maybeSingle: () => Promise.resolve(state.detailResponse),
          order: () => Promise.resolve(state.versionsResponse),
        };
        return chain;
      },
    }),
  };
}

let client: ReturnType<typeof fakeClient> | null;
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => client }));

const { getSourceDetail, listVersionsForFamily } = await import("@/lib/kb/db");

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  client = fakeClient();
  state.detailResponse = { data: null, error: null };
  state.versionsResponse = { data: null, error: null };
  state.lastEqs = [];
});

describe("getSourceDetail", () => {
  it("returns null when no client is configured, and when the row isn't found", async () => {
    client = null;
    expect(await getSourceDetail(ORG, "s1")).toBeNull();
    client = fakeClient();
    state.detailResponse = { data: null, error: null };
    expect(await getSourceDetail(ORG, "s1")).toBeNull();
  });

  it("maps a real row, including a stored body", async () => {
    state.detailResponse = {
      data: {
        id: "s1", title: "退貨政策", kind: "doc", is_sensitive: false, status: "active",
        source_version: 2, doc_family_id: "f1", canonical_url: null, body: "全文在此",
        language: "zh", epistemic_type: "SOURCE_FACT", authorship_state: "HUMAN_ORIGINAL",
        locked: null, author: null, published_at: null, venue: null, doi: null,
        created_at: "2026-09-17T00:00:00Z",
      },
      error: null,
    };
    const detail = await getSourceDetail(ORG, "s1");
    expect(detail?.body).toBe("全文在此");
    expect(detail?.version).toBe(2);
    expect(detail?.docFamilyId).toBe("f1");
  });

  it("body is null (not empty string) for a pre-migration row -- the UI must tell these apart", async () => {
    state.detailResponse = {
      data: {
        id: "s1", title: "old doc", kind: "doc", is_sensitive: false, status: "active",
        source_version: 1, doc_family_id: "f1", canonical_url: null, body: null,
        language: null, epistemic_type: null, authorship_state: null, locked: null,
        author: null, published_at: null, venue: null, doi: null, created_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    };
    const detail = await getSourceDetail(ORG, "s1");
    expect(detail?.body).toBeNull();
  });

  it("scopes the read by organization_id, not just sourceId", async () => {
    state.detailResponse = { data: null, error: null };
    await getSourceDetail(ORG, "s1");
    expect(state.lastEqs).toContainEqual(["organization_id", ORG]);
    expect(state.lastEqs).toContainEqual(["id", "s1"]);
  });
});

describe("listVersionsForFamily", () => {
  it("returns [] on error or no client, never throws", async () => {
    client = null;
    expect(await listVersionsForFamily(ORG, "f1")).toEqual([]);
    client = fakeClient();
    state.versionsResponse = { data: null, error: { message: "boom" } };
    expect(await listVersionsForFamily(ORG, "f1")).toEqual([]);
  });

  it("maps active and archived versions newest-first, per K1's own ordering", async () => {
    state.versionsResponse = {
      data: [
        { id: "v2", source_version: 2, status: "active", created_at: "2026-09-17T00:00:00Z" },
        { id: "v1", source_version: 1, status: "archived", created_at: "2026-09-01T00:00:00Z" },
      ],
      error: null,
    };
    const versions = await listVersionsForFamily(ORG, "f1");
    expect(versions).toEqual([
      { id: "v2", version: 2, status: "active", createdAt: "2026-09-17T00:00:00Z" },
      { id: "v1", version: 1, status: "archived", createdAt: "2026-09-01T00:00:00Z" },
    ]);
  });
});
