// Portal signup pre-confirms the email without proof (route.ts KNOWN V1 GAP), and a brand owner adds members by email
// (0103): an open signup would let anyone register someone else's address and be handed their brand. So the route stays
// closed even with both env switches on, until a confirmation-email flow exists (db-expert M1 / Codex 2026-10-15).
import { afterEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ auth: { admin: { createUser } }, from: vi.fn(), rpc: vi.fn() }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: vi.fn(async () => true) }));

afterEach(() => { vi.unstubAllEnvs(); createUser.mockReset(); });

describe("portal signup", () => {
  it("stays closed with PORTAL_SIGNUP_ENABLED and TURNSTILE_SECRET_KEY both set, and creates no account", async () => {
    vi.stubEnv("PORTAL_SIGNUP_ENABLED", "true");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "x");
    const { POST } = await import("../route");
    const res = await POST(new Request("https://portal.aware-wave.com/portal/api/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "boss@client.com", password: "a-long-password-1", orgName: "Client", turnstileToken: "t" }),
    }));
    expect((await res.json()).error).toBe("coming_soon");
    expect(createUser).not.toHaveBeenCalled();
  });
});
