// Card SF-J2: a client_credentials row the site flow wrote (metadata.source = site-flow, the wp-bridge key) cannot be
// changed or deleted from the client page -- metadata PATCH/DELETE and secret POST/DELETE all answer 409 and touch
// neither the row nor the vault -- while an ordinary row behaves as before. GET marks the flow's row managedBy.
// (Lives here, not beside the routes: the repo's sensitive-file hook refuses writes under a .../credentials/ path.)
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
const FLOW = "11111111-1111-4111-8111-111111111111";
const PLAIN = "22222222-2222-4222-8222-222222222222";

const vault = vi.hoisted(() => ({
  putSecret: vi.fn(async (name: string) => name),
  deleteSecret: vi.fn(async () => true),
  clientCredSecretRef: (id: string) => `client_cred:${id}`,
}));
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock("@/lib/secret-vault", () => vault);
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      let op: { kind: "update"; patch: Row } | { kind: "delete" } | { kind: "insert"; row: Row } | null = null;
      const hit = () => store.rows.filter((r) => filters.every((f) => f(r)));
      const run = () => {
        const rows = hit();
        if (op?.kind === "update") for (const r of rows) Object.assign(r, op.patch);
        if (op?.kind === "delete") store.rows = store.rows.filter((r) => !rows.includes(r));
        if (op?.kind === "insert") { store.rows.push(op.row); return [op.row]; }
        return rows;
      };
      const q: Row = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        order: () => q,
        limit: () => q,
        update: (patch: Row) => ((op = { kind: "update", patch }), q),
        delete: () => ((op = { kind: "delete" }), q),
        insert: (row: Row) => ((op = { kind: "insert", row: { id: "new", ...row } }), q),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        single: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: run(), error: null }),
      };
      return q;
    },
  }),
}));

const route = await import("@/app/api/ops/clients/credentials/route");
const secret = await import("@/app/api/ops/clients/credentials/secret/route");

const seed = () => [
  { id: FLOW, client_id: ORG, category: "cms", label: "WordPress AI 控制通道金鑰（oracle.aware-wave.com）", identifier: "aw-1", note: null, secret_ref: `client_cred:${FLOW}`, metadata: { source: "site-flow", key_id: "aw-1" }, sort_order: 0 },
  { id: PLAIN, client_id: ORG, category: "cms", label: "WP admin", identifier: "admin", note: null, secret_ref: `client_cred:${PLAIN}`, metadata: {}, sort_order: 0 },
];
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", "x-ops-claims-role": "admin", "x-ops-user-kind": "staff" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  store.rows = seed();
});

describe("site-flow credential rows are the flow's", () => {
  it("GET marks the flow's row managedBy site_flow and the ordinary row null", async () => {
    const j = await (await route.GET(req("GET", `/api/ops/clients/credentials?clientId=${ORG}`))).json();
    const by = Object.fromEntries((j.credentials as Row[]).map((c) => [c.id, c.managedBy]));
    expect(by).toEqual({ [FLOW]: "site_flow", [PLAIN]: null });
  });

  it("the flow's row: PATCH, DELETE, secret POST and secret DELETE all answer 409 and change nothing", async () => {
    const before = structuredClone(store.rows);
    const answers = [
      await route.PATCH(req("PATCH", "/api/ops/clients/credentials", { id: FLOW, label: "renamed" })),
      await route.DELETE(req("DELETE", `/api/ops/clients/credentials?id=${FLOW}`)),
      await secret.POST(req("POST", "/api/ops/clients/credentials/secret", { credentialId: FLOW, value: "overwrite-me" })),
      await secret.DELETE(req("DELETE", `/api/ops/clients/credentials/secret?credentialId=${FLOW}`)),
    ];
    for (const res of answers) {
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("managed_by_site_flow");
    }
    expect(store.rows).toEqual(before);
    expect(vault.putSecret).not.toHaveBeenCalled();
    expect(vault.deleteSecret).not.toHaveBeenCalled();
  });

  it("an ordinary row is renamed, its secret replaced, and deleted as before", async () => {
    expect((await route.PATCH(req("PATCH", "/api/ops/clients/credentials", { id: PLAIN, label: "renamed" }))).status).toBe(200);
    expect(store.rows.find((r) => r.id === PLAIN)?.label).toBe("renamed");
    expect((await secret.POST(req("POST", "/api/ops/clients/credentials/secret", { credentialId: PLAIN, value: "new-pass" }))).status).toBe(200);
    expect(vault.putSecret).toHaveBeenCalledWith(`client_cred:${PLAIN}`, "new-pass");
    expect((await route.DELETE(req("DELETE", `/api/ops/clients/credentials?id=${PLAIN}`))).status).toBe(200);
    expect(store.rows.map((r) => r.id)).toEqual([FLOW]);
  });

  it("no hand-made row may carry the flow's mark (it would lock itself)", async () => {
    const post = await route.POST(req("POST", "/api/ops/clients/credentials", { clientId: ORG, label: "x", metadata: { source: "site-flow" } }));
    expect(post.status).toBe(400);
    const patch = await route.PATCH(req("PATCH", "/api/ops/clients/credentials", { id: PLAIN, metadata: { source: "site-flow" } }));
    expect(patch.status).toBe(400);
    expect(store.rows).toHaveLength(2);
    expect(store.rows.find((r) => r.id === PLAIN)?.metadata).toEqual({});
  });
});
