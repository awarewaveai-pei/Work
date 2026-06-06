import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildServerAdapterFromEnv, serverTypeForTier } from "./serverAdapterFactory";

describe("serverTypeForTier (D6)", () => {
  it("maps tiers to AMD cpx types (cx deprecated)", () => {
    expect(serverTypeForTier("starter")).toBe("cpx11");
    expect(serverTypeForTier("business")).toBe("cpx21");
    expect(serverTypeForTier("commerce")).toBe("cpx31");
    expect(serverTypeForTier("premium")).toBe("cpx41");
  });
  it("falls back to cpx21 for an unknown tier", () => {
    expect(serverTypeForTier("enterprise")).toBe("cpx21");
  });
});

describe("buildServerAdapterFromEnv", () => {
  const orig = Object.assign({}, process.env);
  beforeEach(() => { process.env = Object.assign({}, orig); });
  afterEach(() => { process.env = Object.assign({}, orig); });

  it("none/unset → idle adapter", async () => {
    delete process.env.LOBSTER_SERVER_ADAPTER;
    const a = buildServerAdapterFromEnv({ region: "sin" });
    expect(a.id).toBe("none");
    expect(await a.provisionServer({ siteId: "s", siteName: "n", organizationId: "o", region: "sin", serverType: "cpx21", image: "ubuntu-24.04" })).toEqual({ outcome: "idle" });
  });

  it("mock → mock adapter", () => {
    process.env.LOBSTER_SERVER_ADAPTER = "mock";
    expect(buildServerAdapterFromEnv({ region: "sin" }).id).toBe("mock");
  });

  it("hetzner_cloud without token → blocked adapter (missing env surfaced)", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "hetzner_cloud";
    delete process.env.HETZNER_STAGING_TOKEN;
    const a = buildServerAdapterFromEnv({ region: "sin" });
    const r = await a.provisionServer({ siteId: "s", siteName: "n", organizationId: "o", region: "sin", serverType: "cpx21", image: "ubuntu-24.04" });
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(r.missingEnv).toContain("HETZNER_STAGING_TOKEN");
  });

  it("hetzner_cloud with token → real hetzner adapter", () => {
    process.env.LOBSTER_SERVER_ADAPTER = "hetzner_cloud";
    process.env.HETZNER_STAGING_TOKEN = "tok";
    expect(buildServerAdapterFromEnv({ region: "sin" }).id).toBe("hetzner_cloud");
  });

  it("unknown mode → blocked", async () => {
    process.env.LOBSTER_SERVER_ADAPTER = "aws";
    const a = buildServerAdapterFromEnv({ region: "sin" });
    const r = await a.provisionServer({ siteId: "s", siteName: "n", organizationId: "o", region: "sin", serverType: "cpx21", image: "ubuntu-24.04" });
    expect(r.outcome).toBe("blocked");
  });
});
