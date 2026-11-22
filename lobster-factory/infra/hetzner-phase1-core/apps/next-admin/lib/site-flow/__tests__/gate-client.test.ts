// gate-client staging adapter (critic finding: the gate runs staging scripts with plain bash, so a failed wp command
// followed by the closing echo would exit 0). The fixed script must stop at the first failure.
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
});
