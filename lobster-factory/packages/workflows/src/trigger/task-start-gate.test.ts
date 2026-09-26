// The execution-time system-mode gate (src/lib/systemMode.ts gateTaskStart) in the dispatched build
// tasks: a Trigger.dev run can start long after the dispatcher checked, so each task re-checks at its
// own start. Blocked -> terminal result (never a throw: trigger.config.ts retries a throw, and a retry
// after the mode flips back would run the blocked work), the originating ops_action_runs row ends
// "blocked", and no downstream work starts (any unexpected fetch fails the test).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  task: (def: unknown) => def,
  schedules: { task: (def: unknown) => def },
  tasks: { trigger: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../observability/posthog", () => ({ captureWorkflowEvent: vi.fn() }));
vi.mock("../observability/sentry", () => ({ captureWorkflowException: vi.fn() }));
const resolveStagingProvisioning = vi.hoisted(() => vi.fn());
vi.mock("../hosting/resolveStagingProvisioning", () => ({ resolveStagingProvisioning }));

import { gateTaskStart } from "../lib/systemMode";

const ORG = "33333333-3333-4333-8333-333333333333";
const RUN = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const originalFetch = global.fetch;

function fakeFetch(mode: string | null, opts: { patchFails?: boolean } = {}) {
  const patches: { url: string; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/system_modes")) {
      return mode === null ? new Response("boom", { status: 500 }) : new Response(JSON.stringify([{ scope_type: "global", scope_id: null, mode }]), { status: 200 });
    }
    if ((init?.method ?? "GET") === "PATCH" && u.includes("/ops_action_runs")) {
      if (opts.patchFails) return new Response("nope", { status: 500 });
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      patches.push({ url: u, body });
      return new Response(JSON.stringify([{ id: RUN, ...body }]), { status: 200 });
    }
    throw new Error(`unexpected fetch after a blocked gate: ${init?.method ?? "GET"} ${u}`);
  });
  return { fn, patches };
}

beforeEach(() => {
  process.env.LOBSTER_SUPABASE_URL = "https://x.supabase.co";
  process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY = "test-key";
  resolveStagingProvisioning.mockReset();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("gateTaskStart", () => {
  it("blocked with an originating run: that run ends 'blocked' naming the mode", async () => {
    const f = fakeFetch("maintenance");
    global.fetch = f.fn as unknown as typeof fetch;
    expect(await gateTaskStart(ORG, RUN)).toMatchObject({ mode: "maintenance", blocks: true });
    expect(f.patches).toHaveLength(1);
    expect(f.patches[0].url).toContain(RUN);
    expect(f.patches[0].body).toEqual({ status: "blocked", error_summary: "system_mode_blocks_change: maintenance" });
  });

  it("allowed: no write-back", async () => {
    const f = fakeFetch("normal");
    global.fetch = f.fn as unknown as typeof fetch;
    expect(await gateTaskStart(ORG, RUN)).toEqual({ mode: "normal", blocks: false });
    expect(f.patches).toHaveLength(0);
  });

  it("missing Supabase env is unreadable -> blocked without any request, and names the run it could not mark", async () => {
    delete process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY;
    const f = fakeFetch("normal");
    global.fetch = f.fn as unknown as typeof fetch;
    const d = await gateTaskStart(ORG, RUN);
    expect(d).toMatchObject({ mode: "unavailable", blocks: true });
    expect(d.writebackError).toContain(RUN);
    expect(f.fn).not.toHaveBeenCalled();
    expect((await gateTaskStart(ORG)).writebackError).toBeUndefined();
  });

  it("a failed write-back still blocks and says why", async () => {
    const f = fakeFetch("emergency_stop", { patchFails: true });
    global.fetch = f.fn as unknown as typeof fetch;
    const d = await gateTaskStart(ORG, RUN);
    expect(d.blocks).toBe(true);
    expect(d.writebackError).toBeTruthy();
  });
});

describe("dispatched build tasks stop at their own start", () => {
  it("create-wp-site: blocked -> terminal result, hosting never resolved, run marked blocked", async () => {
    const f = fakeFetch("emergency_stop");
    global.fetch = f.fn as unknown as typeof fetch;
    const { createWpSite } = await import("./create-wp-site");
    const out = await (createWpSite as unknown as { run: (p: unknown) => Promise<unknown> }).run({
      organizationId: ORG, workspaceId: ORG, projectId: ORG, siteId: SITE, siteName: "demo", environmentType: "staging", _dispatchedFromActionRunId: RUN,
    });
    expect(out).toEqual({ status: "blocked_system_mode", mode: "emergency_stop" });
    expect(resolveStagingProvisioning).not.toHaveBeenCalled();
    expect(f.patches.map((p) => p.body.status)).toEqual(["blocked"]);
  });

  it("adopt-client-os: blocked (unreadable mode) -> terminal result, the client site is never touched", async () => {
    const f = fakeFetch(null);
    global.fetch = f.fn as unknown as typeof fetch;
    const { adoptClientOs } = await import("./adopt-client-os");
    const out = await (adoptClientOs as unknown as { run: (p: unknown) => Promise<unknown> }).run({
      organizationId: ORG, workspaceId: ORG, projectId: ORG, siteId: SITE, siteUrl: "https://client.example", wpAdminUrl: "https://client.example/wp-admin",
      credentialsRef: "ref", backupRef: "bk", backupConfirmed: true, _dispatchedFromActionRunId: RUN,
    });
    expect(out).toEqual({ status: "blocked_system_mode", mode: "unavailable" });
    expect(f.patches.map((p) => p.body.status)).toEqual(["blocked"]);
  });
});
