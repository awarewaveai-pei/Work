import { describe, it, expect } from "vitest";
import { provisionClient, type ProvisionClientDeps } from "./provisionClient";
import type { ServerProvisionResult } from "../hosting/serverTypes";
import type { ServerProvisionAdapter } from "../hosting/providers/serverProvisionContract";

const INPUT = {
  siteId: "00000000-0000-0000-0000-000000000001",
  siteName: "Acme Shop",
  organizationId: "00000000-0000-0000-0000-000000000002",
  region: "sin",
  serverType: "cpx21",
};

function adapterReturning(result: ServerProvisionResult): ServerProvisionAdapter {
  return { id: "fake", provisionServer: async () => result };
}

const MOCK_REF = {
  adapter: "mock" as const,
  serverId: "1",
  ipv4: "203.0.113.5",
  sshHost: "203.0.113.5",
  sshCredentialsRef: "vault://x",
  region: "sin",
  serverType: "cpx21",
  wpRootPath: "/var/www/html/x",
  provisioningNotes: [],
};

const dnsDeps = (calls: any[]): ProvisionClientDeps["dns"] => ({
  config: { apiToken: "t", zoneId: "z" },
  upsert: async (_cfg, input) => {
    calls.push(input);
    return { recordId: "rec1", name: input.name, created: true };
  },
});

describe("provisionClient", () => {
  it("idle passes through", async () => {
    const r = await provisionClient(INPUT, { serverAdapter: adapterReturning({ outcome: "idle" }) });
    expect(r.status).toBe("idle");
  });

  it("dry_run returns the plan without touching DNS", async () => {
    const dnsCalls: any[] = [];
    const plan = { adapter: "hetzner_cloud", serverType: "cpx21", region: "sin", image: "ubuntu-24.04", labels: {}, cloudInitBytes: 100, notes: [] };
    const r = await provisionClient(
      { ...INPUT, domain: "acme.aware-wave.com" },
      { serverAdapter: adapterReturning({ outcome: "dry_run", plan }), dns: dnsDeps(dnsCalls) }
    );
    expect(r.status).toBe("dry_run");
    expect(dnsCalls).toHaveLength(0);
  });

  it("mock host with a domain upserts the A-record", async () => {
    const dnsCalls: any[] = [];
    const r = await provisionClient(
      { ...INPUT, domain: "acme.aware-wave.com" },
      { serverAdapter: adapterReturning({ outcome: "mock", ref: MOCK_REF }), dns: dnsDeps(dnsCalls) }
    );
    expect(r.status).toBe("mock");
    if (r.status === "mock") {
      expect(r.dns?.name).toBe("acme.aware-wave.com");
      expect(r.dns?.created).toBe(true);
    }
    expect(dnsCalls[0]).toMatchObject({ name: "acme.aware-wave.com", ipv4: "203.0.113.5" });
  });

  it("provisioned host WITHOUT a domain skips DNS", async () => {
    const dnsCalls: any[] = [];
    const r = await provisionClient(INPUT, {
      serverAdapter: adapterReturning({ outcome: "provisioned", ref: { ...MOCK_REF, adapter: "hetzner_cloud" } }),
      dns: dnsDeps(dnsCalls),
    });
    expect(r.status).toBe("provisioned");
    if (r.status === "provisioned") expect(r.dns).toBeUndefined();
    expect(dnsCalls).toHaveLength(0);
  });

  it("reused host is reported and (with domain) DNS is re-asserted (idempotent)", async () => {
    const dnsCalls: any[] = [];
    const r = await provisionClient(
      { ...INPUT, domain: "acme.aware-wave.com" },
      { serverAdapter: adapterReturning({ outcome: "reused", ref: { ...MOCK_REF, adapter: "hetzner_cloud" } }), dns: dnsDeps(dnsCalls) }
    );
    expect(r.status).toBe("reused");
    expect(dnsCalls).toHaveLength(1);
  });

  it("blocked surfaces the message", async () => {
    const r = await provisionClient(INPUT, {
      serverAdapter: adapterReturning({ outcome: "blocked", adapter: "hetzner_cloud", message: "no token", missingEnv: [] }),
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.message).toContain("no token");
  });

  it("rolled_back surfaces the failure (M9 — no orphan)", async () => {
    const r = await provisionClient(INPUT, {
      serverAdapter: adapterReturning({ outcome: "rolled_back", serverId: "9", message: "boot failed, rolled back" }),
    });
    expect(r.status).toBe("rolled_back");
    if (r.status === "rolled_back") expect(r.message).toContain("rolled back");
  });
});
