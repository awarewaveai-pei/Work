import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Contract between provision-staging/route.ts and scripts/aw-hosting-gate.sh (the only thing the hosting
// bridge key may run on ks-aw-01). Commands and stdin scripts are captured from the real route, never
// re-typed. The gate's behavior against real containers: tests/host-scripts/hosting-gate.test.sh.

const calls = vi.hoisted(() => [] as { command: string; stdin?: string }[]);
const bridge = vi.hoisted(() => ({ configured: true, reads: [] as unknown[][] }));
const dbState = vi.hoisted(() => ({
  orgMetadata: {} as Record<string, unknown>,
  orgUpdates: [] as Record<string, unknown>[],
  reserveWpSite: false,
}));

vi.mock("@/lib/repair-center/ssh", () => ({
  readSshTargetFromEnv: (...args: unknown[]) => {
    bridge.reads.push(args);
    return bridge.configured ? { host: "h", port: 58122, username: "root", privateKey: "k", hostKeyFingerprint: "f" } : null;
  },
  connectSsh: async () => ({ end: () => {} }),
  sshExec: async (_conn: unknown, command: string, stdin?: string) => {
    calls.push({ command, stdin });
    if (command.startsWith("staging-prepare ")) return { code: 0, stdout: "AW_PREPARE_OK state=created\n", stderr: "" };
    if (stdin?.includes("core is-installed")) return { code: 1, stdout: "", stderr: "" };
    if (stdin?.includes("application-password create")) return { code: 0, stdout: "abcdefghijklmnopqrstuvwx\n", stderr: "" };
    if (stdin?.includes("AW_SEED_OK")) return { code: 0, stdout: "AW_SEED_OK home=5 pages=1\n", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  },
}));
const ADMIN_PASS = vi.hoisted(() => "Pw-contract-7f3a'q$x");
vi.mock("@/lib/hosting/staging-admin-credential", () => ({
  generateStagingAdminPassword: () => ADMIN_PASS,
  vaultStagingAdminPassword: async () => "Admin password vaulted (test)",
}));
vi.mock("../staging-admin-credential", () => ({
  generateStagingAdminPassword: () => ADMIN_PASS,
  vaultStagingAdminPassword: async () => "Admin password vaulted (test)",
}));
const spec = { site_name: "S", sitemap: [{ slug: "about", title: "About" }], homepage: { hero: { headline: "H" } } };
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
vi.mock("../../supabase-server", () => ({ getSupabaseWriteClient: () => fakeDb() }));
function fakeDb() {
  return { from: (table: string) => {
    const q = { select: () => q, eq: () => q,
      single: async () => ({ data: table === "organizations" ? { metadata: dbState.orgMetadata } : { spec_data: spec }, error: null }),
      // website_specs row for the seed org lookup (provision-staging resolveTargetOrg)
      maybeSingle: async () => ({ data: { organization_id: ORG_ID, intake_form_id: null }, error: null }),
      insert: async () => ({ error: dbState.reserveWpSite ? null : { code: "23505", message: "dup" } }),
      update: (payload: Record<string, unknown>) => { if (table === "organizations") dbState.orgUpdates.push(payload); return q; },
      delete: () => q };
    return q;
  } };
}
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false }));
vi.mock("../../storage/r2", () => ({ isR2Configured: () => false }));
// T17: provision-staging now gates on system mode before any SSH. This file's concern is the
// gate script contract, not the system-mode gate (covered by production-change-gate.test.ts and
// provision-staging-mode-gate.test.ts) -- always allow so every case below still reaches SSH.
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));
vi.mock("../../system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));

const GATE = path.resolve(__dirname, "../../../../../scripts/aw-hosting-gate.sh");
const TOKEN = "contract-token";
const UNIQUE_ID = "0123456789abcdef0123456789abcdef";
const EVIL_NAME = "Evil $(touch MARKER) `touch MARKER` 'q\" ;id";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
// T17: provision-staging now requires organizationId to be a uuid (it's interpolated into the
// system-mode gate's PostgREST filter string) -- "org-1" from before that rule no longer passes.
const ORG_ID = "3a2b1c4d-5e6f-4789-8a9b-0c1d2e3f4a5b";

function gateCheck(cmd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, SSH_CLIENT: "contract-test 0 0", SSH_ORIGINAL_COMMAND: cmd };
  const r = spawnSync("bash", [GATE, "--check"], { env, encoding: "utf8" });
  return { status: r.status, stdout: (r.stdout ?? "").trim() };
}
async function post(body: unknown) {
  const { POST } = await import("@/app/api/internal/hosting/provision-staging/route");
  const res = await POST(new Request("http://x/api/internal/hosting/provision-staging", {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const savedToken = process.env.LOBSTER_HOSTING_API_TOKEN;
process.env.LOBSTER_HOSTING_API_TOKEN = TOKEN;
afterAll(() => { process.env.LOBSTER_HOSTING_API_TOKEN = savedToken; });
beforeEach(() => {
  calls.length = 0; bridge.configured = true; bridge.reads.length = 0;
  dbState.orgMetadata = {}; dbState.orgUpdates.length = 0; dbState.reserveWpSite = false;
});

describe("provision-staging → aw-hosting-gate contract", () => {
  it.each([
    ["an existing production URL", { site_url: "https://client.example", brandColors: { primary: "#123456" } }, "https://client.example"],
    ["no production URL", { brandColors: { primary: "#123456" } }, undefined],
  ])("staging wiring preserves %s and records a separate staging URL", async (_name, config, productionUrl) => {
    dbState.orgMetadata = { client_config: config };
    dbState.reserveWpSite = true;
    const r = await post({ organizationId: ORG_ID, siteId: SITE_ID, siteName: "Client" });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(dbState.orgUpdates, JSON.stringify(r.json)).toHaveLength(1);
    const clientConfig = (dbState.orgUpdates[0].metadata as { client_config: Record<string, unknown> }).client_config;
    expect(clientConfig.site_url).toBe(productionUrl);
    expect(clientConfig.staging_url).toBe("https://aware-wave.com/staging/client-6f1e2d");
    expect(clientConfig.brandColors).toEqual({ primary: "#123456" });
  });

  it("every host command is a gate verb the gate accepts, and carries no secret or caller text", async () => {
    const r = await post({ organizationId: ORG_ID, siteId: SITE_ID, siteName: EVIL_NAME, pluginSlugs: ["fluent-crm"], mainwpChildUniqueId: UNIQUE_ID });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(calls.map((c) => c.command.split(" ")[0])).toEqual(
      expect.arrayContaining(["staging-prepare", "staging-wp"]),
    );
    for (const { command } of calls) {
      expect(gateCheck(command), command).toMatchObject({ status: 0 });
      for (const secret of [ADMIN_PASS, UNIQUE_ID, "Evil", "MARKER"]) expect(command).not.toContain(secret);
    }
    expect(calls[0].command).toBe("staging-prepare evil-touch-marker--6f1e2d wp_s_6f1e2d3c4b5a49788a6b5c");
    // no root/22 fallback for the bridge (codex r1): PORT and USER must be configured
    expect(bridge.reads).toEqual([["HOSTING_BRIDGE", { explicit: true }]]);
  });

  it("every staging-wp script parses, and no other verb gets stdin", async () => {
    await post({ organizationId: ORG_ID, siteId: SITE_ID, siteName: EVIL_NAME, mainwpChildUniqueId: UNIQUE_ID });
    for (const c of calls) {
      if (c.command.startsWith("staging-wp ")) {
        const r = spawnSync("bash", ["-n"], { input: c.stdin, encoding: "utf8" });
        expect(r.status, `${c.stdin}\n${r.stderr}`).toBe(0);
      } else {
        expect(c.stdin).toBeUndefined();
      }
    }
  });

  it("install script: the site name stays literal and the admin password arrives on stdin, never argv", async () => {
    await post({ organizationId: ORG_ID, siteId: SITE_ID, siteName: EVIL_NAME });
    const install = calls.find((c) => c.stdin?.includes("core install"));
    expect(install).toBeDefined();
    const dir = mkdtempSync(path.join(tmpdir(), "aw-install-"));
    try {
      // Stub php: one argv item per line, then whatever arrived on stdin.
      writeFileSync(path.join(dir, "php"), '#!/bin/bash\nprintf "ARG:%s\\n" "$@" >&2\nwhile IFS= read -r l; do printf "STDIN:%s\\n" "$l" >&2; done\n', { mode: 0o755 });
      const r = spawnSync("bash", ["-s"], {
        input: install!.stdin, cwd: dir, encoding: "utf8",
        env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` },
      });
      expect(r.status, r.stderr).toBe(0);
      const lines = r.stderr.split("\n");
      expect(lines).toContain(`ARG:--title=${EVIL_NAME} Staging`);
      expect(lines).toContain(`STDIN:${ADMIN_PASS}`);
      expect(lines.filter((l) => l.startsWith("ARG:")).join("\n")).not.toContain(ADMIN_PASS);
      expect(existsSync(path.join(dir, "MARKER"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("seed mode maps wpPath to the gate's slug", async () => {
    const r = await post({ mode: "seed", websiteSpecId: SITE_ID, wpPath: "/var/www/html/staging/site-1a2b3c" });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(calls.map((c) => c.command)).toEqual(["staging-wp site-1a2b3c"]);
    expect(bridge.reads).toEqual([["HOSTING_BRIDGE", { explicit: true }]]);
    expect(gateCheck(calls[0].command).status).toBe(0);
  });
});

describe("provision-staging refuses what the gate would refuse, before any SSH", () => {
  it.each([
    ["siteId with shell text", { organizationId: ORG_ID, siteId: "abc;id-1234", siteName: "x" }, 422],
    ["siteId not hex (derived names would still pass the gate)", { organizationId: ORG_ID, siteId: "zzzzzz-zzzz", siteName: "x" }, 422],
    ["siteId hex but not a uuid (codex r2)", { organizationId: ORG_ID, siteId: "abcdef", siteName: "x" }, 422],
    ["plugin slug with shell text", { organizationId: ORG_ID, siteId: SITE_ID, siteName: "x", pluginSlugs: ["ok", "a;b"] }, 422],
    ["pluginSlugs not an array", { organizationId: ORG_ID, siteId: SITE_ID, siteName: "x", pluginSlugs: "fluent-crm" }, 422],
    ["seed wpPath outside staging", { mode: "seed", websiteSpecId: SITE_ID, wpPath: "/var/www/html" }, 422],
    ["seed wpPath traversal", { mode: "seed", websiteSpecId: SITE_ID, wpPath: "/var/www/html/staging/../x" }, 422],
  ])("%s", async (_n, body, status) => {
    const r = await post(body);
    expect(r.status).toBe(status);
    expect(calls).toHaveLength(0);
  });

  it("no HOSTING_BRIDGE_SSH_* target (incl. no pinned host key) → 503, no SSH", async () => {
    bridge.configured = false;
    expect((await post({ organizationId: ORG_ID, siteId: SITE_ID, siteName: "x" })).status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});
