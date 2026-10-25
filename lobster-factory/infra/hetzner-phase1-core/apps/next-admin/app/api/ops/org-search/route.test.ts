// The pickers' tools (collect, outreach, design) reach this route, not GET /api/ops/clients: it must return the
// picker's fields only -- never client_config (SSH host / user / key name, WordPress path) -- and never the whole table.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ select: [] as string[], or: [] as string[], limit: [] as number[], from: 0 }));
// a row as the database could return it if the select ever named metadata whole
const ROW = vi.hoisted(() => ({
  id: "o1", slug: "acme", name: "Acme", color: null, brandColors: { primary: "#112233", secondary: "red" },
  metadata: { client_config: { ssh_host: "10.0.0.5", ssh_user: "root", wp_path: "/var/www" } },
}));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: (cols: string) => { calls.select.push(cols); return q; },
    order: () => q,
    or: (f: string) => { calls.or.push(f); return q; },
    limit: (n: number) => { calls.limit.push(n); return q; },
    then: (ok: (v: unknown) => unknown) => ok({ data: [ROW], error: null, count: 1 }),
  };
  return { getSupabaseServerClient: () => ({ from: () => { calls.from++; return q; } }) };
});
import { GET } from "./route";
import { NAV_FIRST, NAV_SEARCH_LIMIT } from "@/app/(shell)/ops/clients/nav-orgs";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const get = async (qs: string) => (await GET(new Request(`https://app.aware-wave.com/api/ops/org-search${qs}`, { headers: staff }))).json();

beforeEach(() => { calls.select = []; calls.or = []; calls.limit = []; calls.from = 0; });

describe("GET /api/ops/org-search", () => {
  it("selects no whole metadata column and returns only the picker's fields", async () => {
    const body = await get("?q=ac");
    for (const col of calls.select[0].split(",")) expect(col.includes("metadata") ? col.includes("->") : true, col).toBe(true);
    expect(body.orgs.map((o: object) => Object.keys(o).sort())).toEqual([["brandColors", "color", "id", "name", "slug"]]);
    expect(body.orgs[0].brandColors).toEqual(["#112233"]);   // a non-hex value is not a colour
  });

  it("is bounded: NAV_FIRST without q, NAV_SEARCH_LIMIT with q, nothing for a q of only stripped characters", async () => {
    await get("");
    await get("?q=ac");
    expect(calls.limit).toEqual([NAV_FIRST, NAV_SEARCH_LIMIT]);
    expect(await get("?q=%22%2A%28%29")).toEqual({ ok: true, orgs: [], total: 0 });
    expect(calls.from).toBe(2);
  });
});
