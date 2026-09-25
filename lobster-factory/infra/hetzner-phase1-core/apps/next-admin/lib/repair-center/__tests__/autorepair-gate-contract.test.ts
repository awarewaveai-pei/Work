import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Contract between next-admin's Auto-Repair SSH commands and the host-side forced command
// scripts/aw-autorepair-gate.sh (the only thing the Auto-Repair key may run as root on ks-aw-01).
// Commands are captured from the real code paths, never re-typed here: changing a command string
// without updating the gate fails this test instead of silently failing closed in prod.

const captured = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/repair-center/ssh", () => ({
  readPrivateKeyFromEnv: () => "contract-test-key",
  readSshTarget: () => ({ host: "host.docker.internal", port: 58122, username: "root", privateKey: "contract-test-key" }),
  connectSsh: async () => ({ end: () => {} }),
  sshExec: async (_conn: unknown, command: string) => {
    captured.push(command);
    return { code: 0, stdout: "OK", stderr: "" };
  },
  sshExecOnce: async (_target: unknown, command: string) => {
    captured.push(command);
    return { code: 0, stdout: "", stderr: "" };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => null, getSupabaseWriteClient: () => null }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));
vi.mock("../../system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: async () => ({ allowed: true, mode: "normal" }),
}));

const GATE = path.resolve(__dirname, "../../../../../scripts/aw-autorepair-gate.sh");

function gate(args: string[], sshOriginalCommand?: string, extraEnv?: NodeJS.ProcessEnv) {
  // sg-deploy runs this suite on ks-aw-01, where a forced-mode DENY reaches syslog: label its source.
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv, SSH_CLIENT: "contract-test 0 0" };
  delete env.SSH_ORIGINAL_COMMAND;
  if (sshOriginalCommand !== undefined) env.SSH_ORIGINAL_COMMAND = sshOriginalCommand;
  const r = spawnSync("bash", [GATE, ...args], { env, encoding: "utf8" });
  return { status: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

/** Real forced-command invocation: no --check shortcut, the exact entry point sshd uses. */
function gateForced(sshOriginalCommand: string, extraEnv?: NodeJS.ProcessEnv) {
  return gate([], sshOriginalCommand, extraEnv);
}

// Prod runs with every path override unset (verified via docker exec printenv, WORKLOG 2026-09-23 續107).
const ENV_UNSET = [
  "AUTO_REPAIR_BACKUP_WEBHOOK_URL",
  "AUTO_REPAIR_SG_PHASE1_ROOT",
  "AUTO_REPAIR_SG_BACKUP_SCRIPT",
  "AUTO_REPAIR_SG_VERIFY_SCRIPT",
  "AUTO_REPAIR_EU_BACKUP_SCRIPT",
  "AUTO_REPAIR_EU_VERIFY_SCRIPT",
  "AUTO_REPAIR_SG_SSH_KEY_ENV",
  "AUTO_REPAIR_EU_SSH_KEY_ENV",
  "AUTO_REPAIR_GITHUB_TOKEN",
  "GITHUB_TOKEN",
];
const ENV_SET: Record<string, string> = {
  AUTO_REPAIR_SG_SSH_HOST: "host.docker.internal",
  AUTO_REPAIR_EU_SSH_HOST: "host.docker.internal",
  AUTO_REPAIR_SG_SSH_KEY_B64: "contract-test-key",
  AUTO_REPAIR_EU_SSH_KEY_B64: "contract-test-key",
  // Required since ssh-host-key-pinning's round-3 fail-closed change: route.ts's statRemoteScript
  // now short-circuits to "unconfigured" (never calling the mocked sshExec below) without these,
  // which would silently drop 2 of the 6 commands this suite's beforeAll captures. This file mocks
  // @/lib/repair-center/ssh entirely (its concern is the shell allowlist, not host-key pinning),
  // so any non-empty value exercises the real guard's presence check without needing a real hash.
  AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256: "contract-test-fingerprint",
  AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256: "contract-test-fingerprint",
  AUTO_REPAIR_REQUIRE_EU_BACKUP: "true",
};
const saved: Record<string, string | undefined> = {};

let sent: string[] = [];

beforeAll(async () => {
  for (const k of [...ENV_UNSET, ...Object.keys(ENV_SET)]) saved[k] = process.env[k];
  for (const k of ENV_UNSET) delete process.env[k];
  Object.assign(process.env, ENV_SET);

  captured.length = 0;
  const { GET } = await import("@/app/api/ops/repairs/health/route");
  await GET();
  const { runPreRepairBackup } = await import("@/lib/repair-center/backup");
  const backup = await runPreRepairBackup({ id: "00000000-contract", source: "sentry" } as never);
  expect(backup.ok).toBe(true);
  const { collectEvidence } = await import("@/lib/repair-center/evidence");
  await collectEvidence({} as never, { client_slug: null } as never);
  sent = [...new Set(captured)].sort();
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("aw-autorepair-gate contract", () => {
  it("captures every SSH call site (3 probes, 2 backup legs, host probe)", () => {
    expect(sent).toHaveLength(6);
  });

  it("allowlist equals exactly what next-admin sends (no missing, no stale entries)", () => {
    const list = gate(["--list"]);
    expect(list.status).toBe(0);
    const allowed = list.stdout.split("\n").filter(Boolean).sort();
    expect(allowed).toEqual(sent);
  });

  it("gate allows each sent command through the same SSH_ORIGINAL_COMMAND path prod uses", () => {
    for (const cmd of sent) {
      expect(gate(["--check"], cmd), cmd).toMatchObject({ status: 0 });
    }
  });

  it("EU backup leg runs with the cron BACKUP_DIR, not the script default /root/backups", () => {
    const eu = sent.find((c) => c.startsWith("/root/scripts/backup-eu-stack.sh"));
    expect(eu).toBeDefined();
    expect(gate(["--check"], eu).stdout).toBe("ALLOW env=BACKUP_DIR=/root/backups-stack");
  });
});

describe("aw-autorepair-gate forced-command path (no --check shortcut)", () => {
  // codex-review (WORKLOG 2026-09-23 續107, finding [medium]): the earlier version of this suite
  // proved allowlist matching only through --check, never executed the real no-arg forced-command
  // path sshd actually invokes, and never proved BASH_ENV/PATH/BACKUP_DIR isolation end to end.

  it("runs an allowed probe for real via the forced path (no --check) and reports a real result", () => {
    const probe = sent.find((c) => c.startsWith("test -f /root/lobster-phase1/scripts/backup-phase1.sh"));
    expect(probe).toBeDefined();
    const r = gateForced(probe!);
    expect(r.status).toBe(0);
    // /root does not exist on the dev/CI box running this test -> MISSING; on ks-aw-01 itself
    // (where sg-deploy also runs this suite, per the SSH_CLIENT comment above) it would be OK.
    // Either is a REAL result from the REAL script executing, not a mocked one.
    expect(["OK", "MISSING"]).toContain(r.stdout);
  });

  // Both tests below copy the UNMODIFIED gate script and swap only one allow() line's command
  // *body* (never the allowlist-matching logic itself, never the env -i / run_env wiring) for a
  // portable, side-effect-free stand-in. This proves the real env -i + run_env mechanism end to
  // end without needing root or the real /root/lobster-phase1 paths on the box running the test.
  function patchGateBody(marker: string, replacementCmd: string): { copy: string; dir: string } {
    const original = readFileSync(GATE, "utf8");
    const matches = original.split("\n").filter((l) => l.includes(marker));
    // codex-review round 2: a second, unnoticed match would silently patch the wrong allow() line
    // (or both) and this test would still pass on whichever line it happened to hit -- fail loud.
    expect(matches, `expected exactly one line matching ${JSON.stringify(marker)}, found ${matches.length}`).toHaveLength(1);
    const targetLine = matches[0];
    const patchedLine = targetLine.replace(/'[^']*'\s*$/, `'${replacementCmd}'`);
    expect(patchedLine, "replacement must actually change the line").not.toBe(targetLine);
    const patched = original.replace(targetLine, patchedLine);
    const dir = mkdtempSync(path.join(tmpdir(), "aw-gate-patched-"));
    const copy = path.join(dir, "aw-autorepair-gate.sh");
    writeFileSync(copy, patched, { mode: 0o755 });
    return { copy, dir };
  }

  it("BACKUP_DIR really propagates into the child process through the real exec path (env -i ... run_env)", () => {
    const eu = sent.find((c) => c.startsWith("/root/scripts/backup-eu-stack.sh"));
    expect(eu).toBeDefined();
    const { copy, dir } = patchGateBody("BACKUP_DIR=/root/backups-stack", "printenv BACKUP_DIR");
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, SSH_CLIENT: "contract-test 0 0", SSH_ORIGINAL_COMMAND: "printenv BACKUP_DIR" };
      const r = spawnSync("bash", [copy], { env, encoding: "utf8" });
      expect({ status: r.status, stdout: (r.stdout ?? "").trim() }).toEqual({ status: 0, stdout: "/root/backups-stack" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("env -i resets PATH to the gate's hardcoded value and drops LC_ALL and an arbitrary ambient marker", () => {
    // `test`/`cd` are bash builtins, so poisoning PATH can't be observed through the real probe
    // commands (builtins always win over PATH lookup) -- dump the child's actual environment instead.
    // LC_ALL specifically matters: sshd's AcceptEnv on ks-aw-01 is `LANG LC_*` (verified below),
    // so LC_ALL is the one variable here an SSH client can genuinely set.
    const probeMarker = "test -f /root/lobster-phase1/scripts/backup-phase1.sh";
    const { copy, dir } = patchGateBody(probeMarker, "env");
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        SSH_CLIENT: "contract-test 0 0",
        SSH_ORIGINAL_COMMAND: "env", // the patched allow() body, not the original probe string
        LC_ALL: "C.UTF-8/../../malicious",
        AW_GATE_ATTACKER_MARKER: "should-not-survive-env-i",
        // Prepend, don't replace: spawnSync itself needs the real PATH to locate `bash`. The
        // assertion below is unaffected either way -- env -i must drop ALL of this, decoy or real.
        PATH: `${dir}:${process.env.PATH ?? ""}`,
      };
      const r = spawnSync("bash", [copy], { env, encoding: "utf8" });
      expect(r.status).toBe(0);
      const lines = (r.stdout ?? "").split("\n");
      expect(lines).toContain("PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin");
      expect(lines.some((l) => l.startsWith("LC_ALL="))).toBe(false);
      expect(lines.some((l) => l.startsWith("AW_GATE_ATTACKER_MARKER="))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("documents, rather than claims to fix, the BASH_ENV gap when this script is invoked directly", () => {
    // This test invokes the gate script directly (no wrapper), the way it behaves if SOMETHING
    // upstream ever hands it a BASH_ENV. On ks-aw-01 today that's not reachable: round-1 review
    // found `sshd -T` AcceptEnv=`LANG LC_*` only was too narrow a check; round 2 (WORKLOG 續107)
    // full-audited every other source bash/sshd could pull BASH_ENV/ENV from (SetEnv,
    // PermitUserEnvironment, ~/.ssh/environment, authorized_keys environment=, systemd/PAM env)
    // and found all clean, AND the real authorized_keys command= wraps this script in `env -u
    // BASH_ENV -u ENV` as defense-in-depth (see the gate script's own header comment for both).
    // This test exists so nobody re-derives "let's add `unset BASH_ENV`" INSIDE the script as a
    // fix (it was tried and measured to do nothing -- bash sources $BASH_ENV at interpreter
    // startup, before line 1 of ANY script it's given, including one that immediately unsets it)
    // and so a regression in either real control (the audit going stale, or the wrapper being
    // dropped from authorized_keys) has a concrete, currently-passing assertion to break against.
    const probeMarker = "test -f /root/lobster-phase1/scripts/backup-phase1.sh";
    const { copy, dir } = patchGateBody(probeMarker, "env");
    try {
      const poisonBashEnv = path.join(dir, "poison-bashenv.sh");
      writeFileSync(poisonBashEnv, "echo POISONED_VIA_BASH_ENV\n");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        SSH_CLIENT: "contract-test 0 0",
        SSH_ORIGINAL_COMMAND: "env",
        BASH_ENV: poisonBashEnv,
      };
      const r = spawnSync("bash", [copy], { env, encoding: "utf8" });
      // The side effect already happened before env -i existed as a concept in this run; env -i
      // still correctly keeps BASH_ENV itself OUT of the allowed command's own environment.
      expect(r.stdout).toContain("POISONED_VIA_BASH_ENV");
      expect((r.stdout ?? "").split("\n").some((l) => l.startsWith("BASH_ENV="))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("forced path stdout is exactly empty for a denied command (nothing executes)", () => {
    const r = gateForced("printenv BACKUP_DIR"); // allowed only in the EU leg, not standalone
    expect(r.status).toBe(126);
    expect(r.stdout).toBe("");
  });
});

describe("aw-autorepair-gate denies anything else", () => {
  const probe = "test -f /root/scripts/backup-eu-stack.sh && echo OK || echo MISSING";
  it.each([
    ["arbitrary command", "id"],
    ["allowed command plus a chained command", `${probe}; id`],
    ["allowed command plus trailing space", `${probe} `],
    ["case variant", probe.toUpperCase()],
    ["empty (interactive shell request)", ""],
    ["remediation restart (deliberately not allowed)", "cd /root/lobster-phase1 && docker compose restart next-admin"],
  ])("%s", (_name, cmd) => {
    expect(gate(["--check"], cmd)).toMatchObject({ status: 126, stdout: "DENY" });
  });

  it("forced-command mode refuses without executing and reports on stderr", () => {
    const r = gate([], "echo SHOULD-NOT-RUN");
    expect(r.status).toBe(126);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("command not allowed");
  });
});
