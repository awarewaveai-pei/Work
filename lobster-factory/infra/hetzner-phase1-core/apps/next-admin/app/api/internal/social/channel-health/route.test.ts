// POST /api/internal/social/channel-health: the sender's token; a malformed body changes nothing.
import { afterEach, describe, expect, it, vi } from "vitest";

const applyChannelHealth = vi.hoisted(() => vi.fn(async () => ({ expired: 1, connected: 0, errors: [] as string[] })));
vi.mock("@/lib/social/channel-health", async (orig) => ({ ...(await orig<typeof import("@/lib/social/channel-health")>()), applyChannelHealth }));

import { POST } from "./route";

const row = { id: "pz", provider: "youtube", refreshNeeded: true, disabled: false, inBetweenSteps: false, deleted: false };
const call = (body: unknown, token = "tok") => POST(new Request("http://x/api/internal/social/channel-health",
  { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));

afterEach(() => { delete process.env.SOCIAL_DISPATCH_TOKEN; applyChannelHealth.mockClear(); });

describe("social channel-health route", () => {
  it("401 without the token, 400 on a bad body (nothing applied), 200 with the mirror's counts", async () => {
    expect((await call([row])).status).toBe(401);
    process.env.SOCIAL_DISPATCH_TOKEN = "tok";
    expect((await call([{ id: "pz" }])).status).toBe(400);
    expect(applyChannelHealth).not.toHaveBeenCalled();
    const ok = await call([row]);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, channels: 1, expired: 1 });
    expect(applyChannelHealth).toHaveBeenCalledWith([row]);
  });
});
