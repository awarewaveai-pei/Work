// social-dispatch: skips quietly without a token, otherwise POSTs next-admin's dispatch route with its own bearer; a
// non-2xx is a failed run (the next tick retries).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@trigger.dev/sdk", () => ({
  schedules: { task: (def: unknown) => def },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../observability/sentry", () => ({ captureWorkflowException: vi.fn() }));

import { socialDispatch } from "./social-dispatch";

const run = () => (socialDispatch as unknown as { run: () => Promise<unknown> }).run();
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.example/";
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.SOCIAL_DISPATCH_TOKEN;
  delete process.env.AWAREWAVE_WEBHOOK_BASE_URL;
});

describe("social-dispatch", () => {
  it("no token on the worker: skipped, no request", async () => {
    const f = vi.fn();
    global.fetch = f as unknown as typeof fetch;
    expect(await run()).toEqual({ configured: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("token set: POSTs the dispatch route with its bearer", async () => {
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, enabled: true, sent: 2 }), { status: 200 }));
    global.fetch = f as unknown as typeof fetch;
    expect(await run()).toEqual({ configured: true, ok: true, enabled: true, sent: 2 });
    expect(f).toHaveBeenCalledWith("https://app.example/api/internal/social/dispatch", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer tok" } }));
  });

  it("a non-2xx answer fails the run", async () => {
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    global.fetch = vi.fn(async () => new Response("bad gateway", { status: 502 })) as unknown as typeof fetch;
    await expect(run()).rejects.toThrow(/social\/dispatch 502/);
  });
});
