// One WordPress install = origin + path: bridgeSiteOrg must not call a host with a staging install under a path ambiguous.
import { describe, expect, it } from "vitest";
import { bridgeSiteOrg, wpSiteKey } from "../woo";

const db = (rows: Array<{ url: string; organization_id: string | null }>) => ({
  from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }),
}) as never;

describe("wpSiteKey / bridgeSiteOrg", () => {
  it("normalizes case and trailing slashes; keeps the path", () => {
    expect(wpSiteKey("https://Aware-Wave.com/")).toBe("https://aware-wave.com");
    expect(wpSiteKey("https://aware-wave.com/staging/x/")).toBe("https://aware-wave.com/staging/x");
    expect(wpSiteKey("not a url")).toBeNull();
  });

  it("the main install's org, even with another org's staging install on the same host", async () => {
    const rows = [{ url: "https://aware-wave.com", organization_id: "ops" }, { url: "https://aware-wave.com/staging/e2e", organization_id: "e2e" }];
    expect(await bridgeSiteOrg(db(rows), "https://aware-wave.com")).toBe("ops");
    expect(await bridgeSiteOrg(db(rows), "https://aware-wave.com/staging/e2e/")).toBe("e2e");
  });

  it("no row for the install but rows on its host (http spelling, or only a path install): blocked (undefined)", async () => {
    expect(await bridgeSiteOrg(db([{ url: "http://x.example", organization_id: "a" }]), "https://x.example")).toBeUndefined();
    expect(await bridgeSiteOrg(db([{ url: "https://x.example/staging/s", organization_id: "a" }]), "https://x.example")).toBeUndefined();
    expect(await bridgeSiteOrg(db([{ url: "https://other.example", organization_id: "a" }]), "https://x.example")).toBeNull();
  });

  it("two orgs naming the same install stay ambiguous (undefined)", async () => {
    const rows = [{ url: "https://x.example/", organization_id: "a" }, { url: "https://X.example", organization_id: "b" }];
    expect(await bridgeSiteOrg(db(rows), "https://x.example")).toBeUndefined();
  });
});
