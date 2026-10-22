// GET list: a 78-card deck showed 「60 / 60」 and 「FLUX schnell (60)」 (60-row cap, counts from the page).
// The fake below evaluates the real PostgREST filter calls (eq / in / or-trees / order / limit / HEAD
// count) over in-memory rows, so paging and counts are checked against what the route actually asks for.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

type Row = Record<string, unknown> & { id: string; created_at: string; metadata: Record<string, unknown> };
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

type Pred = (r: Row) => boolean;

function col(r: Row, c: string): unknown {
  if (c.includes("->>")) {
    const [base, key] = c.split("->>");
    const v = (r[base] as Record<string, unknown> | null)?.[key];
    return v == null ? null : String(v);
  }
  return r[c];
}

function leaf(c: string, op: string, raw: unknown): Pred {
  const v = typeof raw === "string" ? raw.replace(/^"(.*)"$/, "$1") : raw;
  return (r) => {
    const x = col(r, c) as string | null;
    switch (op) {
      case "eq": return x === v || (typeof x === "boolean" && x === v);
      case "neq": return x !== null && x !== v;
      case "lt": return x !== null && x < (v as string);
      case "gt": return x !== null && x > (v as string);
      case "gte": return x !== null && x >= (v as string);
      case "is": return v === null || v === "null" ? x === null : x === v;
      case "in": return (v as string[]).includes(x as string);
      case "like": return x !== null && new RegExp(`^${(v as string).replace(/%/g, ".*")}$`).test(x);
      default: throw new Error(`fake: unsupported op ${op}`);
    }
  };
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quoted = false, cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseTree(expr: string): Pred {
  const m = /^(and|or)\(([\s\S]*)\)$/.exec(expr);
  if (m) {
    const parts = splitTop(m[2]).map(parseTree);
    return m[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const l = /^(.+?)\.(eq|neq|lt|gt|lte|gte|is|in|like)\.([\s\S]*)$/.exec(expr);
  if (!l) throw new Error(`fake: cannot parse ${expr}`);
  return leaf(l[1], l[2], l[3]);
}

function makeQuery(columns: string, opts?: { count?: string; head?: boolean }) {
  const preds: Pred[] = [];
  const orders: { c: string; asc: boolean }[] = [];
  let limit = Infinity;
  const q = {
    eq: (c: string, v: unknown) => (preds.push(leaf(c, "eq", v)), q),
    like: (c: string, v: string) => (preds.push(leaf(c, "like", v)), q),
    in: (c: string, v: string[]) => (preds.push(leaf(c, "in", v)), q),
    gte: (c: string, v: string) => (preds.push(leaf(c, "gte", v)), q),
    gt: (c: string, v: string) => (preds.push(leaf(c, "gt", v)), q),
    neq: (c: string, v: string) => (preds.push(leaf(c, "neq", v)), q),
    not: (c: string, op: string, v: unknown) => { const p = leaf(c, op, v); preds.push((r) => !p(r)); return q; },
    or: (expr: string) => (preds.push(parseTree(`or(${expr})`)), q),
    order: (c: string, o: { ascending: boolean }) => (orders.push({ c, asc: o.ascending }), q),
    limit: (n: number) => ((limit = n), q),
    then: (resolve: (v: unknown) => void) => {
      let rows = (db.rows as Row[]).filter((r) => preds.every((p) => p(r)));
      if (opts?.head) return resolve({ count: rows.length, error: null, data: null });
      rows = [...rows].sort((a, b) => {
        for (const o of orders) {
          const x = String(col(a, o.c)), y = String(col(b, o.c));
          if (x !== y) return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
        }
        return 0;
      });
      const alias = /^(\w+):(.+)$/.exec(columns);
      const data = rows.slice(0, limit).map((r) => (alias ? { [alias[1]]: col(r, alias[2]) } : r));
      return resolve({ data, error: null });
    },
  };
  return q;
}

vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/storage/r2", () => ({}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => ({ select: makeQuery }) }),
  getSupabaseReadClient: () => null,
}));
// Caller is bound to ORG_A (a client account): every list and count must stay inside it.
vi.mock("../../../../lib/tenant-guard", () => ({
  effectiveOrgId: () => ORG_A,
  assertOrgAccess: () => {},
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));

const { GET } = await import("./route");

function asset(i: number, org: string, source: string, model: string | null): Record<string, unknown> {
  // Pairs share a timestamp so the (created_at, id) tie-break is exercised at the page boundary.
  const sec = String(Math.floor(i / 2)).padStart(2, "0");
  return {
    id: `${org.slice(0, 8)}-0000-4000-8000-${String(i).padStart(12, "0")}`,
    organization_id: org,
    storage_backend: "r2",
    asset_domain: "ai_generated",
    mime_type: "image/webp",
    is_current: true,
    created_at: `2026-10-21T07:${String(7 + Math.floor(i / 120)).padStart(2, "0")}:${sec}.123456+00:00`,
    metadata: { source, model_name: model },
  };
}

async function list(params: string) {
  const res = await GET(new Request(`http://localhost/api/tools/designs?group=design&${params}`));
  return (await res.json()) as {
    ok: boolean;
    assets: { id: string }[];
    nextCursor: string | null;
    total?: number;
    facets?: {
      model: Record<string, number>;
      product: Record<string, number>;
      theme: Record<string, number>;
      all: Record<"model" | "product" | "theme" | "brand", number>;
    };
  };
}

beforeEach(() => {
  process.env.POD_DESIGNS_ENABLED = "true";
  db.rows = [
    ...Array.from({ length: 78 }, (_, i) => asset(i, ORG_A, "tarot", "flux-schnell")),
    ...Array.from({ length: 3 }, (_, i) => asset(100 + i, ORG_A, "tarot-preview", null)),
    // Another organization's deck: must never appear in the list or the counts.
    ...Array.from({ length: 5 }, (_, i) => asset(i, ORG_B, "tarot", "flux-schnell")),
  ];
});

describe("GET /api/tools/designs list", () => {
  it("second page continues after the first with no duplicate and no gap", async () => {
    const p1 = await list("counts=1");
    expect(p1.ok).toBe(true);
    expect(p1.assets).toHaveLength(60);
    expect(p1.nextCursor).toBeTruthy();

    const p2 = await list(`cursor=${encodeURIComponent(p1.nextCursor!)}`);
    expect(p2.ok).toBe(true);
    expect(p2.nextCursor).toBeNull();

    const expected = (db.rows as Row[])
      .filter((r) => r.organization_id === ORG_A)
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1))
      .map((r) => r.id);
    expect([...p1.assets, ...p2.assets].map((a) => a.id)).toEqual(expected); // 81 rows, in order, each once
  });

  it("counts are DB totals for the filter set, not the loaded page", async () => {
    const p1 = await list("counts=1");
    expect(p1.assets).toHaveLength(60);
    expect(p1.total).toBe(81);
    expect(p1.facets?.model["flux-schnell"]).toBe(78);
    expect(p1.facets?.product["tarot-card"]).toBe(81);
  });

  it("keeps the chip set fixed when another filter is picked, and each 全部 is its own row's total (2026-10-22)", async () => {
    const tee = (i: number, theme: string | null) => {
      const r = asset(200 + i, ORG_A, "pod-studio", "flux-dev");
      r.metadata = { ...(r.metadata as object), product_type: "tshirt", ...(theme ? { theme } : {}) };
      return r;
    };
    db.rows.push(tee(0, "Art therapy"), tee(1, "Art therapy"), tee(2, null), asset(300, ORG_A, "tarot-preview-edit", null));

    const all = await list("counts=1");
    expect(all.facets?.product["tarot-card"]).toBe(82); // tarot-preview-edit is tarot art
    expect(all.facets?.product.tshirt).toBe(3);
    expect(all.facets?.theme["Art therapy"]).toBe(2);

    // Picking 塔羅牌 must not drop the 主題 row or the T-shirt chip; their counts become what clicking gives.
    const tarot = await list("counts=1&product=tarot-card");
    expect(tarot.total).toBe(82);
    expect(Object.keys(tarot.facets!.theme)).toEqual(["Art therapy"]);
    expect(tarot.facets?.theme["Art therapy"]).toBe(0);
    expect(tarot.facets?.product.tshirt).toBe(3);
    // 全部 of the product row ignores the product pick; 全部 of the theme row is the tarot total.
    expect(tarot.facets?.all.product).toBe(85);
    expect(tarot.facets?.all.theme).toBe(82);
  });

  it("lists a theme that only appears after 2000 rows of another theme (Codex 2026-10-22)", async () => {
    const themed = (i: number, theme: string) => {
      const r = asset(1000 + i, ORG_A, "pod-studio", "flux-dev");
      r.metadata = { ...(r.metadata as object), product_type: "tshirt", theme };
      return r;
    };
    for (let i = 0; i < 2001; i++) db.rows.push(themed(i, "Alpha"));
    db.rows.push(themed(2001, "Zulu"));
    const res = await list("counts=1");
    expect(Object.keys(res.facets!.theme)).toEqual(["Alpha", "Zulu"]);
  });
});
