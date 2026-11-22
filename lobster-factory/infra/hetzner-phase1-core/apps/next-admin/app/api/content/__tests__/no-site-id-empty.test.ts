/**
 * K6 lock: categories / tags / patterns called by staff without siteId answer 200 + empty list, and never reach
 * WordPress or any site's credentials. The empty list is their existing "no site" answer; what must not come back is
 * resolveWpSite's old "first accessible site" fallback (for staff = some other client's site).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getSupabaseWriteClient } = vi.hoisted(() => ({ getSupabaseWriteClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner", source: "claims" }), canCreateAiImageJob: () => true }));

import { GET as categories } from "../categories/route";
import { GET as tags } from "../tags/route";
import { GET as patterns } from "../patterns/route";

const ROWS = [
  { id: "site-a", name: "A", url: "https://a.example", token: "SECRET-TOKEN-A", color: "#111", username: "ua", organization_id: "aaaaaaaa-0000-4000-8000-00000000000a" },
  { id: "site-b", name: "B", url: "https://b.example", token: "SECRET-TOKEN-B", color: "#222", username: "ub", organization_id: "bbbbbbbb-0000-4000-8000-00000000000b" },
];

const fetchSpy = vi.fn();

beforeEach(() => {
  getSupabaseWriteClient.mockReset();
  getSupabaseWriteClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: ROWS, error: null }) }) }) }),
  });
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); });

const staffReq = (path: string) => new Request(`http://localhost${path}`, { headers: { "x-ops-user-kind": "staff" } });

describe.each([
  ["categories", categories, "/api/content/categories", "categories"],
  ["tags", tags, "/api/content/tags", "tags"],
  ["patterns", patterns, "/api/content/patterns", "patterns"],
] as const)("K6 %s: staff without siteId", (_name, handler, path, key) => {
  it.each(["", "?siteId=", "?siteId=%20%20"])("query %j -> 200 empty, no WordPress call, no credential", async (q) => {
    const res = await handler(staffReq(path + q));
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body[key]).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text).not.toContain("SECRET-TOKEN");
    expect(text).not.toContain("example");
  });
});
