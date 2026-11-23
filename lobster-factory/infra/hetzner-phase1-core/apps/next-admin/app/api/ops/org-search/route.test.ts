// The pickers' tools (collect, outreach, design) reach this route, not GET /api/ops/clients: it must return the
// picker's fields only -- never client_config (SSH host / user / key name, WordPress path) -- and never the whole table.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  select: [] as string[], or: [] as string[], limit: [] as number[], from: 0, eq: [] as Array<[string, unknown]>, extra: null as unknown,
  neq: [] as Array<[string, unknown]>, in: [] as Array<[string, unknown]>, rpc: [] as Array<[string, Record<string, unknown>]>,
  rows: null as unknown[] | null, ledger: null as unknown, ledgerError: null as { message: string } | null, internal: null as unknown,
  testRows: [] as unknown[], internalError: null as { message: string } | null,
  heldError: null as { message: string } | null, heldCalls: 0, heldRows: [] as unknown[], table: "", opsRows: [] as unknown[], resellRows: [] as unknown[], extraError: null as { message: string } | null,
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
    maybeSingle: async () => (calls.select.at(-1) === "id"
      ? { data: calls.internal, error: calls.internalError }
      : { data: calls.extra, error: null }),
    or: (f: string) => { calls.or.push(f); return q; },
    like: () => q,
    limit: (n: number) => { calls.limit.push(n); return q; },
    // the TEST-organizations read is the select("id") that ends in a list
    then: (ok: (v: unknown) => unknown) => {
      // M3's two extra reads (operations, resell rights): empty unless a test fills them
      if (calls.table === "organization_product_operations" || calls.table === "organization_entitlements") {
        const rows = calls.table === "organization_product_operations" ? calls.opsRows : calls.resellRows;
        return ok({ data: calls.extraError ? null : rows, error: calls.extraError });
      }
      const data = calls.select.at(-1) === "id" ? calls.testRows : calls.rows ?? [ROW];
      return ok({ data, error: null, count: data.length });
    },
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    // M3's grouped read of held products is counted apart: calls.rpc stays the ledger's pages
    if (name === "entitlement_held_products") { calls.heldCalls++; const err = calls.heldError ?? calls.extraError; return { data: err ? null : calls.heldRows, error: err }; }
    calls.rpc.push([name, args]);
    if (calls.ledgerError) return { data: null, error: calls.ledgerError };
    // calls.ledger = every row; the mock pages it like billing_ledger (limit / offset)
    const all = calls.ledger as { rows: unknown[]; matching: number } | null;
    if (!all) return { data: null, error: null };
    const from = Number(args.p_offset), n = Number(args.p_limit);
    return { data: { ...all, rows: all.rows.slice(from, from + n) }, error: null };
  };
  const client = { from: (t: string) => { calls.from++; calls.table = t; return q; }, rpc };
  return { getSupabaseServerClient: () => client, getSupabaseWriteClient: () => client };
});
let GET: typeof import("./route").GET;
import { NAV_FIRST, NAV_SEARCH_LIMIT } from "@/app/(shell)/ops/clients/nav-orgs";

const staff = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" };
const get = async (qs: string) => (await GET(new Request(`https://app.aware-wave.com/api/ops/org-search${qs}`, { headers: staff }))).json();

beforeEach(async () => {
  Object.assign(calls, { select: [], or: [], limit: [], from: 0, eq: [], extra: null, neq: [], in: [], rpc: [], rows: null, ledger: null, ledgerError: null, internal: null, testRows: [], internalError: null, table: "", heldError: null, heldCalls: 0, heldRows: [], opsRows: [], resellRows: [], extraError: null });
  // a fresh route module: its ledger memory starts empty in every test
  vi.resetModules();
  ({ GET } = await import("./route"));
});

describe("GET /api/ops/org-search", () => {
  it("selects no whole metadata column and returns only the picker's fields", async () => {
    const body = await get("?q=ac");
    for (const col of calls.select.find((c) => c.includes("slug"))!.split(",")) expect(col.includes("metadata") ? col.includes("->") : true, col).toBe(true);
    expect(body.orgs.map((o: object) => Object.keys(o).sort())).toEqual([["brandColors", "color", "group", "id", "name", "slug"]]);
    expect(body.orgs[0].brandColors).toEqual(["#112233"]);   // a non-hex value is not a colour
  });

  it("is bounded: NAV_FIRST without q, NAV_SEARCH_LIMIT with q, nothing for a q of only stripped characters", async () => {
    await get("");
    await get("?q=ac");
    expect(calls.limit).toEqual([NAV_FIRST, 500, NAV_SEARCH_LIMIT]);   // 500 = the TEST organizations read
    expect(await get("?q=%22%2A%28%29")).toEqual({ ok: true, orgs: [], total: 0 });
    expect(calls.from).toBe(3);
  });

  const INC = "22222222-2222-4222-8222-222222222222";
  it("?include=<uuid> puts a client that is not in the page first, in the same columns", async () => {
    calls.extra = { id: INC, slug: "far", name: "Far", color: null, brandColors: null };
    const body = await get(`?include=${INC}`);
    expect(body.orgs.map((o: { id: string }) => o.id)).toEqual([INC, "o1"]);
    expect(calls.eq).toEqual([["id", INC]]);
    expect(calls.select[1]).toBe(calls.select[0]);
  });

  it("every row carries the analytics group hash, the same value analytics-context gives for that organization: search, first page, ?include= and category rows", async () => {
    const { organizationGroupId } = await import("@/lib/analytics-group");
    calls.extra = { id: INC, slug: "far", name: "Far", color: null, brandColors: null };
    const body = await get(`?include=${INC}`);
    expect(body.orgs.map((o: { id: string; group: string }) => [o.id, o.group])).toEqual([[INC, organizationGroupId(INC)], ["o1", organizationGroupId("o1")]]);
    const search = await get("?q=ac");
    expect(search.orgs[0].group).toBe(organizationGroupId("o1"));
    const C = "55555555-5555-4555-8555-555555555555";
    calls.rows = [{ id: C, slug: "acme", name: "Acme", color: null, brandColors: null }];
    calls.internal = { id: "o3" };
    calls.ledger = { rows: [], matching: 0 };
    const cat = await get("?category=all");
    expect(cat.orgs[0].group).toBe(organizationGroupId(C));
    const ctx = await (await import("../analytics-context/route")).GET(new Request("http://x/api/ops/analytics-context", { headers: { "x-ops-org-id": C, "x-ops-user-kind": "client" } })).then((r) => r.json());
    expect(cat.internalGroup).toBe(organizationGroupId("o3"));   // the internal org's hash rides the answer itself, not a first-page row
    expect(ctx.group).toBe(cat.orgs[0].group);   // one function, one value, on either route
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
    for (const o of body.orgs) expect(Object.keys(o).sort()).toEqual(["brandColors", "color", "group", "id", "name", "slug", "tags"]);
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
    for (const cat of ["attention", "contract", "credits"] as const) {
      calls.in = [];
      calls.ledger = ledger([lrow(C2, "customer", { balance: 3, reasons: ["frozen"], contracts: [{}] }), lrow(T1, "test", { balance: 9, reasons: ["frozen"], contracts: [{}] }),
        lrow(INTERNAL, "internal", { balance: 1, reasons: ["frozen"], contracts: [{}] }), lrow(C1, "customer", { balance: 1, reasons: ["past_due"], contracts: [{}] })]);
      calls.rows = [org(C1, "acme"), org(C2, "zeta")];   // the database's order; the answer keeps the ledger's
      const body = await get(`?category=${cat}`);
      expect(calls.in, cat).toEqual([["id", [C2, C1]]]);
      expect(body.orgs.map((o: { id: string }) => o.id), cat).toEqual([C2, C1]);
      expect(body.total, cat).toBe(2);
    }
    // one ledger read (mode 'all') answered all three
    expect(calls.rpc).toEqual([["billing_ledger", { p_filter: "all", p_query: "", p_limit: 200, p_offset: 0 }]]);
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

  it("the ledger read is reused for 60 seconds; a failed read is not kept", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      calls.rows = [org(C1, "acme")];
      calls.ledgerError = { message: "boom" };
      await get("?category=all");
      calls.ledgerError = null;
      calls.ledger = ledger([lrow(C1, "customer", { balance: 2 })]);
      const ok = await get("?category=all");
      expect(ok.orgs[0].tags).toEqual(["credits"]);   // the failure was not cached
      expect(calls.rpc).toHaveLength(2);
      vi.advanceTimersByTime(59_000);
      await get("?category=attention");
      await get("?category=all");
      expect(calls.rpc).toHaveLength(2);   // within 60 s: no new read
      vi.advanceTimersByTime(2_000);
      await get("?category=all");
      expect(calls.rpc).toHaveLength(3);
    } finally { vi.useRealTimers(); }
  });

  it("reads every ledger page, so tags cover every billing account; past the page limit the answer says tagsPartial", async () => {
    const many = Array.from({ length: 450 }, (_, i) => lrow(`acc-${i}`, "customer"));
    many[449] = lrow(C1, "customer", { balance: 4 });
    calls.ledger = ledger(many);
    calls.rows = [org(C1, "acme")];
    const body = await get("?category=all");
    expect(calls.rpc.map(([, a]) => a.p_offset)).toEqual([0, 200, 400]);
    expect(body.orgs[0].tags).toEqual(["credits"]);
    expect(body.tagsPartial).toBe(false);

    vi.resetModules();
    ({ GET } = await import("./route"));
    calls.rpc = [];
    // every page full and more matching: stop at 50 pages and say so
    const big = Array.from({ length: 50 * 200 + 1 }, (_, i) => lrow(`acc-${i}`, "customer"));
    calls.ledger = ledger(big);
    const partial = await get("?category=all");
    expect(calls.rpc).toHaveLength(50);
    expect(partial.tagsPartial).toBe(true);
  });

  it("a billing category's total counts the same rows its list is cut from (inactive / TEST left out)", async () => {
    const C2 = "55555555-5555-4555-8555-555555555555";
    const C3 = "66666666-6666-4666-8666-666666666666";
    calls.ledger = ledger([lrow(C1, "customer", { reasons: ["frozen"] }), lrow(C2, "customer", { reasons: ["frozen"] }), lrow(C3, "customer", { reasons: ["frozen"] })]);
    calls.rows = [org(C1, "acme"), org(C2, "beta")];   // C3 is inactive: the database leaves it out
    const body = await get("?category=attention");
    expect(body.orgs).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("a TEST organization's brands are hidden like it: one read of the TEST ids, then own kind and parent in the same query", async () => {
    calls.testRows = [{ id: T1 }];
    calls.rows = [org(C1, "acme")];
    calls.ledger = ledger([]);
    await get("?category=all");
    expect(calls.neq).toContainEqual(["kind", "test"]);
    expect(calls.or).toContain(`parent_organization_id.is.null,parent_organization_id.not.in.(${T1})`);
    calls.or = [];
    const BRAND = "77777777-7777-4777-8777-777777777777";
    calls.rows = [org(T1, "e2e", "test"), org(BRAND, "e2e-brand", "customer", T1)];
    const test = await get("?category=test");
    expect(calls.or).toEqual([`kind.eq.test,parent_organization_id.in.(${T1})`]);
    expect(test.orgs.map((o: { tags: string[] }) => o.tags)).toEqual([["test"], ["test"]]);
  });

  it("a search hides TEST too, and finds it only with ?category=test", async () => {
    calls.testRows = [{ id: T1 }];
    await get("?q=e2e");
    expect(calls.neq).toContainEqual(["kind", "test"]);
    expect(calls.or).toContain(`parent_organization_id.is.null,parent_organization_id.not.in.(${T1})`);
    calls.neq = []; calls.or = [];
    await get("?q=e2e&category=test");
    expect(calls.neq).not.toContainEqual(["kind", "test"]);
    expect(calls.or).toContain(`kind.eq.test,parent_organization_id.in.(${T1})`);
  });

  it("a failed internal-org read says so (internalOrgFailed) instead of dropping the row silently", async () => {
    calls.ledger = ledger([]);
    calls.internalError = { message: "boom" };
    const body = await get("?category=all");
    expect(body.internalOrgId).toBeNull();
    expect(body.internalOrgFailed).toBe(true);
    calls.internalError = null;
    calls.internal = { id: INTERNAL };
    expect((await get("?category=all")).internalOrgFailed).toBe(false);
  });

  // M3: 代操 / 經銷 come from the member-tags function; their buttons exist only when the data fills them
  const FUTURE = "2999-01-01T00:00:00Z", PAST = "2000-01-01T00:00:00Z";
  it("代操 and 經銷: no button while nothing is operated or resold; with data, the button, the tags and the category list", async () => {
    calls.ledger = ledger([lrow(C1, "customer", { contracts: [{ product_key: "content", status: "active" }] })]);
    calls.rows = [org(C1, "acme")];
    const none = await get("?category=all");
    expect(none.categories.map((c: { key: string }) => c.key)).toEqual(["all", "attention", "contract", "credits", "test"]);

    const C2 = "55555555-5555-4555-8555-555555555555";
    calls.ledger = ledger([lrow(C1, "customer", { contracts: [{ product_key: "content", status: "active" }] }), lrow(C2, "customer")]);
    calls.opsRows = [{ organization_id: C1, product_key: "content", operated_by: "awarewave" }];
    calls.resellRows = [{ organization_id: C2, product_key: "video", feature_key: "video.resell", source: "comp", source_ref: null, starts_at: PAST, ends_at: FUTURE, status: "active" }];
    vi.resetModules(); ({ GET } = await import("./route"));
    calls.rows = [org(C1, "acme"), org(C2, "beta")];
    const all = await get("?category=all");
    expect(all.categories.map((c: { key: string }) => c.key)).toEqual(["all", "attention", "contract", "credits", "operated", "resell", "test"]);
    expect(all.categories.find((c: { key: string }) => c.key === "operated").label).toBe("代操");
    expect(all.categories.find((c: { key: string }) => c.key === "resell").label).toBe("經銷");
    expect(all.orgs.map((o: { id: string; tags: string[] }) => [o.id, o.tags])).toEqual([[C1, ["contract", "operated"]], [C2, ["resell"]]]);
    calls.in = [];
    const operated = await get("?category=operated");
    expect(calls.in).toEqual([["id", [C1]]]);
    expect(operated.total).toBe(1);
    calls.in = [];
    await get("?category=resell");
    expect(calls.in).toEqual([["id", [C2]]]);
  });

  it("an expired resell right is not 經銷; a canceled subscription is not 訂閱", async () => {
    calls.ledger = ledger([lrow(C1, "customer", { contracts: [{ product_key: "content", status: "canceled" }] })]);
    calls.resellRows = [{ organization_id: C1, product_key: "video", feature_key: "video.resell", source: "comp", source_ref: null, starts_at: PAST, ends_at: PAST, status: "active" }];
    calls.rows = [org(C1, "acme")];
    const body = await get("?category=all");
    expect(body.orgs[0].tags).toEqual([]);
    expect(body.categories.map((c: { key: string }) => c.key)).not.toContain("resell");
  });

  it("a failed operations/resell read: 全部 still lists clients and says tagsFailed; a billing category fails", async () => {
    calls.rows = [org(C1, "acme")];
    calls.ledger = ledger([lrow(C1, "customer", { balance: 2 })]);
    calls.extraError = { message: "boom" };
    const all = await get("?category=all");
    expect(all.tagsFailed).toBe(true);
    expect(all.orgs).toHaveLength(1);
  });

  it("訂閱 includes an account that holds only contract-source rights (Soulful), by the grouped read -- not the right rows; a gift (贈送) or a credit pack is not 訂閱", async () => {
    const C2 = "55555555-5555-4555-8555-555555555555", C3 = "66666666-6666-4666-8666-666666666666";
    calls.ledger = ledger([lrow(C1, "customer"), lrow(C2, "customer"), lrow(C3, "customer")]);
    calls.heldRows = [
      { organization_id: C1, product_key: "content", source: "contract", pay: "" },
      { organization_id: C2, product_key: "content", source: "comp", pay: "" },
      { organization_id: C3, product_key: "design", source: "contract", pay: "credits" },
    ];
    calls.rows = [org(C1, "soulful"), org(C2, "edd"), org(C3, "pack")];
    const all = await get("?category=all");
    expect(all.orgs.map((o: { id: string; tags: string[] }) => [o.id, o.tags])).toEqual([[C1, ["contract"]], [C2, ["comp"]], [C3, ["credits"]]]);
    expect(calls.heldCalls).toBe(1);   // one grouped read answers every category; the 60 s reuse holds across the two calls below
    calls.in = [];
    const sub = await get("?category=contract");
    expect(calls.in).toEqual([["id", [C1]]]);
    expect(sub.total).toBe(1);
  });

  it("贈送: a comp-source account is tagged and gets the button; the internal account's comp rights do not", async () => {
    const C2 = "55555555-5555-4555-8555-555555555555";
    calls.ledger = ledger([lrow(C1, "customer"), lrow(INTERNAL, "internal")]);
    calls.heldRows = [
      { organization_id: C1, product_key: "content", source: "comp", pay: "" },
      { organization_id: INTERNAL, product_key: "content", source: "comp", pay: "" },
    ];
    calls.rows = [org(C1, "edd"), org(C2, "other")];
    const all = await get("?category=all");
    expect(all.categories.map((c: { key: string; label: string }) => [c.key, c.label]).filter(([k]: string[]) => k === "comp")).toEqual([["comp", "贈送"]]);
    expect(all.orgs[0].tags).toEqual(["comp"]);
    calls.in = [];
    const gift = await get("?category=comp");
    expect(calls.in).toEqual([["id", [C1]]]);
    expect(gift.total).toBe(1);
  });

  it("migration 0179 not applied (the rpc is missing): 全部 still answers the clients with tagsFailed, no button for 贈送", async () => {
    calls.rows = [org(C1, "acme")];
    calls.ledger = ledger([lrow(C1, "customer", { balance: 2 })]);
    calls.heldError = { message: "Could not find the function public.entitlement_held_products() in the schema cache" };
    const all = await get("?category=all");
    expect(all.ok).toBe(true);
    expect(all.tagsFailed).toBe(true);
    expect(all.orgs.map((o: { id: string }) => o.id)).toEqual([C1]);
    expect(all.categories.map((c: { key: string }) => c.key)).not.toContain("comp");
  });
});
