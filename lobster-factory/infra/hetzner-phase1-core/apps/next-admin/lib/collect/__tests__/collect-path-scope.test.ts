// A path prefix is a path boundary (lib/collect/canonical.ts underPath): "/faq" covers /faq and /faq/..., never
// /faqs; a lead's website under a path (/company/abc, /@biz) is crawled under that path only (lib/collect/run.ts).
import { describe, expect, it } from "vitest";
import { inScope, siteScope, underPath } from "@/lib/collect/canonical";

describe("siteScope", () => {
  it("a path without a trailing slash is the site's directory; a file name is not", () => {
    expect(siteScope("https://www.104.com.tw/company/abc123").pathPrefix).toBe("/company/abc123");
    expect(siteScope("https://medium.com/@biz").pathPrefix).toBe("/@biz");
    expect(siteScope("https://medium.com/@john.doe").pathPrefix).toBe("/@john.doe");
    expect(siteScope("https://mall.example/store/abc.tw").pathPrefix).toBe("/store/abc.tw");
    expect(siteScope("https://example.com/shop/").pathPrefix).toBe("/shop");
    expect(siteScope("https://example.com/shop/index.html").pathPrefix).toBe("/shop");
    expect(siteScope("https://www.tree.example/").pathPrefix).toBeUndefined();
    expect(siteScope("https://www.tree.example").hosts).toEqual(["www.tree.example", "tree.example"]);
  });
});

describe("underPath", () => {
  it("is a boundary, not a string prefix", () => {
    expect(underPath("/faq", "/faq")).toBe(true);
    expect(underPath("/faq/a", "/faq")).toBe(true);
    expect(underPath("/faq/a", "/faq/")).toBe(true);
    expect(underPath("/faqs", "/faq")).toBe(false);
    expect(underPath("/company/abc123x", "/company/abc123")).toBe(false);
    expect(underPath("/anything", "")).toBe(true);
  });
  it("inScope applies it", () => {
    const scope = { hosts: ["www.104.com.tw"], pathPrefix: "/company/abc123" };
    expect(inScope("https://www.104.com.tw/company/abc123/jobs", scope)).toBe(true);
    expect(inScope("https://www.104.com.tw/company/xyz999", scope)).toBe(false);
    expect(inScope("https://medium.com/@other", { hosts: ["medium.com"], pathPrefix: "/@biz" })).toBe(false);
  });
});
