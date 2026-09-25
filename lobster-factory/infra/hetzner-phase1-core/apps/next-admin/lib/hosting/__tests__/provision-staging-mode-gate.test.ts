// T17: checkProductionChangeAllowed gates provision-staging (including mode:"seed") before any
// SSH. checkProductionChangeAllowed itself is mocked here (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
// Mocking style (ssh2/staging-admin-credential/storage/r2/supabase-server) mirrors
// hosting-gate-contract.test.ts, which covers the gate script contract, not this gate.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { command: string; stdin?: string }[]);
const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);

vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));
vi.mock("../../system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

vi.mock("@/lib/repair-center/ssh", () => ({
  readSshTargetFromEnv: () => ({ host: "h", port: 58122, username: "root", privateKey: "k", hostKeyFingerprint: "f" }),
  connectSsh: async () => ({ end: () => {} }),
  sshExec: async (_conn: unknown, command: string, stdin?: string) => {
    calls.push({ command, stdin });
    if (command.startsWith("staging-prepare ")) return { code: 0, stdout: "AW_PREPARE_OK state=created\n", stderr: "" };
    if (stdin?.includes("core is-installed")) return { code: 1, stdout: "", stderr: "" };
    if (stdin?.includes("application-password create")) return { code: 0, stdout: "abcd efgh ijkl mnop qrst uvwx\n", stderr: "" };
    if (stdin?.includes("AW_SEED_OK")) return { code: 0, stdout: "AW_SEED_OK home=5 pages=1\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  },
}));
vi.mock("@/lib/hosting/staging-admin-credential", () => ({
  generateStagingAdminPassword: () => "Pw-gate-test-7f3a",
  vaultStagingAdminPassword: async () => "Admin password vaulted (test)",
}));
vi.mock("../staging-admin-credential", () => ({
  generateStagingAdminPassword: () => "Pw-gate-test-7f3a",
  vaultStagingAdminPassword: async () => "Admin password vaulted (test)",
}));
function fakeDb() {
  const q = {
    select: () => q, eq: () => q, single: async () => ({ data: { spec_data: {}, metadata: {} }, error: null }),
    insert: async () => ({ error: null }), update: () => q, delete: () => q,
  };
  return { from: () => q };
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
vi.mock("../../supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false }));
vi.mock("../../storage/r2", () => ({ isR2Configured: () => false }));

const TOKEN = "gate-test-token";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";

async function post(body: unknown) {
  const { POST } = await import("@/app/api/internal/hosting/provision-staging/route");
  const res = await POST(new Request("http://x/api/internal/hosting/provision-staging", {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const savedToken = process.env.LOBSTER_HOSTING_API_TOKEN;
process.env.LOBSTER_HOSTING_API_TOKEN = TOKEN;
afterAll(() => {
  process.env.LOBSTER_HOSTING_API_TOKEN = savedToken;
});

beforeEach(() => {
  calls.length = 0;
  checkProductionChangeAllowed.mockReset();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
});

describe("provision-staging -- system-mode gate", () => {
  it("blocked: 423 with system_mode_blocks_change, before any SSH", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "system in emergency_stop" });
    const r = await post({ siteId: SITE_ID, siteName: "Acme" });
    expect(r.status).toBe(423);
    expect(r.json).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(calls).toHaveLength(0);
  });

  it("mode:'seed' is blocked the same way -- the gate runs before the seed branch", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance", reason: "system in maintenance" });
    const r = await post({ mode: "seed", websiteSpecId: SITE_ID, wpPath: "/var/www/html/staging/site-1a2b3c" });
    expect(r.status).toBe(423);
    expect(r.json).toEqual({ error: "system_mode_blocks_change", mode: "maintenance" });
    expect(calls).toHaveLength(0);
  });

  it("organizationId that is not a uuid: 422, and system_modes is never queried", async () => {
    const r = await post({ siteId: SITE_ID, siteName: "Acme", organizationId: "not-a-uuid; drop table x" });
    expect(r.status).toBe(422);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });

  it("no organizationId in the body: the gate is called with null", async () => {
    await post({ siteId: SITE_ID, siteName: "Acme" });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("a valid organizationId is passed through to the gate", async () => {
    await post({ siteId: SITE_ID, siteName: "Acme", organizationId: SITE_ID });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), SITE_ID);
  });

  it("allowed: the call continues to SSH (staging-prepare runs)", async () => {
    const r = await post({ siteId: SITE_ID, siteName: "Acme" });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(calls.some((c) => c.command.startsWith("staging-prepare "))).toBe(true);
  });
});
