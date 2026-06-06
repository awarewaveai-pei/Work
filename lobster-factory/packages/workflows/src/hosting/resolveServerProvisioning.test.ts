import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveServerProvisioning,
  isBillableProvisionEnabled,
} from "./resolveServerProvisioning";

const BASE_INPUT = {
  siteId: "00000000-0000-0000-0000-000000000001",
  siteName: "Test Site",
  organizationId: "00000000-0000-0000-0000-000000000002",
  region: "sin",
  serverType: "cpx21",
  image: "ubuntu-24.04",
};

describe("resolveServerProvisioning", () => {
  const originalEnv = Object.assign({}, process.env);

  beforeEach(() => {
    process.env = Object.assign({}, originalEnv);
  });

  afterEach(() => {
    process.env = Object.assign({}, originalEnv);
  });

  it("returns idle when LOBSTER_SERVER_ADAPTER is not set", async () => {
    delete process.env.LOBSTER_SERVER_ADAPTER;
    const result = await resolveServerProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("idle");
  });

  it('returns idle when LOBSTER_SERVER_ADAPTER="none"', async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "none";
    const result = await resolveServerProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("idle");
  });

  it('returns mock ref when LOBSTER_SERVER_ADAPTER="mock"', async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    const result = await resolveServerProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("mock");
    if (result.outcome === "mock") {
      expect(result.ref.adapter).toBe("mock");
      expect(result.ref.serverId).toMatch(/^\d+$/);
      expect(result.ref.ipv4).toMatch(/^203\.0\.113\.\d{1,3}$/); // RFC 5737 doc space
      expect(result.ref.sshHost).toBe(result.ref.ipv4);
      expect(result.ref.region).toBe("sin");
      expect(result.ref.serverType).toBe("cpx21");
      // secrets rule: ref carries a vault pointer, never a key value
      expect(result.ref.sshCredentialsRef).toMatch(/^vault:\/\//);
    }
  });

  it("mock server ref is deterministic for same siteId", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    const r1 = await resolveServerProvisioning(BASE_INPUT);
    const r2 = await resolveServerProvisioning(BASE_INPUT);
    expect(r1).toEqual(r2);
  });

  it("mock server ref differs for different siteIds", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    const r1 = await resolveServerProvisioning(BASE_INPUT);
    const r2 = await resolveServerProvisioning({
      ...BASE_INPUT,
      siteId: "00000000-0000-0000-0000-000000000099",
    });
    if (r1.outcome === "mock" && r2.outcome === "mock") {
      expect(r1.ref.serverId).not.toBe(r2.ref.serverId);
    }
  });

  it("mock never emits a non-documentation IP (no real routable address)", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    const result = await resolveServerProvisioning(BASE_INPUT);
    if (result.outcome === "mock") {
      expect(result.ref.ipv4.startsWith("203.0.113.")).toBe(true);
    }
  });

  it('returns blocked (not implemented) for "hetzner_cloud" until provider lands', async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "hetzner_cloud";
    const result = await resolveServerProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.adapter).toBe("hetzner_cloud");
      expect(result.message).toContain("not implemented");
    }
  });

  it("returns blocked for unknown adapter value", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "digitalocean";
    const result = await resolveServerProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.message).toContain("digitalocean");
    }
  });

  it("billable gate is OFF by default and only true on explicit opt-in", () => {
    delete process.env.LOBSTER_SERVER_PROVISION_ENABLED;
    expect(isBillableProvisionEnabled()).toBe(false);
    process.env.LOBSTER_SERVER_PROVISION_ENABLED = "false";
    expect(isBillableProvisionEnabled()).toBe(false);
    process.env.LOBSTER_SERVER_PROVISION_ENABLED = "true";
    expect(isBillableProvisionEnabled()).toBe(true);
    process.env.LOBSTER_SERVER_PROVISION_ENABLED = "1";
    expect(isBillableProvisionEnabled()).toBe(true);
  });
});
