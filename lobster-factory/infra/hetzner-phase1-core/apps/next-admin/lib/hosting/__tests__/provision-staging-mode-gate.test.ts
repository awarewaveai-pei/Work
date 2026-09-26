// T17: checkProductionChangeAllowed gates provision-staging (including mode:"seed") before any
// SSH, on the org the call changes: provision names it (required), seed takes it from the website
// spec, then the spec's intake form. checkProductionChangeAllowed itself is mocked here (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts); this file only proves the wiring.
// Mocking style (ssh2/staging-admin-credential/storage/r2/supabase-server) mirrors
// hosting-gate-contract.test.ts, which covers the gate script contract, not this gate.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

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

// Rows the org lookup reads: website_specs(organization_id, intake_form_id) and intake_forms(organization_id).
const db = vi.hoisted(() => ({
  spec: { data: null as unknown, error: null as unknown },
  intake: { data: null as unknown, error: null as unknown },
}));
function fakeDb() {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, eq: () => q, update: () => q, delete: () => q,
        single: async () => ({ data: { spec_data: {}, metadata: {} }, error: null }),
        maybeSingle: async () =>
          table === "website_specs" ? db.spec : table === "intake_forms" ? db.intake : { data: null, error: null },
        insert: async () => ({ error: null }),
      });
      return q;
    },
  };
}
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
vi.mock("../../supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false }));
vi.mock("../../storage/r2", () => ({ isR2Configured: () => false }));

const TOKEN = "gate-test-token";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const SPEC_ID = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const INTAKE_ID = "8b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e";
const ORG_A = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const ORG_B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const SEED = { mode: "seed", websiteSpecId: SPEC_ID, wpPath: "/var/www/html/staging/site-1a2b3c" };

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
  db.spec = { data: { organization_id: ORG_A, intake_form_id: INTAKE_ID }, error: null };
  db.intake = { data: { organization_id: ORG_B }, error: null };
});

describe("provision-staging -- system-mode gate (provision)", () => {
  it("blocked: 423 with system_mode_blocks_change, before any SSH", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "system in emergency_stop" });
    const r = await post({ siteId: SITE_ID, siteName: "Acme", organizationId: ORG_A });
    expect(r.status).toBe(423);
    expect(r.json).toEqual(blockedChangeBody("emergency_stop"));
    expect(calls).toHaveLength(0);
  });

  it("the gate gets the org the call names", async () => {
    await post({ siteId: SITE_ID, siteName: "Acme", organizationId: ORG_A });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_A);
  });

  it.each([
    ["missing", undefined],
    ["JSON null", null],
    ["not a uuid", "not-a-uuid; drop table x"],
    ["an array holding a uuid", [ORG_A]],
  ])("organizationId %s: 422, the gate is never called", async (_label, organizationId) => {
    const r = await post({ siteId: SITE_ID, siteName: "Acme", organizationId });
    expect(r.status).toBe(422);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("allowed: the call continues to SSH (staging-prepare runs)", async () => {
    const r = await post({ siteId: SITE_ID, siteName: "Acme", organizationId: ORG_A });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(calls.some((c) => c.command.startsWith("staging-prepare "))).toBe(true);
  });
});

describe("provision-staging -- system-mode gate (seed)", () => {
  it("blocked on the website spec's org although the body names none: 423, no SSH", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance", reason: "system in maintenance" });
    const r = await post(SEED);
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_A);
    expect(r.status).toBe(423);
    expect(r.json).toEqual(blockedChangeBody("maintenance"));
    expect(calls).toHaveLength(0);
  });

  it("a spec without an org falls back to its intake form's org", async () => {
    db.spec = { data: { organization_id: null, intake_form_id: INTAKE_ID }, error: null };
    await post(SEED);
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_B);
  });

  it("no org on the spec or its intake form: global mode only (null)", async () => {
    db.spec = { data: { organization_id: null, intake_form_id: null }, error: null };
    await post(SEED);
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), null);
  });

  it.each([
    ["the spec lookup", "spec"],
    ["the intake lookup", "intake"],
  ])("%s failing blocks with mode unavailable: 423, gate not called, no SSH", async (_label, which) => {
    if (which === "spec") db.spec = { data: null, error: { message: "boom" } };
    else {
      db.spec = { data: { organization_id: null, intake_form_id: INTAKE_ID }, error: null };
      db.intake = { data: null, error: { message: "boom" } };
    }
    const r = await post(SEED);
    expect(r.status).toBe(423);
    expect(r.json).toEqual(blockedChangeBody("unavailable"));
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("an organizationId that contradicts the spec's org: 422", async () => {
    const r = await post({ ...SEED, organizationId: ORG_B });
    expect(r.status).toBe(422);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });

  it("organizationId JSON null counts as absent: the spec's org is used", async () => {
    await post({ ...SEED, organizationId: null });
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_A);
  });

  it("websiteSpecId that is not a uuid: 422, no lookup, gate not called", async () => {
    const r = await post({ ...SEED, websiteSpecId: "spec-1" });
    expect(r.status).toBe(422);
    expect(checkProductionChangeAllowed).not.toHaveBeenCalled();
  });

  it("allowed: seeding continues to SSH", async () => {
    const r = await post(SEED);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(calls.length).toBeGreaterThan(0);
  });
});
