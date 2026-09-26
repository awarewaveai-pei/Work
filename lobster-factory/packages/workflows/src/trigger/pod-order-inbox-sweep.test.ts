// pod-order-inbox-sweep: skips quietly without a token (rollout not done), otherwise POSTs next-admin's
// sweep route with its own bearer; a non-2xx is a failed run (the next tick retries).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: (def: unknown) => def },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../observability/sentry", () => ({ captureWorkflowException: vi.fn() }));

import { podOrderInboxSweep } from "./pod-order-inbox-sweep";

const run = () => (podOrderInboxSweep as unknown as { run: () => Promise<unknown> }).run();
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.example/";
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.POD_INBOX_SWEEP_TOKEN;
  delete process.env.AWAREWAVE_WEBHOOK_BASE_URL;
});

describe("pod-order-inbox-sweep", () => {
  it("no token on the worker: skipped, no request", async () => {
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    expect(await run()).toEqual({ configured: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("token set: POSTs the sweep route with its bearer", async () => {
    process.env.POD_INBOX_SWEEP_TOKEN = "tok";
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, scheduled: true }), { status: 200 }));
    global.fetch = f as unknown as typeof fetch;
    expect(await run()).toEqual({ configured: true, ok: true, scheduled: true });
    expect(f).toHaveBeenCalledWith("https://app.example/api/internal/pod-orders/sweep", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer tok" } }));
  });

  it("a non-2xx answer fails the run", async () => {
    process.env.POD_INBOX_SWEEP_TOKEN = "tok";
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(run()).rejects.toThrow(/pod-orders\/sweep 401/);
  });
});
