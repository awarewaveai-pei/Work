// gate-client staging adapter (critic finding: the gate runs staging scripts with plain bash, so a failed wp command
// followed by the closing echo would exit 0). The fixed script must stop at the first failure.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSiteGateClient } from "../gate-client";

describe("staging-subdir adapter", () => {
  it("sends a fixed script that starts with set -euo pipefail, on staging-wp <slug>", async () => {
    const sent: Array<{ command: string; stdin?: string }> = [];
    const gate = createSiteGateClient(
      { provider: "ks-aw-01-staging-subdir", slug: "acme", domain: null },
      { exec: async (command, stdin) => (sent.push({ command, stdin }), { code: 0, stdout: '{"ok":true}\n', stderr: "" }) },
    );
    const r = await gate.wp("plugins", ["fluentform", "kadence-blocks"]);
    expect(r.ok).toBe(true);
    expect(sent[0].command).toBe("staging-wp acme");
    expect(sent[0].stdin?.split("\n")[0]).toBe("set -euo pipefail");
  });

  it("an argument starting with - never reaches the host", async () => {
    let calls = 0;
    const gate = createSiteGateClient(
      { provider: "ks-aw-01-docker", slug: "acme", domain: "acme.example.com" },
      { exec: async () => (calls++, { code: 0, stdout: "{}", stderr: "" }) },
    );
    const r = await gate.wp("plugins", ["--require=/tmp/x.php"]);
    expect(r).toMatchObject({ ok: false, error: "invalid_argument" });
    expect(calls).toBe(0);
  });

  // SF-I item 5: put-bridge-pubkey on a staging subdirectory site (the gate has it only for site-wp docker sites).
  const PUB = "q3Xb0Jm7uYk1y9b7cFvQ0mI0b3w8k2m5dFhV2nQxYzA=";
  const stagingSent = () => {
    const sent: Array<{ command: string; stdin?: string }> = [];
    const gate = createSiteGateClient(
      { provider: "ks-aw-01-staging-subdir", slug: "acme", domain: null },
      { exec: async (command, stdin) => (sent.push({ command, stdin }), { code: 0, stdout: `{"state":"created","key_id":"aw-1"}${"\n"}`, stderr: "" }) },
    );
    return { gate, sent };
  };

  it("put-bridge-pubkey: a fixed script on staging-wp <slug>; it runs, hands only the public key to wp eval, prints one JSON line", async () => {
    const { gate, sent } = stagingSent();
    const r = await gate.wp("put-bridge-pubkey", ["aw-1", PUB, "write"]);
    expect(r).toMatchObject({ ok: true, data: { state: "created", key_id: "aw-1" } });
    expect(sent[0].command).toBe("staging-wp acme");
    const script = sent[0].stdin!;
    expect(spawnSync("bash", ["-n"], { input: script, encoding: "utf8" }).status).toBe(0);
    const dir = mkdtempSync(path.join(tmpdir(), "aw-bridge-"));
    try {
      // php stub: report the env the script exported and whether the eval code arrived whole, then answer like wp eval
      const stub = [
        "#!/bin/bash",
        'for a in "$@"; do case "$a" in *awbridge_keys*) echo "EVAL_OK" >&2;; esac; done',
        'echo "ENV:$AW_KEY_ID:$AW_PUB:$AW_SCOPE" >&2',
        "echo -n reused",
        "",
      ].join("\n");
      writeFileSync(path.join(dir, "php"), stub, { mode: 0o755 });
      const run = spawnSync("bash", ["-s"], { input: script, encoding: "utf8", env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}` } });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stderr).toContain("EVAL_OK");
      expect(run.stderr).toContain(`ENV:aw-1:${PUB}:write`);
      expect(run.stdout.trim().split(/\n/).pop()).toBe('{"state":"reused","key_id":"aw-1"}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("put-bridge-pubkey: a key id or public key outside the gate's grammar never reaches the host", async () => {
    const { gate, sent } = stagingSent();
    expect(await gate.wp("put-bridge-pubkey", ["aw-1", "not-a-key", "write"])).toMatchObject({ ok: false });
    expect(await gate.wp("put-bridge-pubkey", ["aw'1", PUB, "write"])).toMatchObject({ ok: false });
    expect(await gate.wp("put-bridge-pubkey", ["aw-1", PUB, "admin"])).toMatchObject({ ok: false });
    expect(sent).toEqual([]);
  });
});
