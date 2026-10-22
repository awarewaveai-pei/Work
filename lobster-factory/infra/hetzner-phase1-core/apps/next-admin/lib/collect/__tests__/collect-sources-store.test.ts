// Choosing sources, approving them, and running what was approved.
//
// The rule under test is one sentence: a candidate is data, an approval is permission, and only
// permission becomes a crawl seed. Everything else here is the mapping from a stored row to a seed,
// which is where a silent mistake would mean "configured, never collected".

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CollectionSource } from "@/lib/collect/sources-store";
import "@/lib/collect/blocks";

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], client: null as unknown }));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => db.client,
}));

const { sourceToSeed, approvedSeeds, addSource, approveSource } = await import("@/lib/collect/sources-store");

/** The smallest Supabase stand-in that answers what this module actually calls. */
function fakeClient(rows: Record<string, unknown>[]) {
  return {
    from() {
      const state = { filters: {} as Record<string, unknown> };
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (k: string, v: unknown) => {
          state.filters[k] = v;
          return api;
        },
        order: () => Promise.resolve({ data: rows.filter((r) => matches(r, state.filters)), error: null }),
        single: () => {
          const found = rows.find((r) => matches(r, state.filters));
          return Promise.resolve({ data: found ?? null, error: found ? null : { message: "not_found" } });
        },
        upsert: (row: Record<string, unknown>) => {
          const stored = { id: `src-${rows.length + 1}`, ...row };
          rows.push(stored);
          return {
            select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          const chain: Record<string, unknown> = {
            eq: (k: string, v: unknown) => {
              state.filters[k] = v;
              return chain;
            },
            select: () => ({
              single: () => {
                const found = rows.find((r) => matches(r, state.filters));
                if (found) Object.assign(found, patch);
                return Promise.resolve({ data: found ?? null, error: found ? null : { message: "not_found" } });
              },
            }),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          };
          return chain;
        },
      };
      return api;
    },
  };
}

function matches(row: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

const ORG = "11111111-1111-4111-8111-111111111111";

function source(over: Partial<CollectionSource> = {}): CollectionSource {
  return {
    id: "src-1",
    organizationId: ORG,
    blockId: "collect/http-html",
    entry: "https://shop.example.com/faq",
    options: {},
    status: "approved",
    label: null,
    proposedBy: null,
    approvedBy: "admin",
    approvedAt: null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    ...over,
  };
}

beforeEach(() => {
  db.rows = [];
  db.client = fakeClient(db.rows);
});

describe("sourceToSeed", () => {
  it("keeps a web source scoped to its own host", () => {
    const seed = sourceToSeed(source({ options: { pathPrefix: "/faq" } }))!;
    expect(seed.uri).toBe("https://shop.example.com/faq");
    expect(seed.scope).toEqual({ hosts: ["shop.example.com"], pathPrefix: "/faq" });
  });

  it("turns a query source into the scheme its block answers to", () => {
    const seed = sourceToSeed(
      source({ blockId: "collect/academic", entry: "retrieval augmented generation", options: { registry: "arxiv" } }),
    )!;
    expect(seed.uri).toBe(`academic://${encodeURIComponent("retrieval augmented generation")}`);
    expect(seed.meta).toMatchObject({ registry: "arxiv", sourceId: "src-1" });
  });

  it("turns a path source into a file URL that survives a Windows drive letter", () => {
    const seed = sourceToSeed(source({ blockId: "collect/local-file", entry: "D:\\Work\\transcripts" }))!;
    expect(seed.uri).toBe("file:///D:/Work/transcripts");
  });

  it("marks an API source so it is read as an API, not extracted as a page", () => {
    const seed = sourceToSeed(source({ blockId: "collect/http-api", entry: "https://gov.example/api" }))!;
    expect(seed.hint).toBe("http-api");
  });

  it("carries the source id into every document's run, for the withdrawal path", () => {
    // ADR 013 §決策 5: withdrawing a source has to be able to find what it produced.
    expect(sourceToSeed(source())!.meta).toMatchObject({ sourceId: "src-1" });
  });
});

describe("approval", () => {
  it("never turns a candidate into a seed", async () => {
    db.rows.push(
      { ...rowOf(source({ id: "a", status: "approved" })) },
      { ...rowOf(source({ id: "b", entry: "https://other.example/", status: "candidate", proposedBy: "discovery" })) },
      { ...rowOf(source({ id: "c", entry: "https://old.example/", status: "disabled" })) },
    );
    const seeds = await approvedSeeds(ORG);
    expect(seeds.map((s) => s.source.id)).toEqual(["a"]);
  });

  it("records who approved, because an approval with nobody attached is not one", async () => {
    db.rows.push({ ...rowOf(source({ id: "a", status: "candidate" })) });
    expect((await approveSource(ORG, "a", "")).errors).toContain("approver_required");
    const ok = await approveSource(ORG, "a", "admin:header");
    expect(ok.source).toMatchObject({ status: "approved", approvedBy: "admin:header" });
  });

  it("refuses a source that could never collect anything", async () => {
    const bad = await addSource({ organizationId: ORG, blockId: "collect/http-html", entry: "not a url" });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("entry_not_a_url");

    const unknown = await addSource({ organizationId: ORG, blockId: "collect/nope", entry: "https://x.test/" });
    expect(unknown.errors[0]).toMatch(/unknown_source/);
  });

  it("lets discovery propose a source whose key has not arrived yet, but not switch it on", async () => {
    // a developer machine may have these set; the test is about their absence
    vi.stubEnv("RENDERER_SHARED_SECRET", "");
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    onTestFinished(() => { vi.unstubAllEnvs(); });
    const proposed = await addSource({
      organizationId: ORG,
      blockId: "collect/extract-provider", // needs RENDERER_SHARED_SECRET or FIRECRAWL_API_KEY; neither is set here
      entry: "https://js-heavy.example/",
      proposedBy: "discovery:openalex",
    });
    expect(proposed.ok).toBe(true);
    expect(proposed.source).toMatchObject({ status: "candidate" });

    // A human switching the same thing on now would be told the key is missing, because an
    // approved-but-unusable source collects nothing and looks like a quiet site.
    const byHuman = await addSource({
      organizationId: ORG,
      blockId: "collect/extract-provider",
      entry: "https://js-heavy2.example/",
      approvedBy: "admin",
    });
    expect(byHuman.ok).toBe(false);
    expect(byHuman.errors[0]).toMatch(/unavailable:missing_RENDERER_SHARED_SECRET,FIRECRAWL_API_KEY/);
  });
});

function rowOf(s: CollectionSource): Record<string, unknown> {
  return {
    id: s.id,
    organization_id: s.organizationId,
    block_id: s.blockId,
    entry: s.entry,
    options: s.options,
    status: s.status,
    label: s.label,
    proposed_by: s.proposedBy,
    approved_by: s.approvedBy,
    approved_at: s.approvedAt,
    last_run_at: s.lastRunAt,
    last_status: s.lastStatus,
    last_error: s.lastError,
  };
}
