import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseArgs, runCli } from "./cli";

describe("parseArgs", () => {
  it("parses --key value pairs and boolean flags", () => {
    const a = parseArgs(["--site-id", "abc", "--tier", "business", "--dry"]);
    expect(a).toEqual({ "site-id": "abc", tier: "business", dry: "true" });
  });
});

describe("runCli", () => {
  const orig = Object.assign({}, process.env);
  beforeEach(() => { process.env = Object.assign({}, orig); });
  afterEach(() => { process.env = Object.assign({}, orig); });

  it("exits 2 on missing required args", async () => {
    const r = await runCli(["--tier", "business"]);
    expect(r.code).toBe(2);
  });

  it("runs the full chain in mock mode (no network, exit 0)", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    delete process.env.CLOUDFLARE_API_TOKEN;
    const r = await runCli([
      "--site-id", "00000000-0000-0000-0000-000000000001",
      "--site-name", "Acme Shop",
      "--org-id", "00000000-0000-0000-0000-000000000002",
      "--tier", "commerce",
    ]);
    expect(r.code).toBe(0);
    const out = r.output as any;
    expect(out.status).toBe("mock");
    expect(out.serverType).toBe("cpx31"); // commerce → cpx31
    expect(out.region).toBe("sin");
    expect(out.ref.adapter).toBe("mock");
  });

  it("none mode (default) → idle, exit 0", async () => {
    delete process.env.LOBSTER_SERVER_ADAPTER;
    const r = await runCli([
      "--site-id", "00000000-0000-0000-0000-000000000001",
      "--site-name", "Acme",
      "--org-id", "00000000-0000-0000-0000-000000000002",
    ]);
    expect(r.code).toBe(0);
    expect((r.output as any).status).toBe("idle");
  });

  it("hetzner_cloud without token → blocked, exit 1", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "hetzner_cloud";
    delete process.env.HETZNER_STAGING_TOKEN;
    const r = await runCli([
      "--site-id", "00000000-0000-0000-0000-000000000001",
      "--site-name", "Acme",
      "--org-id", "00000000-0000-0000-0000-000000000002",
    ]);
    expect(r.code).toBe(1);
    expect((r.output as any).status).toBe("blocked");
  });
});
