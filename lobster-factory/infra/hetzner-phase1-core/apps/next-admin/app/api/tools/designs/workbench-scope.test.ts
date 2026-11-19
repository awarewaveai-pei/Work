// N15: the video workbench's 作品 lists only the customer it is switched to (?organizationId), and a caller naming an
// organization it may not see gets 403 and no rows. tenant-guard and designs-list are the real ones.
import { beforeEach, expect, it, vi } from "vitest";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "2bf60452-0000-4000-8000-000000000002";
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

// Enough of PostgREST for the video list (no group, no cursor, no counts): eq / like / is null, order, limit.
function query() {
  const preds: ((r: Record<string, unknown>) => boolean)[] = [];
  const val = (r: Record<string, unknown>, c: string) => c.includes("->>") ? (r.metadata as Record<string, unknown>)?.[c.split("->>")[1]] ?? null : r[c];
  const q = {
    eq: (c: string, v: unknown) => (preds.push((r) => val(r, c) === v), q),
    like: (c: string, v: string) => (preds.push((r) => new RegExp(`^${v.replace(/%/g, ".*")}$`).test(String(val(r, c)))), q),
    is: (c: string, v: unknown) => (preds.push((r) => val(r, c) === v), q),
    order: () => q,
    limit: () => q,
    then: (resolve: (v: unknown) => void) => resolve({ data: db.rows.filter((r) => preds.every((p) => p(r))), error: null }),
  };
  return q;
}

vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/storage/r2", () => ({}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ select: query }) }),
  getSupabaseReadClient: () => null,
}));

const { GET } = await import("./route");

const video = (id: string, org: string) => ({ id, organization_id: org, storage_backend: "r2", asset_domain: "ai_generated",
  mime_type: "video/mp4", is_current: true, created_at: "2026-11-19T00:00:00Z", metadata: {} });
const staff = { "x-ops-user-kind": "staff" };
const clientOfA = { "x-ops-user-kind": "client", "x-ops-org-id": ORG_A };
const list = (org: string, headers: Record<string, string>) =>
  GET(new Request(`http://localhost/api/tools/designs?domain=ai_video&organizationId=${org}`, { headers }));

beforeEach(() => {
  process.env.POD_DESIGNS_ENABLED = "true";
  db.rows = [video("a1", ORG_A), video("a2", ORG_A), video("b1", ORG_B)];
});

it("workbench switched to customer A: only A's pieces, none of B's", async () => {
  for (const headers of [staff, clientOfA]) {
    const res = await list(ORG_A, headers);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { assets: { id: string }[] };
    expect(json.assets.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  }
});

it("an organization the caller may not see is refused with no rows", async () => {
  const res = await list(ORG_B, clientOfA);
  expect(res.status).toBe(403);
  expect(JSON.stringify(await res.json())).not.toMatch(/"assets"|"a1"|"b1"/);
});
