// SF-P old-data test: a client's stored department selection (written before the /onboard wizard retired, possibly with
// an id the catalog no longer lists) saves back through PATCH /departments with the same values, and nothing else in
// organizations.metadata changes. Unknown new ids are refused; only owner/admin may write.
import { beforeEach, describe, expect, it, vi } from "vitest";

const role = vi.hoisted(() => ({ value: "admin" }));
vi.mock("../../../../../../lib/ops-role", async (orig) => ({
  ...(await orig<typeof import("../../../../../../lib/ops-role")>()),
  resolveOpsRole: () => ({ role: role.value, source: "simulated" }),
}));

const db = vi.hoisted(() => ({ metadata: null as Record<string, unknown> | null, writes: [] as Array<Record<string, unknown>> }));
vi.mock("../../../../../../lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.metadata ? { id: "org-1", metadata: db.metadata } : null, error: null }) }) }),
          update: (row: Record<string, unknown>) => ({ eq: async () => { db.writes.push(row); return { error: null }; } }),
        };
      }
      if (table === "ops_audit_events") return { insert: async () => ({ error: null }) };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { PATCH } = await import("./route");
const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/ops/clients/soulful/departments", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "soulful" }) });

const STORED = ["CLU_FINANCE", "CLU_RETIRED_OLD", "CLU_STRATEGY_GOVERN"];

beforeEach(() => {
  role.value = "admin";
  db.writes = [];
  db.metadata = {
    source: "build_console",
    wp_update_latest: { ran_at: "2026-11-01" },
    client_config: { platform: "wordpress", site_url: "https://soulful.example", brandColors: { primary: "#112233" }, department_selection: STORED, department_selection_reviewed_at: "2026-05-13" },
  };
});

describe("PATCH /api/ops/clients/[slug]/departments", () => {
  it("saves the stored selection back unchanged, keeps an id the catalog dropped, touches no other key", async () => {
    const res = await patch({ selection: STORED });
    expect(res.status).toBe(200);
    expect((await res.json()).selection).toEqual(STORED);
    const written = db.writes[0].metadata as Record<string, unknown>;
    const cc = written.client_config as Record<string, unknown>;
    expect(cc.department_selection).toEqual(STORED);
    expect(cc.department_selection_reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const { department_selection_reviewed_at: _a, ...restBefore } = (db.metadata!.client_config as Record<string, unknown>);
    const { department_selection_reviewed_at: _b, ...restAfter } = cc;
    expect(restAfter).toEqual(restBefore);
    expect(written.wp_update_latest).toEqual({ ran_at: "2026-11-01" });
    expect(written.source).toBe("build_console");
  });

  it("refuses an id that is neither in the catalog nor already stored", async () => {
    const res = await patch({ selection: ["CLU_FINANCE", "CLU_MADE_UP"] });
    expect(res.status).toBe(400);
    expect(db.writes).toEqual([]);
  });

  it("refuses an operator (owner/admin only, like the other client_config writers)", async () => {
    role.value = "operator";
    const res = await patch({ selection: STORED });
    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });
});
