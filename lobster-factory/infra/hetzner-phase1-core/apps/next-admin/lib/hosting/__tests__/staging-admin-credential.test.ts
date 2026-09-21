import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

import {
  generateStagingAdminPassword,
  vaultStagingAdminPassword,
  type StagingAdminVaultDeps,
} from "../staging-admin-credential";

const PASS = "StgSECRETvalue_abc-123XYZ";
const args = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  siteId: "22222222-2222-2222-2222-222222222222",
  slug: "acme-222222",
  stagingSiteUrl: "https://aware-wave.com/staging/acme-222222/",
  adminUser: "admin",
  password: PASS,
};

function fakeDeps(over: Partial<StagingAdminVaultDeps> = {}) {
  const vault = new Map<string, string>();
  const rows = new Map<string, Record<string, unknown>>();
  const deps: StagingAdminVaultDeps = {
    insertCredential: vi.fn(async (row) => { rows.set("cred-1", { ...row }); return { id: "cred-1" }; }),
    attachSecretRef: vi.fn(async (id, ref) => { rows.get(id)!.secret_ref = ref; return null; }),
    deleteCredential: vi.fn(async (id) => { rows.delete(id); return null; }),
    putSecret: vi.fn(async (name, value) => { vault.set(name, value); return name; }),
    deleteSecret: vi.fn(async (name) => vault.delete(name)),
    ...over,
  };
  return { deps, vault, rows };
}

describe("generateStagingAdminPassword", () => {
  it("is unique and uses a shell-single-quote-safe charset", () => {
    const a = generateStagingAdminPassword();
    const b = generateStagingAdminPassword();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^Stg[A-Za-z0-9_-]{24}$/);
  });
});

describe("vaultStagingAdminPassword", () => {
  it("stores the password only in the vault under clientCredSecretRef(id); note carries the id, not the password", async () => {
    const { deps, vault, rows } = fakeDeps();
    const note = await vaultStagingAdminPassword(args, deps);
    expect(note).toBe("Admin password vaulted: client_credentials cred-1 (user admin)");
    expect(note).not.toContain(PASS);
    expect(vault.get("client_cred:cred-1")).toBe(PASS);
    const row = rows.get("cred-1")!;
    expect(row.secret_ref).toBe("client_cred:cred-1");
    expect(JSON.stringify(row)).not.toContain(PASS);
    expect(row.category).toBe("hosting");
  });

  it("note does not start with 'Admin:' (legacy redactors would erase the credential id)", async () => {
    const { deps } = fakeDeps();
    expect((await vaultStagingAdminPassword(args, deps)).startsWith("Admin:")).toBe(false);
  });

  it("compensates (vault + row removed) when secret_ref attach fails", async () => {
    const { deps, vault, rows } = fakeDeps({ attachSecretRef: vi.fn(async () => "update failed") });
    const note = await vaultStagingAdminPassword(args, deps);
    expect(note).toMatch(/^WARN admin password not vaulted: secret_ref attach failed/);
    expect(vault.size).toBe(0);
    expect(rows.size).toBe(0);
  });

  it("never echoes the password even if a vault error message contains it", async () => {
    const { deps, rows } = fakeDeps({ putSecret: vi.fn(async () => { throw new Error(`boom ${PASS}`); }) });
    const note = await vaultStagingAdminPassword(args, deps);
    expect(note).not.toContain(PASS);
    expect(note).toContain("[redacted]");
    expect(rows.size).toBe(0);
  });

  it("removes a vault entry committed before putSecret threw (timeout after RPC)", async () => {
    const vault = new Map<string, string>();
    const { deps, rows } = fakeDeps({
      putSecret: vi.fn(async (name, value) => { vault.set(name, value); throw new Error("timeout"); }),
      deleteSecret: vi.fn(async (name) => vault.delete(name)),
    });
    const note = await vaultStagingAdminPassword(args, deps);
    expect(note).toMatch(/^WARN admin password not vaulted: timeout;/);
    expect(vault.size).toBe(0);
    expect(rows.size).toBe(0);
  });

  it("reports orphans when compensation itself fails", async () => {
    const { deps } = fakeDeps({
      attachSecretRef: vi.fn(async () => "update failed"),
      deleteSecret: vi.fn(async () => { throw new Error("vault down"); }),
      deleteCredential: vi.fn(async () => "row delete failed"),
    });
    const note = await vaultStagingAdminPassword(args, deps);
    expect(note).toContain("[orphan: vault client_cred:cred-1, client_credentials cred-1]");
    expect(note).not.toContain(PASS);
  });

  it("degrades to WARN without organizationId or DB client", async () => {
    expect(await vaultStagingAdminPassword({ ...args, organizationId: undefined }, fakeDeps().deps)).toMatch(/no organizationId/);
    expect(await vaultStagingAdminPassword(args, null)).toMatch(/no DB client/);
  });
});

describe("provision-staging route source", () => {
  it("never interpolates adminPass into the JSON response", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../app/api/internal/hosting/provision-staging/route.ts"),
      "utf8",
    );
    const start = src.search(/return NextResponse\.json\(\{\s*environmentId/);
    expect(start).toBeGreaterThan(0);
    const response = src.slice(start);
    expect(response.slice(0, response.indexOf("});"))).not.toMatch(/adminPass/);
    // retry detection must use the exit code of `core is-installed`: `core install --quiet` hides
    // its "already installed" log line, so a stdout match can never fire.
    expect(src).toMatch(/core is-installed/);
    expect(src).not.toMatch(/installResult\.stdout\.includes\("already installed"\)/);
    // the only uses: generation, the wp-cli install arg, the vault call
    expect(src.match(/\badminPass\b/g)?.length).toBe(3);
  });
});
