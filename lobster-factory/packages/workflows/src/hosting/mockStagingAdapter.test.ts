import { describe, it, expect } from "vitest";
import {
  deterministicMockEnvironmentId,
  buildMockStagingSiteRef,
} from "./mockStagingAdapter";

const SITE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ORG_ID = "11111111-2222-3333-4444-555555555555";

describe("deterministicMockEnvironmentId", () => {
  it("returns a UUID v4-shaped string", () => {
    const id = deterministicMockEnvironmentId(SITE_ID);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("is deterministic for same input", () => {
    expect(deterministicMockEnvironmentId(SITE_ID)).toBe(
      deterministicMockEnvironmentId(SITE_ID)
    );
  });

  it("differs for different siteIds", () => {
    const id1 = deterministicMockEnvironmentId(SITE_ID);
    const id2 = deterministicMockEnvironmentId("ffffffff-ffff-ffff-ffff-ffffffffffff");
    expect(id1).not.toBe(id2);
  });
});

describe("buildMockStagingSiteRef", () => {
  const input = { siteId: SITE_ID, siteName: "My Test Site", organizationId: ORG_ID };
  const ref = buildMockStagingSiteRef(input);

  it("adapter is mock", () => {
    expect(ref.adapter).toBe("mock");
  });

  it("wpRootPath contains siteId", () => {
    expect(ref.wpRootPath).toContain(SITE_ID);
  });

  it("stagingSiteUrl is absolute and contains siteId", () => {
    expect(ref.stagingSiteUrl).toMatch(/^https?:\/\//);
    expect(ref.stagingSiteUrl).toContain(SITE_ID);
  });

  it("wpAdminUrl ends with wp-admin/", () => {
    expect(ref.wpAdminUrl).toMatch(/\/wp-admin\/$/);
  });

  it("provisioningNotes is non-empty array of strings", () => {
    expect(Array.isArray(ref.provisioningNotes)).toBe(true);
    expect(ref.provisioningNotes.length).toBeGreaterThan(0);
    ref.provisioningNotes.forEach((n) => expect(typeof n).toBe("string"));
  });

  it("slugifies site name in paths", () => {
    const r = buildMockStagingSiteRef({ ...input, siteName: "Hello World!! 123" });
    expect(r.wpRootPath).toContain("hello-world-123");
  });
});
