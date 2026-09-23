// Guard for the only Trigger deploy path: every process.env read inside trigger.config.ts syncEnvVars must be
// exported by $deployBash in scripts/lobster-trigger-deploy.ps1, or be listed in NOT_SYNCED_BY_DEPLOY.
// syncEnvVars skips empty values, so an unexported read is never synced and nothing reports it (8 such reads
// on 2026-09-23, after five one-variable-at-a-time fixes). lobster-trigger-deploy.ps1 runs this file before
// every deploy and aborts when it is red.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

type SyncFn = () => unknown;
const captured = vi.hoisted(() => ({ fn: undefined as SyncFn | undefined }));

vi.mock("@trigger.dev/build/extensions/core", () => ({
  syncEnvVars: (fn: SyncFn) => {
    captured.fn = fn;
    return { name: "SyncEnvVarsExtension" };
  },
}));
vi.mock("@trigger.dev/sdk", () => ({ defineConfig: (config: unknown) => config }));

// Read by syncEnvVars but deliberately NOT exported by the deploy. The test also fails when an entry goes
// stale (no longer read, or exported after all), so this list cannot quietly become a permanent exemption.
// orchestrate-tenant-provisioning vendor credentials: absent from Trigger prod (checked 2026-09-23) and the
// task has never run there. Syncing them lets it create real GitHub repos / Sentry + PostHog projects / n8n
// workflows, which is an operator decision (agency-os/TASKS.md). To wire one: export it in $deployBash and
// delete it here.
const NOT_SYNCED_BY_DEPLOY = new Set([
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG_SLUG",
  "TENANT_PROVISION_GITHUB_TOKEN",
  "POSTHOG_PERSONAL_API_KEY",
  "N8N_API_KEY",
  "UPTIME_KUMA_API_KEY",
  "TENANT_PROVISION_SUPABASE_ACCESS_TOKEN",
]);

const DEPLOY_SCRIPT = fileURLToPath(new URL("../../../../../../scripts/lobster-trigger-deploy.ps1", import.meta.url));

/** Names exported by the bash payload before `trigger deploy` runs. Comment lines never count. */
function deployBashExports(ps1: string): Set<string> {
  const here = ps1.match(/\$deployBash\s*=\s*@"\r?\n([\s\S]*?)\r?\n"@/);
  if (!here) throw new Error("$deployBash here-string not found in lobster-trigger-deploy.ps1");
  const lines = here[1].split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
  const deployAt = lines.findIndex((line) => /\/trigger deploy\b/.test(line));
  if (deployAt < 0) throw new Error("no `trigger deploy` command found in $deployBash");
  const body = lines.slice(0, deployAt).join("\n");

  const names = new Set<string>();
  // export NAME=...   export "NAME=...   export 'NAME=...
  for (const m of body.matchAll(/^\s*export\s+["']?([A-Za-z_][A-Za-z0-9_]*)=/gm)) names.add(m[1]);
  // for v in A B C; do export "$v=..."; done   (bash `$` is written `$ inside the PowerShell here-string)
  for (const m of body.matchAll(/^\s*for\s+(\w+)\s+in\s+([^;\n]+);\s*do\b([\s\S]*?)^\s*done\b/gm)) {
    const [, loopVar, list, loopBody] = m;
    if (new RegExp(`export\\s+["']?\`?\\$${loopVar}=`).test(loopBody)) {
      for (const name of list.trim().split(/\s+/)) names.add(name);
    }
  }
  return names;
}

/** Every env name the callback reads, observed by running it (all branches) plus its literal source. */
async function syncEnvVarsReads(fn: SyncFn): Promise<Set<string>> {
  const source = fn.toString();
  // The proxy is swapped back right after the synchronous part of the call; an `await` inside the callback
  // would hide every read after it, so refuse to certify such a callback instead of passing it.
  if (/\bawait\b/.test(source)) throw new Error("syncEnvVars callback awaits: extend this harness first");

  const seen = new Set<string>();
  // undefined -> every `?? fallback` read runs; "x" -> every `if (value.trim())` branch runs.
  for (const fill of [undefined, "x"]) {
    const real = process.env;
    process.env = new Proxy({} as NodeJS.ProcessEnv, {
      get: (_target, key) => {
        if (typeof key === "string") seen.add(key);
        return fill;
      },
      has: (_target, key) => {
        if (typeof key === "string") seen.add(key);
        return fill !== undefined;
      },
    });
    let pending: unknown;
    try {
      pending = fn();
    } finally {
      process.env = real;
    }
    await pending;
  }
  for (const m of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*["'`]([^"'`]+)["'`]\s*\]/g)) {
    seen.add(m[1] ?? m[2]);
  }
  return seen;
}

describe("syncEnvVars <-> lobster-trigger-deploy.ps1 env parity", () => {
  let reads: Set<string>;
  let exported: Set<string>;

  beforeAll(async () => {
    await import("../../../trigger.config");
    if (!captured.fn) throw new Error("trigger.config.ts did not call syncEnvVars()");
    reads = await syncEnvVarsReads(captured.fn);
    exported = deployBashExports(readFileSync(DEPLOY_SCRIPT, "utf8"));
  });

  it("sees the callback and the payload (harness sanity)", () => {
    expect(reads).toContain("LOBSTER_SUPABASE_SERVICE_ROLE_KEY");
    expect(exported).toContain("LOBSTER_SUPABASE_SERVICE_ROLE_KEY");
    expect(exported).toContain("MAINWP_CONSUMER_SECRET"); // for-loop export form
  });

  it("every syncEnvVars read is exported by $deployBash or listed in NOT_SYNCED_BY_DEPLOY", () => {
    const missing = [...reads].filter((name) => !exported.has(name) && !NOT_SYNCED_BY_DEPLOY.has(name)).sort();
    expect(missing, "export these in $deployBash (scripts/lobster-trigger-deploy.ps1)").toEqual([]);
  });

  it("NOT_SYNCED_BY_DEPLOY has no stale entries", () => {
    expect([...NOT_SYNCED_BY_DEPLOY].filter((name) => !reads.has(name)), "no longer read: delete").toEqual([]);
    expect([...NOT_SYNCED_BY_DEPLOY].filter((name) => exported.has(name)), "now exported: delete").toEqual([]);
  });
});

describe("deployBashExports parser", () => {
  const wrap = (bash: string) => `$deployBash = @"\n${bash}\n./node_modules/.bin/trigger deploy\nexport LATE=1\n"@\n`;

  it("counts plain, quoted and for-loop exports", () => {
    const names = deployBashExports(
      wrap('export A=1\nexport "B=`$(x)"\nfor v in C D; do\n  export "`$v=`$(y)"\ndone'),
    );
    expect([...names].sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("ignores commented-out exports and anything after `trigger deploy`", () => {
    const names = deployBashExports(wrap("  # export GONE=1\nexport KEPT=1"));
    expect([...names]).toEqual(["KEPT"]);
  });

  it("fails closed when the payload cannot be found", () => {
    expect(() => deployBashExports("no here-string")).toThrow(/here-string not found/);
    expect(() => deployBashExports('$deployBash = @"\nexport A=1\n"@\n')).toThrow(/trigger deploy/);
  });
});
