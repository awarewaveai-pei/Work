// The laptop status is the owner's alone (her personal Codex plan): anyone else gets 403, and an unset owner id = nobody.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { GET } from "./route";
import { claimJob, resetCodexBridgeForTests } from "@/lib/tarot/codex-bridge";

const OWNER = "11111111-2222-3333-4444-555555555555";
const req = (userId: string, kind = "staff") =>
  new Request("http://x/api/tools/codex-laptop", {
    headers: { "x-ops-claims-role": "owner", "x-ops-user-id": userId, "x-ops-user-kind": kind },
  });

beforeEach(() => { resetCodexBridgeForTests(); vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/tools/codex-laptop", () => {
  it("tells the owner whether the laptop is polling", async () => {
    expect(await (await GET(req(OWNER))).json()).toEqual({ ok: true, online: false });
    await claimJob(0); // the worker asked for work just now
    expect(await (await GET(req(OWNER))).json()).toEqual({ ok: true, online: true });
  });

  it("refuses another staff member and a client with the owner's id", async () => {
    expect((await GET(req("99999999-2222-3333-4444-555555555555"))).status).toBe(403);
    expect((await GET(req(OWNER, "client"))).status).toBe(403);
  });

  it("refuses everyone when the owner id is unset", async () => {
    vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "");
    expect((await GET(req(OWNER))).status).toBe(403);
  });
});
