// V1.2: a project read by id is checked against the caller's organization; invalid values are 400 before any write.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { GET, POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const other = "123e4567-e89b-42d3-a456-426614174009";
const projectId = "123e4567-e89b-42d3-a456-426614174002";

// Thenable query chain: every filter returns the chain; maybeSingle/single/await resolve to the table's row(s).
function fakeDb(rows: Record<string, unknown>, lists: Record<string, unknown[]> = {}) {
  const insert = vi.fn();
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    q.single = async () => ({ data: rows[table] ?? null, error: null });
    q.then = (resolve: (v: unknown) => void) => resolve({ data: lists[table] ?? [], error: null });
    q.insert = (v: unknown) => { insert(v); return q; };
    return q;
  };
  return { db: { from: chain }, insert };
}

const asClient = (url: string, init?: RequestInit) => new NextRequest(url, {
  ...init, headers: { "content-type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "client", "x-ops-org-id": org },
});
const asStaff = (url: string, init?: RequestInit) => new NextRequest(url, {
  ...init, headers: { "content-type": "application/json", "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" },
});

beforeEach(() => vi.clearAllMocks());

describe("/api/video/projects", () => {
  it("GET ?id= refuses another organization's project and serves the caller's own", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_production_projects: { id: projectId, organization_id: other } }).db);
    expect((await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`))).status).toBe(403);
    getSupabaseWriteClient.mockReturnValue(fakeDb({ media_production_projects: { id: projectId, organization_id: org } }).db);
    const res = await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`));
    expect(res.status).toBe(200);
  });

  it("GET ?id= returns the outcome snapshots of the project's releases, empty when none were published", async () => {
    const project = { media_production_projects: { id: projectId, organization_id: org } };
    const get = async () => (await GET(asClient(`http://localhost/api/video/projects?id=${projectId}`))).json() as Promise<{ outcomes: unknown[] }>;
    getSupabaseWriteClient.mockReturnValue(fakeDb(project).db);
    expect((await get()).outcomes).toEqual([]);
    const snap = { id: "s1", release_id: "r1", platform: "youtube", maturity: "7d", observed_at: "2026-10-28T00:00:00Z", metrics: { views: 10 } };
    getSupabaseWriteClient.mockReturnValue(fakeDb(project, { media_assets: [{ id: "a1" }], media_releases: [{ id: "r1" }], media_outcome_snapshots: [snap] }).db);
    expect((await get()).outcomes).toEqual([snap]);
  });

  it("POST rejects an unknown autonomy or format with 400 and writes nothing", async () => {
    const { db, insert } = fakeDb({});
    getSupabaseWriteClient.mockReturnValue(db);
    const post = (extra: object) => POST(asStaff("http://localhost/api/video/projects", {
      method: "POST", body: JSON.stringify({ organizationId: org, title: "t", productionMode: "quick_video", ...extra }),
    }));
    expect((await post({ autonomy: "whenever" })).status).toBe(400);
    expect((await post({ formats: ["1x1"] })).status).toBe(400);
    expect((await post({ formats: [] })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
