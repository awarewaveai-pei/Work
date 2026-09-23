// C1 pages: one canonical URL per page, page_id = sha256(canonical)[0:16]. Query strings never
// survive (tracking/session tokens, C12).
import { describe, expect, it } from "vitest";
import { canonicalUrl, pageIdFor, pagesForSiteUrl } from "@/lib/site-watch/pages";

describe("canonicalUrl", () => {
  it("lowercases scheme and host, drops the default port, query, fragment and trailing slash", () => {
    expect(canonicalUrl("HTTPS://Shop.Example.COM:443/Path/?session=abc#top")).toBe("https://shop.example.com/Path");
    expect(canonicalUrl("  https://shop.example.com///  ")).toBe("https://shop.example.com");
    expect(canonicalUrl("http://shop.example.com:8080/")).toBe("http://shop.example.com:8080");
  });

  it("refuses anything that is not an absolute http(s) URL without credentials", () => {
    for (const bad of ["ftp://x.com", "javascript:alert(1)", "file:///etc/passwd", "shop.example.com", "", "https://user:pw@x.com"]) {
      expect([bad, canonicalUrl(bad)]).toEqual([bad, null]);
    }
  });
});

describe("pageIdFor / pagesForSiteUrl", () => {
  it("page ids are 16 hex chars and stable across spellings of the same page", () => {
    const a = pagesForSiteUrl("https://Shop.example.com/?utm_source=x");
    const b = pagesForSiteUrl("https://shop.example.com");
    expect(a).toEqual(b);
    expect(a[0].pageId).toMatch(/^[0-9a-f]{16}$/);
    expect(a[0].pageId).toBe(pageIdFor("https://shop.example.com"));
  });

  it("no usable site_url = no pages (the target runs nothing)", () => {
    expect(pagesForSiteUrl(undefined)).toEqual([]);
    expect(pagesForSiteUrl(42)).toEqual([]);
    expect(pagesForSiteUrl("not a url")).toEqual([]);
  });
});
