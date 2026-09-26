// T19: dispatchRun re-checks the run's org system mode right before triggering (not only at
// enqueue time in next-admin's build/runs route) -- a run queued while normal must not execute
// after the mode flips. A blocked run must finish with a terminal status (dispatch_failed), never
// stay pending. @trigger.dev/sdk is mocked so `task()`/`schedules.task()` just return their config
// object (exposing `.run` directly, no real Trigger.dev runtime needed); tasks.trigger is a spy.
// Supabase access goes through global.fetch (supabaseRestQuery/Patch), stubbed per-test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tasksTrigger = vi.hoisted(() => vi.fn(async () => ({ id: "trigger-handle-1" })));
vi.mock("@trigger.dev/sdk", () => ({
  task: (def: unknown) => def,
  schedules: { task: (def: unknown) => def },
  tasks: { trigger: tasksTrigger },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../observability/posthog", () => ({ captureWorkflowEvent: vi.fn() }));
vi.mock("../observability/sentry", () => ({ captureWorkflowException: vi.fn() }));

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ACTION_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function baseRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    action_id: ACTION_ID,
    organization_id: ORG_ID,
    input_payload: {},
    status: "pending",
    trace_id: "trace-1",
    metadata: { action_key: "ops.profile-a.ao-infrastructure-check" },
    approval_required: false,
    approval_status: "none",
    ...overrides,
  };
}

interface FetchOpts {
  pendingRuns: unknown[];
  systemModeRows: unknown[] | null;
  systemModeError?: boolean;
}

function makeFetchMock(opts: FetchOpts) {
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/ops_action_runs")) {
      return new Response(JSON.stringify(opts.pendingRuns), { status: 200 });
    }
    if (url.includes("/system_modes")) {
      if (opts.systemModeError) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify(opts.systemModeRows ?? []), { status: 200 });
    }
    if (method === "PATCH" && url.includes("/ops_action_runs")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      patches.push({ url, body });
      return new Response(JSON.stringify([{ id: RUN_ID, ...body }]), { status: 200 });
    }
    throw new Error(`unexpected fetch call: ${method} ${url}`);
  });
  return { fetchMock, patches };
}

process.env.LOBSTER_SUPABASE_URL = "https://x.supabase.co";
process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY = "test-key";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
beforeEach(() => {
  tasksTrigger.mockClear();
});

describe("dispatch-action-run -- system-mode gate", () => {
  it("blocked: the run is finished dispatch_failed with the mode, and the task is never triggered", async () => {
    const { fetchMock, patches } = makeFetchMock({
      pendingRuns: [baseRun()],
      systemModeRows: [{ scope_type: "global", scope_id: null, mode: "emergency_stop" }],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { dispatchActionRun } = await import("./dispatch-action-run");
    const result = await dispatchActionRun.run({});

    expect(result).toEqual({ dispatched: 1, total: 1 });
    expect(tasksTrigger).not.toHaveBeenCalled();
    const terminalPatch = patches.find((p) => p.body.status === "dispatch_failed");
    expect(terminalPatch?.body.error_summary).toContain("system_mode_blocks_change");
    expect(terminalPatch?.body.error_summary).toContain("emergency_stop");
    // Never claimed (pending -> running): a blocked run must not sit as "running" either.
    expect(patches.some((p) => p.body.status === "running")).toBe(false);
  });

  it("allowed: the run is claimed and the task is triggered", async () => {
    const { fetchMock, patches } = makeFetchMock({
      pendingRuns: [baseRun()],
      systemModeRows: [{ scope_type: "global", scope_id: null, mode: "normal" }],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { dispatchActionRun } = await import("./dispatch-action-run");
    const result = await dispatchActionRun.run({});

    expect(result).toEqual({ dispatched: 1, total: 1 });
    expect(tasksTrigger).toHaveBeenCalledWith("ao-infrastructure-check", expect.objectContaining({ _dispatchedFromActionRunId: RUN_ID }));
    expect(patches.some((p) => p.body.status === "running")).toBe(true);
    expect(patches.some((p) => p.body.status === "dispatched")).toBe(true);
  });

  it("a system_modes read error also blocks (fail closed), same as emergency_stop", async () => {
    const { fetchMock, patches } = makeFetchMock({
      pendingRuns: [baseRun()],
      systemModeRows: null,
      systemModeError: true,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { dispatchActionRun } = await import("./dispatch-action-run");
    await dispatchActionRun.run({});

    expect(tasksTrigger).not.toHaveBeenCalled();
    const terminalPatch = patches.find((p) => p.body.status === "dispatch_failed");
    expect(terminalPatch?.body.error_summary).toContain("system_mode_blocks_change: unavailable");
  });

  it("gates using the run's own organization_id, not a hardcoded value", async () => {
    const otherOrg = "44444444-4444-4444-8444-444444444444";
    const { fetchMock } = makeFetchMock({
      pendingRuns: [baseRun({ organization_id: otherOrg })],
      systemModeRows: [{ scope_type: "global", scope_id: null, mode: "normal" }],
    });
    const spy = vi.fn(fetchMock);
    global.fetch = spy as unknown as typeof fetch;

    const { dispatchActionRun } = await import("./dispatch-action-run");
    await dispatchActionRun.run({});

    const modeQuery = spy.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/system_modes"));
    expect(modeQuery).toContain(otherOrg);
  });
});
