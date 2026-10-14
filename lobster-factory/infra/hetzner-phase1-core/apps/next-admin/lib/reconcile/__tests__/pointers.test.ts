import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/content/postiz", () => ({ listAllIntegrations: vi.fn() }));
vi.mock("@/lib/cognitive-os/client", () => ({ isCognitiveOsConfigured: () => true, listCognitiveOsProjects: vi.fn() }));

const { CHECKS, findDangling, runChecks } = await import("../pointers");
const postiz = await import("@/lib/content/postiz");

/** Supabase stub: every select returns `table`'s rows, paged by range(). */
function stubDb(tables: Record<string, Array<Record<string, string>>>): SupabaseClient {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        not: () => q,
        order: () => q,
        range: (from: number, to: number) => Promise.resolve({ data: (tables[table] ?? []).slice(from, to + 1), error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("cross-product pointers", () => {
  it("reports a held id the owner does not list", () => {
    const held = [{ where: "a 1", id: "x" }, { where: "a 2", id: "gone" }];
    expect(findDangling(held, ["x", "y"])).toEqual([{ where: "a 2", id: "gone" }]);
  });

  it("a check that cannot reach its owner is an error, never a clean pass", async () => {
    vi.mocked(postiz.listAllIntegrations).mockRejectedValueOnce(new Error("Postiz /integrations returned 502"));
    const [r] = await runChecks(stubDb({ social_postiz_connections: [{ id: "r1", postiz_integration_id: "i1" }] }), [CHECKS[0]]);
    expect(r).toMatchObject({ id: "postiz-integrations", error: "Postiz /integrations returned 502" });
  });

  it("reads every row past PostgREST's 1000-row cap", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ id: `r${i}`, postiz_integration_id: `i${i}` }));
    vi.mocked(postiz.listAllIntegrations).mockResolvedValueOnce(many.slice(0, 1000).map((r) => ({ id: r.postiz_integration_id })) as never);
    const [r] = await runChecks(stubDb({ social_postiz_connections: many }), [CHECKS[0]]);
    expect(r.checked).toBe(1001);
    expect(r.dangling).toEqual([{ where: "social_postiz_connections r1000", id: "i1000" }]);
  });
});
