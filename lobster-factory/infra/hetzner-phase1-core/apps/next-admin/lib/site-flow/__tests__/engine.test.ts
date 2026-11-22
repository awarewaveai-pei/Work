// lib/site-flow/engine.ts against an in-memory PostgREST fake and a fake host gate (card SF-G acceptance,
// SITE-FLOW-COMPLETION-PLAN.md §3 SF-G row). Migration 0175 is not assumed applied: catalog rows are seeded here.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const modeGate = vi.hoisted(() => ({ allowed: true, mode: "normal" }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: vi.fn(async () => ({ allowed: modeGate.allowed, mode: modeGate.mode })),
}));

import { executeStep, getSiteFlowStatus, planHash, pollRun, reclaimStaleRuns, type EngineDeps } from "../engine";
import type { SiteGateClient } from "../gate-client";
import type { EnvironmentRow, SiteRow, SiteStepDefinition, StepObservation, StepPlan } from "../types";

type Row = Record<string, unknown>;
const T0 = Date.parse("2026-11-22T10:00:00Z");

function fakeDb(seed: Record<string, Row[]> = {}, opts: { failRunInsert?: boolean } = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let patch: Row = {};
    let inserted: Row = {};
    let order: { col: string; asc: boolean } | null = null;
    let lim = Infinity;
    const matching = () => {
      const m = rows.filter((r) => filters.every((f) => f(r)));
      if (order) {
        const { col, asc } = order;
        m.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return m.slice(0, lim);
    };
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      insert: (row: Row) => ((op = "insert"), (inserted = row), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        // Yield first, so two concurrent callers interleave between their read and their write as in production.
        void Promise.resolve().then(() => {
          if (op === "insert") {
            if (table === "ops_action_runs" && opts.failRunInsert) return resolve({ error: { message: "insert refused" } });
            rows.push({ started_at: new Date(T0).toISOString(), ended_at: null, error_summary: null, output_payload: {}, ...inserted });
            return resolve({ error: null });
          }
          if (op === "update") {
            const m = matching();
            for (const r of m) Object.assign(r, patch);
            return resolve({ data: m.map((r) => ({ id: r.id })), error: null });
          }
          resolve({ data: matching(), error: null });
        });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables };
}

const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const ENV_ID = "7a1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const site: SiteRow = { id: SITE_ID, organization_id: ORG, workspace_id: "ws", project_id: "pj", name: "Acme", primary_domain: null, metadata: {} };
const environment: EnvironmentRow = {
  id: ENV_ID,
  site_id: SITE_ID,
  organization_id: ORG,
  environment_type: "production",
  hosting_provider: "ks-aw-01-docker",
  base_url: "https://acme.example.com",
  wp_root_path: null,
  status: "provisioning",
  metadata: { host_slug: "acme" },
};
const catalog = (enabled: boolean) => [
  { id: "cat-create", action_key: "site.create", enabled },
  { id: "cat-preflight", action_key: "site.preflight", enabled: true },
];

function fakeGate() {
  const calls: string[] = [];
  const gate: SiteGateClient = {
    provider: "ks-aw-01-docker",
    preflight: async () => (calls.push("preflight"), { ok: true, data: {} }),
    create: async () => (calls.push("create"), { ok: true, data: { jobId: "sj-20261122100000-0123abcd" } }),
    vhost: async () => (calls.push("vhost"), { ok: true, data: {} }),
    wp: async (sub) => (calls.push(`wp ${sub}`), { ok: true, data: {} }),
    job: async () => (calls.push("job"), { ok: true, data: { state: "succeeded", detail: "healthy" } }),
  };
  return { gate, calls };
}

const PLAN: StepPlan = { summary: "建立容器", items: [{ label: "容器", value: "acme-wp" }], rollback: "compose down", params: { slug: "acme" } };

/** A step whose stages all go through the gate, so "gate calls" = "host touched". */
function step(over: Partial<SiteStepDefinition> = {}, observation: StepObservation = { status: "absent", detail: "沒有容器" }) {
  const spy = { rollback: 0, verify: 0 };
  const def: SiteStepDefinition = {
    key: "create",
    title: "建立網站主機",
    requires: [],
    timeoutMs: 15 * 60_000,
    observe: async () => observation,
    precheck: async ({ gate }) => ((await gate.preflight()), { ok: true, detail: "ok" }),
    plan: async () => PLAN,
    execute: async ({ gate }) => ((await gate.vhost()), { ok: true, detail: "done" }),
    verify: async () => (spy.verify++, { ok: true, detail: "healthy" }),
    rollback: async () => (spy.rollback++, { ok: true, detail: "rolled back" }),
    ...over,
  };
  return { def, spy };
}

function deps(db: SupabaseClient, def: SiteStepDefinition, gate: SiteGateClient, now = T0): EngineDeps {
  return { db, steps: { [def.key]: def }, gateFor: () => gate, now: () => now };
}

const actor = { role: "owner" as const, userId: "u-1" };
const HASH = planHash("create", ENV_ID, PLAN);
const runs = (t: Record<string, Row[]>) => t.ops_action_runs ?? [];

beforeEach(() => {
  modeGate.allowed = true;
  modeGate.mode = "normal";
});

describe("executeStep", () => {
  it("runs precheck -> execute -> verify, records one completed approved run", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    const { def } = step();
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, outcome: "completed" });
    expect(runs(tables)).toHaveLength(1);
    expect(runs(tables)[0]).toMatchObject({ status: "completed", approval_status: "approved", environment_id: ENV_ID, action_id: "cat-create" });
    expect((runs(tables)[0].metadata as Row).actor_user_id).toBe("u-1");
    expect(runs(tables)[0].actor_user_id).toBeUndefined();
  });

  it("a plan hash that no longer matches is 409 and nothing runs on the host", async () => {
    const { db } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate, calls } = fakeGate();
    const { def } = step();
    const stale = planHash("create", ENV_ID, { ...PLAN, params: { slug: "other" } });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: stale, actor });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "plan_changed", planHash: HASH });
    expect(calls).toEqual([]);
  });

  it("catalog switched off: refused, and a blocked run is left", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(false) });
    const { gate, calls } = fakeGate();
    const r = await executeStep(deps(db, step().def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "step_disabled" });
    expect(runs(tables)).toHaveLength(1);
    expect(runs(tables)[0]).toMatchObject({ status: "blocked", error_summary: "step_disabled" });
    expect(calls).toEqual([]);
  });

  it("no catalog row: refused, no row is seeded and no run is written", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: [] });
    const { gate, calls } = fakeGate();
    const r = await executeStep(deps(db, step().def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "step_not_registered" });
    expect(tables.ops_action_catalog).toEqual([]);
    expect(runs(tables)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("the run record cannot be written: the gate is never called", async () => {
    const { db } = fakeDb({ ops_action_catalog: catalog(true) }, { failRunInsert: true });
    const { gate, calls } = fakeGate();
    const { def, spy } = step();
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: "run_record_failed" });
    expect(calls).toHaveLength(0);
    expect(spy).toEqual({ rollback: 0, verify: 0 });
  });

  it("system mode blocks: 423 and a blocked run is left", async () => {
    modeGate.allowed = false;
    modeGate.mode = "emergency_stop";
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate, calls } = fakeGate();
    const r = await executeStep(deps(db, step().def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(423);
    expect(r.body).toMatchObject({ code: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(runs(tables)).toHaveLength(1);
    expect(runs(tables)[0]).toMatchObject({ status: "blocked", error_summary: "system_mode_blocks_change: emergency_stop" });
    expect(calls).toEqual([]);
  });

  it("verify fails: rollback is called and the run ends failed", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    const { def, spy } = step({ verify: async () => ({ ok: false, detail: "container unhealthy" }) });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.body).toMatchObject({ ok: false, outcome: "failed", reason: "verify_failed" });
    expect(spy.rollback).toBe(1);
    expect(runs(tables)[0]).toMatchObject({ status: "failed", error_summary: "verify_failed" });
  });

  it("another step live on the same environment: 409, this one is cancelled before touching the host", async () => {
    const live = { id: "r-live", action_id: "cat-preflight", environment_id: ENV_ID, status: "running", started_at: new Date(T0 - 60_000).toISOString() };
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [live] });
    const { gate, calls } = fakeGate();
    const r = await executeStep(deps(db, step().def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "another_step_running" });
    expect(calls).toEqual([]);
    expect(runs(tables).find((x) => x.id === "r-live")?.status).toBe("running");
    expect(runs(tables).find((x) => x.id !== "r-live")?.status).toBe("cancelled");
  });

  it("a required step not observed done: 409, cancelled, the host is not touched", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate, calls } = fakeGate();
    const { def } = step({ requires: ["preflight"] });
    const pre = step({ key: "preflight", observe: async () => ({ status: "absent", detail: "未檢查" }) }).def;
    const r = await executeStep({ ...deps(db, def, gate), steps: { create: def, preflight: pre } }, { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "prerequisite_not_done", missing: ["preflight"] });
    expect(runs(tables)[0].status).toBe("cancelled");
    expect(calls).toEqual([]);
  });

  it("the run was reclaimed while the step ran: no rollback, 409 run_reclaimed", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    const { def, spy } = step({
      verify: async () => {
        runs(tables)[0].status = "failed"; // another request closed it as timed out
        return { ok: false, detail: "unhealthy" };
      },
    });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "run_reclaimed" });
    expect(spy.rollback).toBe(0);
  });

  it("reveal (one-time password) is in the response and in no stored row", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    const { def } = step({ execute: async () => ({ ok: true, detail: "installed", reveal: { adminPassword: "s3cret-once" } }) });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.body).toMatchObject({ ok: true, reveal: { adminPassword: "s3cret-once" } });
    expect(JSON.stringify(tables)).not.toContain("s3cret-once");
  });

  it("a background job keeps the run running; polling finishes it after verify", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    const { def, spy } = step({ execute: async ({ gate: g }) => {
      const c = await g.create();
      return "error" in c ? { ok: false, detail: c.detail } : { ok: true, detail: "job started", jobId: c.data.jobId };
    } });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.status).toBe(202);
    const runId = String(r.body.runId);
    expect(runs(tables)[0]).toMatchObject({ status: "running", metadata: expect.objectContaining({ host_job_id: "sj-20261122100000-0123abcd" }) });
    const p = await pollRun(deps(db, def, gate), { site, environment, step: "create", runId });
    expect(p.body).toMatchObject({ ok: true, run: { status: "completed" } });
    expect(spy.verify).toBe(1);
  });
});

describe("pollRun", () => {
  it("two polls finishing the same failed job at once: one claims it, rollback runs once", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true) });
    const { gate } = fakeGate();
    gate.job = async () => ({ ok: true, data: { state: "failed", detail: "compose up failed" } });
    const { def, spy } = step({ execute: async () => ({ ok: true, detail: "job started", jobId: "sj-20261122100000-0123abcd" }) });
    const r = await executeStep(deps(db, def, gate), { site, environment, step: "create", planHash: HASH, actor });
    const runId = String(r.body.runId);
    await Promise.all([1, 2].map(() => pollRun(deps(db, def, gate), { site, environment, step: "create", runId })));
    expect(spy.rollback).toBe(1);
    expect(runs(tables)[0]).toMatchObject({ status: "failed", error_summary: "job_failed" });
  });
});

describe("stale running runs (process killed mid-step)", () => {
  const stale = (id: string, ageMs: number) => ({ id, action_id: "cat-create", environment_id: ENV_ID, status: "running", started_at: new Date(T0 - ageMs).toISOString(), output_payload: {} });

  it("a run past the step timeout is closed as failed and the step can run again", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [stale("r-old", 20 * 60_000)] });
    const { gate } = fakeGate();
    const r = await executeStep(deps(db, step().def, gate), { site, environment, step: "create", planHash: HASH, actor });
    expect(r.body).toMatchObject({ ok: true, outcome: "completed" });
    const old = runs(tables).find((x) => x.id === "r-old");
    expect(old).toMatchObject({ status: "failed" });
    expect(String(old?.error_summary)).toMatch(/^timed out/);
  });

  it("a run inside the timeout is left alone", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [stale("r-young", 5 * 60_000)] });
    const closed = await reclaimStaleRuns(db, { actionId: "cat-create", environmentId: ENV_ID, timeoutMs: 15 * 60_000, now: T0 });
    expect(closed).toEqual([]);
    expect(runs(tables)[0].status).toBe("running");
  });

  it("two concurrent reclaims close the run once", async () => {
    const { db } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [stale("r-old", 20 * 60_000)] });
    const args = { actionId: "cat-create", environmentId: ENV_ID, timeoutMs: 15 * 60_000, now: T0 };
    const [a, b] = await Promise.all([reclaimStaleRuns(db, args), reclaimStaleRuns(db, args)]);
    expect([...a, ...b]).toEqual(["r-old"]);
  });
});

describe("getSiteFlowStatus (I1: state from observation)", () => {
  it("a completed run does not make a step done; only its observation does", async () => {
    const done = { id: "r-done", action_id: "cat-create", environment_id: ENV_ID, status: "completed", started_at: new Date(T0 - 1000).toISOString() };
    const { db } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [done] });
    const { gate } = fakeGate();
    const partial = step({}, { status: "partial", detail: "容器在、.htaccess 沒寫" }).def;
    const r = await getSiteFlowStatus(deps(db, partial, gate), { site, environment });
    const create = (r.body.steps as Array<Row>).find((s) => s.key === "create");
    expect(create).toMatchObject({ state: "failed", reason: "部分完成：容器在、.htaccess 沒寫" });

    const observedDone = step({}, { status: "done", detail: "healthy" }).def;
    const r2 = await getSiteFlowStatus(deps(db, observedDone, gate), { site, environment });
    expect((r2.body.steps as Array<Row>).find((s) => s.key === "create")).toMatchObject({ state: "done" });
  });

  it("no step result is stored anywhere: the status read writes no row", async () => {
    const { db, tables } = fakeDb({ ops_action_catalog: catalog(true), ops_action_runs: [], environments: [{ ...environment }], sites: [{ ...site }] });
    const { gate } = fakeGate();
    const before = JSON.stringify(tables);
    const r = await getSiteFlowStatus(deps(db, step({}, { status: "done", detail: "ok" }).def, gate), { site, environment });
    expect(r.status).toBe(200);
    expect(JSON.stringify(tables)).toBe(before);
    const steps = r.body.steps as Array<Row>;
    expect(steps.map((s) => s.key)).toEqual(["preflight", "create", "wp_install", "vhost", "mainwp", "bridge", "open"]);
    expect(steps.find((s) => s.key === "wp_install")).toMatchObject({ state: "not_available" });
  });
});
