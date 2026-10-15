// POST /api/internal/social/rotation: the sender's token and switch; a failed list makes it a 502.
import { afterEach, describe, expect, it, vi } from "vitest";

const runRotation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/rotation", () => ({ runRotation }));
const reconcileAccounts = vi.hoisted(() => vi.fn(async () => ({ expired: 0, errors: [] as string[] })));
vi.mock("@/lib/social/review", () => ({ reconcileAccounts }));

import { POST } from "./route";

const call = (token?: string) => POST(new Request("http://x/api/internal/social/rotation", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

afterEach(() => {
  for (const k of ["SOCIAL_DISPATCH_TOKEN", "SOCIAL_DISPATCH_ENABLED"]) delete process.env[k];
  runRotation.mockReset();
});

describe("social rotation route", () => {
  it("401 without the token; off unless enabled; a failed list is a 502", async () => {
    expect((await call("x")).status).toBe(401);
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    expect(await (await call("tok")).json()).toEqual({ ok: true, enabled: false });
    expect(runRotation).not.toHaveBeenCalled();
    process.env.SOCIAL_DISPATCH_ENABLED = "true";
    runRotation.mockResolvedValue({ lists: 2, posts: 5, errors: [] });
    expect((await call("tok")).status).toBe(200);
    expect(reconcileAccounts).toHaveBeenCalled();   // the daily run also reconciles channel status
    runRotation.mockResolvedValue({ lists: 1, posts: 0, errors: ["l2: boom"] });
    expect((await call("tok")).status).toBe(502);
    runRotation.mockResolvedValue({ lists: 1, posts: 0, errors: [] });
    reconcileAccounts.mockRejectedValueOnce(new Error("postiz down"));
    expect((await call("tok")).status).toBe(502);
  });
});
