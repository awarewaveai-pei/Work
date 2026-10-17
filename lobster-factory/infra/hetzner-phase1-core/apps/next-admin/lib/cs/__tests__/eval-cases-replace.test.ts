// replaceEvalCases revokes the graduation before touching any case: with no transaction across the
// writes, a later failure must leave the intent ungraduated, never certified on unexamined cases
// (Codex 2026-10-16, partialreview-1e95d4c4 F2).
import { describe, expect, it, vi } from "vitest";

const steps: string[] = [];
const sb = {
  from: (table: string) => {
    if (table === "cs_intents") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: { graduation: { status: "passed" } }, updated_at: "t0" }, error: null }) }) }) }),
        update: (patch: { metadata: Record<string, unknown> }) => ({
          eq: () => ({ eq: () => ({ eq: () => ({ select: async () => { steps.push(patch.metadata.graduation ? "write" : "revoke"); return { data: [{ key: "k" }], error: null }; } }) }) }),
        }),
      };
    }
    return {
      select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: "old-1" }], error: null }) }) }),
      insert: async () => { steps.push("insert"); return { error: { message: "insert failed" } }; },
      delete: () => ({ eq: () => ({ in: async () => { steps.push("delete"); return { error: null }; } }) }),
    };
  },
};
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { replaceEvalCases } = await import("@/lib/cs/db");

describe("replaceEvalCases", () => {
  it("revokes the graduation first, so a failed insert leaves the intent ungraduated", async () => {
    const ok = await replaceEvalCases("o", "courses", [{ question: "q", expectedPoints: ["p"], expectHandoff: false, isAdversarial: false }]);
    expect(ok).toBe(false);
    expect(steps).toEqual(["revoke", "insert"]);
  });
});
