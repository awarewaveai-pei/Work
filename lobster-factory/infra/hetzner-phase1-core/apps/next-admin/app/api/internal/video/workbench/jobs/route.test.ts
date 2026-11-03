// video-workbench job ledger (P6 D1/D3): token deny paths fail closed on both methods; an upsert never clears a cancel;
// status only moves forward, terminal is final, absent fields never null recorded ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory media_workbench_jobs enforcing what 0159 enforces and the route relies on: input NOT NULL (default '{}'),
// unique (organization_id, idempotency_key), and eq filters on update (the status guard).
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ rows: [] as Row[], calls: [] as Array<{ op: string; row?: Row }>, beforeWrite: null as null | (() => void) }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ from: () => {
    const filters: Array<[string, unknown]> = [];
    let op: { kind: "select" | "insert" | "update"; row?: Row } = { kind: "select" };
    const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
    const run = (): { data: Row[] | null; error: { code: string } | null } => {
      if (op.kind === "select") return { data: db.rows.filter(match), error: null };
      const hook = db.beforeWrite; db.beforeWrite = null; hook?.();
      const row = Object.fromEntries(Object.entries(op.row ?? {}).filter(([, v]) => v !== undefined));   // JSON drops undefined
      if (row.input === null) return { data: null, error: { code: "23502" } };
      if (op.kind === "insert") {
        const full: Row = { id: `j${db.rows.length + 1}`, input: {}, attempt: 1, cancel_requested: false, cost_usd: null, result_asset_id: null, error: null, ...row };
        if (db.rows.some((r) => r.organization_id === full.organization_id && r.idempotency_key === full.idempotency_key)) return { data: null, error: { code: "23505" } };
        db.rows.push(full);
        return { data: [full], error: null };
      }
      const hit = db.rows.filter(match);
      for (const r of hit) Object.assign(r, row);
      return { data: hit, error: null };
    };
    const one = (strict: boolean) => async () => {
      const res = run();
      if (res.error) return { data: null, error: res.error };
      const d = res.data?.[0] ?? null;
      return strict && !d ? { data: null, error: { code: "PGRST116" } } : { data: d ? { ...d } : null, error: null };
    };
    const q = { select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      is: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      insert: (row: Row) => { db.calls.push({ op: "insert", row }); op = { kind: "insert", row }; return q; },
      update: (row: Row) => { db.calls.push({ op: "update", row }); op = { kind: "update", row }; return q; },
      single: one(true), maybeSingle: one(false),
      then: (ok: (v: unknown) => unknown) => ok(run()) };
    return q;
  } }),
}));
import { GET, POST } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const at = "http://next-admin:3000/api/internal/video/workbench/jobs";
const post = (headers: Record<string, string>, body: unknown) => POST(new Request(at, { method: "POST", headers, body: JSON.stringify(body) }));
const get = (headers: Record<string, string>) => GET(new Request(`${at}?organizationId=${ORG}`, { headers }));
const auth = { authorization: "Bearer right-token" };
const job = { action: "upsert", organizationId: ORG, idempotencyKey: "job-1", kind: "image", status: "running" };

beforeEach(() => { db.rows = []; db.calls = []; db.beforeWrite = null; vi.stubEnv("VW_INTERNAL_TOKEN", "right-token"); });
afterEach(() => vi.unstubAllEnvs());

describe("/api/internal/video/workbench/jobs", () => {
  it("VW_INTERNAL_TOKEN unset: POST and GET refuse even a bearer", async () => {
    vi.stubEnv("VW_INTERNAL_TOKEN", "");
    expect((await post(auth, job)).status).toBe(401);
    expect((await get(auth)).status).toBe(401);
  });

  it("no bearer or a wrong one is refused on both methods, and nothing touches the table", async () => {
    for (const h of [{}, { authorization: "Bearer wrong" }]) {
      expect((await post(h, job)).status).toBe(401);
      expect((await get(h)).status).toBe(401);
    }
    expect(db.calls).toEqual([]);
  });

  it("an upsert never writes cancel_requested (a worker cannot clear a cancel); cancel sets it", async () => {
    expect((await post(auth, job)).status).toBe(200);
    expect(db.calls[0].row).not.toHaveProperty("cancel_requested");
    expect((await post(auth, { action: "cancel", organizationId: ORG, idempotencyKey: "job-1" })).status).toBe(200);
    expect(db.calls[1]).toMatchObject({ op: "update", row: { cancel_requested: true } });
    expect((await post(auth, { ...job, status: "succeeded" })).status).toBe(200);
    expect(db.rows[0]).toMatchObject({ status: "succeeded", cancel_requested: true });
  });

  it("a job without input is created with the column default {} (input is NOT NULL)", async () => {
    const res = await post(auth, job);
    expect(res.status).toBe(200);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].input).toEqual({});
  });

  it("out-of-order delivery: a late running update neither reopens a succeeded job nor clears its cost or result", async () => {
    const asset = "22222222-2222-4222-8222-222222222222";
    expect((await post(auth, { ...job, status: "queued", input: { prompt: "p" } })).status).toBe(200);
    expect((await post(auth, { ...job, status: "succeeded", costUsd: 0.35, resultAssetId: asset })).status).toBe(200);
    const late = await (await post(auth, { ...job, status: "running" })).json();
    expect(late).toMatchObject({ ok: true, applied: false, job: { status: "succeeded" } });
    expect((await post(auth, { ...job, status: "queued" })).status).toBe(200);
    expect((await post(auth, { ...job, status: "failed", error: "late" })).status).toBe(200);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ status: "succeeded", cost_usd: 0.35, result_asset_id: asset, error: null, input: { prompt: "p" } });
  });

  it("forward moves without a field keep what an earlier update recorded; running cannot go back to queued", async () => {
    await post(auth, { ...job, status: "running", costUsd: 0.1 });
    await post(auth, { ...job, status: "queued" });
    expect(db.rows[0]).toMatchObject({ status: "running", cost_usd: 0.1 });
    await post(auth, { ...job, status: "failed", error: "boom" });
    expect(db.rows[0]).toMatchObject({ status: "failed", cost_usd: 0.1, error: "boom" });
  });

  it("two first submits racing: the loser hits the unique key and applies as an update, never a second row", async () => {
    db.beforeWrite = () => { db.rows.push({ id: "winner", organization_id: ORG, idempotency_key: "job-1", kind: "image", status: "succeeded", cost_usd: 0.2, input: {} }); };
    const res = await (await post(auth, { ...job, status: "running" })).json();
    expect(res).toMatchObject({ ok: true, applied: false, job: { id: "winner", status: "succeeded" } });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ status: "succeeded", cost_usd: 0.2 });
  });

  it("a status change between the read and the update makes the guarded update match nothing; the retry sees the terminal row", async () => {
    await post(auth, { ...job, status: "running" });
    db.beforeWrite = () => { Object.assign(db.rows[0], { status: "cancelled" }); };
    const res = await (await post(auth, { ...job, status: "succeeded", costUsd: 1 })).json();
    expect(res).toMatchObject({ ok: true, applied: false, job: { status: "cancelled", cost_usd: 1 } });
    expect(db.rows[0]).toMatchObject({ status: "cancelled", cost_usd: 1 });
  });

  it("a terminal job stays final, but a cost it lacks is recorded once (a cancelled job may already be billed)", async () => {
    const asset = "22222222-2222-4222-8222-222222222222";
    await post(auth, { ...job, status: "running" });
    expect((await post(auth, { action: "cancel", organizationId: ORG, idempotencyKey: "job-1" })).status).toBe(200);
    await post(auth, { ...job, status: "cancelled" });
    const late = await (await post(auth, { ...job, status: "succeeded", costUsd: 0.04, resultAssetId: asset, error: "x" })).json();
    expect(late).toMatchObject({ ok: true, applied: false, costRecorded: true });
    expect(db.rows[0]).toMatchObject({ status: "cancelled", cost_usd: 0.04, result_asset_id: null, error: null });
    const again = await (await post(auth, { ...job, status: "failed", costUsd: 9 })).json();
    expect(again).toMatchObject({ applied: false });
    expect(again.costRecorded).toBeUndefined();
    expect(db.rows[0]).toMatchObject({ status: "cancelled", cost_usd: 0.04 });
  });
});
