import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domains = vi.hoisted(() => ({ seen: [] as unknown[] }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) q[m] = () => q;
    q.in = (col: string, v: unknown) => { if (col === "asset_domain") domains.seen = v as unknown[]; return q; };
    q.limit = async () => ({ data: [], error: null });
    return { from: () => q };
  },
}));

import { GET } from "./route";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const get = (qs = "") => GET(new NextRequest(`http://localhost/api/video/assets?organizationId=${ORG}${qs}`, { headers: { "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" } }));

beforeEach(() => { domains.seen = []; });

describe("GET /api/video/assets", () => {
  it("lists workbench renders only when the caller asks (Release panel); pipeline screens never see them", async () => {
    expect((await get()).status).toBe(200);
    expect(domains.seen).toEqual(["ai_generated", "real_footage"]);
    await get("&includeWorkbench=1");
    expect(domains.seen).toEqual(["ai_generated", "real_footage", "workbench_render"]);
  });
});
