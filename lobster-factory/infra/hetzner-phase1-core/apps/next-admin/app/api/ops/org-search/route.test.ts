// The pickers' tools (collect, outreach, design) reach this route, not GET /api/ops/clients: it must return the
// picker's fields only -- never client_config (SSH host / user / key name, WordPress path) -- and never the whole table.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  select: [] as string[], or: [] as string[], limit: [] as number[], from: 0, eq: [] as Array<[string, unknown]>, extra: null as unknown,
  neq: [] as Array<[string, unknown]>, in: [] as Array<[string, unknown]>, rpc: [] as Array<[string, Record<string, unknown>]>,
  rows: null as unknown[] | null, ledger: null as unknown, ledgerError: null as { message: string } | null, internal: null as unknown,
}));
// a row as the database could return it if the select ever named metadata whole
const ROW = vi.hoisted(() => ({
  id: "o1", slug: "acme", name: "Acme", color: null, brandColors: { primary: "#112233", secondary: "red" },
  metadata: { client_config: { ssh_host: "10.0.0.5", ssh_user: "root", wp_path: "/var/www" } },
}));
vi.mock("@/lib/supabase-server", () => {
  const q = {
    select: (cols: string) => { calls.select.push(cols); return q; },
    order: () => q,
    neq: (c: string, v: unknown) => { calls.neq.push([c, v]); return q; },
    eq: (c: string, v: unknown) => { calls.eq.push([c, v]); return q; },
    is: () => q,
    in: (c: string, v: unknown) => { calls.in.push([c, v]); return q; },
    // the internal-org read is the one select("id"); the ?include= read is the other maybeSingle
    maybeSingle: async () => ({ data: calls.select.at(-1) === "id" ? calls.internal : calls.extra, error: null }),
    or: (f: string) => { calls.or.push(f); return q; },
    limit: (n: number) => { calls.limit.push(n); return q; },
    then: (ok: (v: unknown) => unknown) => ok({ data: calls.rows ?? [ROW], error: null, count: (calls.rows ?? [ROW]).length }),
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.rpc.push([name, args]);
    return calls.ledgerError ? { data: null, error: calls.ledgerError } : { data: calls.ledger, error: null };
  };
  const client = { from: () => { calls.from++; return q; }, rpc };
  return { getSupabaseServerClient: () => client, getSupabaseWriteClient: () => client };
});
import { GET } from "./route";
import { NAV_FIRST, NAV_SEARCH_LIMIT } from "@/app/(shell)/ops/clients/nav-orgs";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const get = async (qs: string) => (await GET(new Request(`https://app.aware-wave.com/api/ops/org-search${qs}`, { headers: staff }))).json();

beforeEach(() => {
  Object.assign(calls, { select: [], or: [], limit: [], from: 0, eq: [], extra: null, neq: [], in: [], rpc: [], rows: null, ledger: null, ledgerError: null, internal: null });
});

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

  const INC = "22222222-2222-4222-8222-222222222222";
  it("?include=<uuid> puts a client that is not in the page first, in the same columns", async () => {
    calls.extra = { id: INC, slug: "far", name: "Far", color: null, brandColors: null };
    const body = await get(`?include=${INC}`);
    expect(body.orgs.map((o: { id: string }) => o.id)).toEqual([INC, "o1"]);
    expect(calls.eq).toEqual([["id", INC]]);
    expect(calls.select[1]).toBe(calls.select[0]);
  });

  it("?include=<uuid> adds no duplicate when the client is already in the page", async () => {
    calls.extra = { id: INC, slug: "x", name: "X", color: null, brandColors: null };
    ROW.id = INC;
    try {
      const body = await get(`?include=${INC}`);
      expect(body.orgs).toHaveLength(1);
      expect(calls.eq).toEqual([]);
    } finally { ROW.id = "o1"; }
  });

  it("?include= that is not a uuid is ignored", async () => {
    calls.extra = { id: "bad", slug: "b", name: "B", color: null, brandColors: null };
    const body = await get("?include=not-a-uuid");
    expect(body.orgs).toHaveLength(1);
    expect(calls.eq).toEqual([]);
  });

  it("without ?category= the answer is as before: no tags, categories or internal id, no ledger read", async () => {
    const body = await get("");
    expect(Object.keys(body).sort()).toEqual(["ok", "orgs", "total"]);
    expect(calls.rpc).toEqual([]);
  });
});

// U3: the client rail's categories. Server-side filter, one closed vocabulary, TEST only under 測試.
describe("GET /api/ops/org-search?category=", () => {
  const INTERNAL = "99999999-9999-4999-8999-999999999999";
  const C1 = "11111111-1111-4111-8111-111111111111";
  const T1 = "33333333-3333-4333-8333-333333333333";
  const org = (id: string, slug: string, kind = "customer", parent: string | null = null) =>
    ({ id, slug, name: slug, kind, parent_organization_id: parent, color: null, brandColors: null });
  const lrow = (id: string, kind: string, o: { reasons?: string[]; contracts?: unknown[]; balance?: number } = {}) =>
    ({ organization_id: id, name: id, slug: id, kind, reasons: o.reasons ?? [], contracts: o.contracts ?? [], balance: o.balance ?? 0 });
  const ledger = (rows: unknown[], matching = rows.length) => ({ totals: {}, matching, rows });

  it("refuses any value outside the vocabulary before reading anything", async () => {
    for (const v of ["", "ALL", "manual", "reseller", "buyout", "balance"]) {
      const res = await GET(new Request(`https://app.aware-wave.com/api/ops/org-search?category=${v}`, { headers: staff }));
      expect(res.status, v).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "invalid_category" });
    }
    expect(calls.from).toBe(0);
    expect(calls.rpc).toEqual([]);
  });

  it("answers the vocabulary in order, and only what today's data can tell", async () => {
    calls.ledger = ledger([]);
    const body = await get("?category=all");
    expect(body.categories).toEqual([
      { key: "all", label: "全部" }, { key: "attention", label: "需處理" }, { key: "contract", label: "訂閱" },
      { key: "credits", label: "點數" }, { key: "test", label: "測試" },
    ]);
  });

  it("a customer gets 403 and nothing else, with or without a category", async () => {
    for (const qs of ["?category=all", "?category=test", ""]) {
      const res = await GET(new Request(`https://door.aware-wave.com/api/ops/org-search${qs}`, { headers: { "x-ops-user-kind": "client", "x-ops-claims-role": "operator" } }));
      expect(res.status, qs).toBe(403);
      expect(Object.keys(await res.json()).sort()).toEqual(["error", "ok"]);
    }
    expect(calls.from).toBe(0);
  });

  it("all: TEST left out on the server, bounded, tags from the ledger (a brand carries its account's), internal id answered", async () => {
    const BRAND = "44444444-4444-4444-8444-444444444444";
    calls.rows = [org(C1, "acme"), org(BRAND, "acme-brand", "customer", C1)];
    calls.internal = { id: INTERNAL };
    calls.ledger = ledger([lrow(C1, "customer", { reasons: ["past_due"], contracts: [{}], balance: 5 })]);
    const body = await get("?category=all");
    expect(calls.neq).toContainEqual(["kind", "test"]);
    expect(calls.limit).toContain(NAV_FIRST);
    expect(calls.rpc).toEqual([["billing_ledger", { p_filter: "all", p_query: "", p_limit: 200, p_offset: 0 }]]);
    expect(body.internalOrgId).toBe(INTERNAL);
    expect(body.orgs.map((o: { id: string; tags: string[] }) => [o.id, o.tags])).toEqual([
      [C1, ["attention", "contract", "credits"]], [BRAND, ["attention", "contract", "credits"]],
    ]);
    for (const o of body.orgs) expect(Object.keys(o).sort()).toEqual(["brandColors", "color", "id", "name", "slug", "tags"]);
  });

  it("test: only kind = test, each tagged test", async () => {
    calls.rows = [org(T1, "e2e", "test")];
    calls.ledger = ledger([]);
    const body = await get("?category=test");
    expect(calls.eq).toContainEqual(["kind", "test"]);
    expect(calls.neq).not.toContainEqual(["kind", "test"]);
    expect(body.orgs.map((o: { tags: string[] }) => o.tags)).toEqual([["test"]]);
  });

  it("attention / contract / credits: billing_ledger's own filter, TEST and internal rows dropped, ledger order kept", async () => {
    const C2 = "55555555-5555-4555-8555-555555555555";
    for (const [cat, filter] of [["attention", "attention"], ["contract", "contract"], ["credits", "balance"]] as const) {
      calls.rpc = []; calls.in = [];
      calls.ledger = ledger([lrow(C2, "customer", { balance: 3 }), lrow(T1, "test", { balance: 9 }), lrow(INTERNAL, "internal"), lrow(C1, "customer", { balance: 1 })]);
      calls.rows = [org(C1, "acme"), org(C2, "zeta")];   // the database's order; the answer keeps the ledger's
      const body = await get(`?category=${cat}`);
      expect(calls.rpc, cat).toEqual([["billing_ledger", { p_filter: filter, p_query: "", p_limit: NAV_FIRST, p_offset: 0 }]]);
      expect(calls.in, cat).toEqual([["id", [C2, C1]]]);
      expect(body.orgs.map((o: { id: string }) => o.id), cat).toEqual([C2, C1]);
      expect(body.total, cat).toBe(2);
    }
  });

  it("a failed ledger read: 全部 still lists clients (tags marked unavailable); a billing category fails", async () => {
    calls.rows = [org(C1, "acme")];
    calls.ledgerError = { message: "boom" };
    const all = await get("?category=all");
    expect(all.orgs.map((o: { tags: string[] }) => o.tags)).toEqual([[]]);
    expect(all.tagsFailed).toBe(true);
    const res = await GET(new Request("https://app.aware-wave.com/api/ops/org-search?category=attention", { headers: staff }));
    expect(res.status).toBe(500);
  });
});
