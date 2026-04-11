import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveStagingProvisioning } from "./resolveStagingProvisioning";

const BASE_INPUT = {
  siteId: "00000000-0000-0000-0000-000000000001",
  siteName: "Test Site",
  organizationId: "00000000-0000-0000-0000-000000000002",
};

describe("resolveStagingProvisioning", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns idle when LOBSTER_HOSTING_ADAPTER is not set", async () => {
    delete process.env.LOBSTER_HOSTING_ADAPTER;
    const result = await resolveStagingProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("idle");
  });

  it('returns idle when LOBSTER_HOSTING_ADAPTER="none"', async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "none";
    const result = await resolveStagingProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("idle");
  });

  it('returns mock ref when LOBSTER_HOSTING_ADAPTER="mock"', async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "mock";
    const result = await resolveStagingProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("mock");
    if (result.outcome === "mock") {
      expect(result.ref.adapter).toBe("mock");
      expect(result.ref.environmentId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(result.ref.stagingSiteUrl).toContain(BASE_INPUT.siteId);
      expect(result.ref.wpAdminUrl).toContain("wp-admin");
    }
  });

  it("mock environmentId is deterministic for same siteId", async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "mock";
    const r1 = await resolveStagingProvisioning(BASE_INPUT);
    const r2 = await resolveStagingProvisioning(BASE_INPUT);
    expect(r1).toEqual(r2);
  });

  it("mock environmentId differs for different siteIds", async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "mock";
    const r1 = await resolveStagingProvisioning(BASE_INPUT);
    const r2 = await resolveStagingProvisioning({
      ...BASE_INPUT,
      siteId: "00000000-0000-0000-0000-000000000099",
    });
    if (r1.outcome === "mock" && r2.outcome === "mock") {
      expect(r1.ref.environmentId).not.toBe(r2.ref.environmentId);
    }
  });

  it("returns blocked for unknown adapter value", async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "unknown_vendor";
    const result = await resolveStagingProvisioning(BASE_INPUT);
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.message).toContain("unknown_vendor");
    }
  });

  it("site name with special chars is slugified in mock paths", async () => {
    process.env.LOBSTER_HOSTING_ADAPTER = "mock";
    const result = await resolveStagingProvisioning({
      ...BASE_INPUT,
      siteName: "My Client's Site!!",
    });
    if (result.outcome === "mock") {
      expect(result.ref.wpRootPath).not.toContain("'");
      expect(result.ref.wpRootPath).not.toContain("!");
      expect(result.ref.wpRootPath).toMatch(/[a-z0-9-]+/);
    }
  });
});
