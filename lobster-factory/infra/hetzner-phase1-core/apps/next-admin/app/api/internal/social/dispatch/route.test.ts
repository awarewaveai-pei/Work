// POST /api/internal/social/dispatch: own token, off unless enabled, dry run unless MODE=apply, a failed post is a 502.
import { afterEach, describe, expect, it, vi } from "vitest";

const runDispatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/dispatch", () => ({ runDispatch }));
vi.mock("@/lib/social/dispatch-store", () => ({ dispatchPorts: () => ({}) }));

import { POST } from "./route";

const call = (token?: string) => POST(new Request("http://x/api/internal/social/dispatch", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

afterEach(() => {
  for (const k of ["SOCIAL_DISPATCH_TOKEN", "SOCIAL_DISPATCH_ENABLED", "SOCIAL_DISPATCH_MODE"]) delete process.env[k];
  runDispatch.mockReset();
});

describe("social dispatch route", () => {
  it("no token configured or a wrong one: 401", async () => {
    expect((await call("x")).status).toBe(401);
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    expect((await call("nope")).status).toBe(401);
  });

  it("off by default: answers enabled:false and runs nothing", async () => {
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    const res = await call("tok");
    expect(await res.json()).toEqual({ ok: true, enabled: false });
    expect(runDispatch).not.toHaveBeenCalled();
  });

  it("enabled: dry run unless MODE=apply; errors make it a 502", async () => {
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    process.env.SOCIAL_DISPATCH_ENABLED = "true";
    runDispatch.mockResolvedValue({ mode: "dry_run", errors: [] });
    expect((await call("tok")).status).toBe(200);
    expect(runDispatch).toHaveBeenLastCalledWith({}, { mode: "dry_run" });
    process.env.SOCIAL_DISPATCH_MODE = "apply";
    runDispatch.mockResolvedValue({ mode: "apply", errors: ["p1: boom"] });
    expect((await call("tok")).status).toBe(502);
    expect(runDispatch).toHaveBeenLastCalledWith({}, { mode: "apply" });
    process.env.SOCIAL_DISPATCH_MODE = "draft";
    runDispatch.mockResolvedValue({ mode: "draft", errors: [] });
    await call("tok");
    expect(runDispatch).toHaveBeenLastCalledWith({}, { mode: "draft" });
  });
});
