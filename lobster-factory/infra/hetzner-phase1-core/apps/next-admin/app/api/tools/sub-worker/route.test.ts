// The subscription worker state is the owner's alone: anyone else gets 403 (mutation: drop the owner check -> this goes red).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { claimJob, resetCodexBridgeForTests } from "@/lib/tarot/codex-bridge";

const OWNER = "11111111-2222-3333-4444-555555555555";
const req = (userId: string, query = "", kind = "staff") =>
  new Request(`http://x/api/tools/sub-worker${query}`, {
    headers: { "x-ops-claims-role": "owner", "x-ops-user-id": userId, "x-ops-user-kind": kind },
  });

beforeEach(() => { resetCodexBridgeForTests(); vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/tools/sub-worker", () => {
  it("refuses another staff member, a client with the owner's id, and everyone when the owner id is unset", async () => {
    const res = await GET(req("99999999-2222-3333-4444-555555555555"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "sub_operator_only" });
    expect((await GET(req(OWNER, "", "client"))).status).toBe(403);
    vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "");
    expect((await GET(req(OWNER))).status).toBe(403);
  });

  it("gives the owner the chosen lane's state, uncached", async () => {
    const res = await GET(req(OWNER));
    expect(await res.json()).toEqual({ ok: true, lane: "owner", tools: expect.any(Array), online: false, quotaBlockedUntil: {} });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await claimJob(0); // the owner lane's worker polled just now
    expect((await (await GET(req(OWNER))).json()).online).toBe(true);
    expect(await (await GET(req(OWNER, "?lane=schedule"))).json()).toMatchObject({ lane: "schedule", online: false });
  });
});
