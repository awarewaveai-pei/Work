import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }) }),
    rpc: db.rpc,
  }),
}));

import { POST } from "./route";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const OTHER = "123e4567-e89b-42d3-a456-426614174009";
const call = (headers: Record<string, string>) =>
  POST(new Request("http://localhost/api/video/story-bibles/r1/approve", { method: "POST", headers }), { params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  db.rpc.mockReset().mockReturnValue({ single: async () => ({ data: { id: "r1", status: "approved" }, error: null }) });
  db.row = { id: "r1", organization_id: ORG, series_id: "s1", revision: 1, status: "draft" };
});

describe("POST /api/video/story-bibles/[id]/approve", () => {
  it("a customer approves its own organization's draft (D3)", async () => {
    expect((await call({ "x-ops-user-kind": "client", "x-ops-org-id": ORG })).status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("approve_media_story_bible_revision", { p_id: "r1" });
  });

  it("a customer cannot approve another organization's draft, whatever org it names", async () => {
    db.row = { ...db.row!, organization_id: OTHER };
    expect((await call({ "x-ops-user-kind": "client", "x-ops-org-id": ORG })).status).toBe(403);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("a staff operator is still refused", async () => {
    expect((await call({ "x-ops-claims-role": "operator" })).status).toBe(403);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
