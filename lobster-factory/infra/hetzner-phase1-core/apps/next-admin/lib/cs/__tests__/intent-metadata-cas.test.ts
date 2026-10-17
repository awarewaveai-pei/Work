// Two metadata keys written at once never erase each other: the writer that loses the
// compare-and-swap on updated_at reads again and re-applies only its own key.
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  row: { metadata: { graduation: { status: "passed", runId: "r1", startedAt: "t" } } as Record<string, unknown>, updated_at: "t0" },
  firstUpdateLoses: true,
  writes: [] as Array<Record<string, unknown>>,
}));

const sb = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...db.row }, error: null }) }) }) }),
    update: (patch: { metadata: Record<string, unknown>; updated_at: string }) => ({
      eq: () => ({ eq: () => ({ eq: (_c: string, v: string) => ({
        select: async () => {
          if (db.firstUpdateLoses) {
            // Another writer lands first: the exam's verdict changes and updated_at moves on.
            db.firstUpdateLoses = false;
            db.row = { metadata: { ...db.row.metadata, graduation: { status: "failed", runId: "r1", startedAt: "t" } }, updated_at: "t1" };
          }
          if (v !== db.row.updated_at) return { data: [], error: null };
          db.row = { metadata: patch.metadata, updated_at: patch.updated_at };
          db.writes.push(patch.metadata);
          return { data: [{ key: "k" }], error: null };
        },
      }) }) }),
    }),
  }),
};
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { updateIntent } = await import("@/lib/cs/db");

describe("cs_intents.metadata writes", () => {
  it("a handoff reply saved while an exam result lands keeps the exam result", async () => {
    expect(await updateIntent("o", "refund", { handoffReply: "請先留下原因" })).toBe("ok");
    expect(db.row.metadata).toMatchObject({ handoffReply: "請先留下原因", graduation: { status: "failed" } });
  });
});
