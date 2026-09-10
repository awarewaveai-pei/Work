// Document identity (lib/kb/family.ts). Pure functions, so these are exact-value tests, not shape
// tests: a family id that drifts silently splits a document's version history across two families
// and nothing errors.

import { describe, expect, it } from "vitest";
import { canonicalKeyFor, contentHash, docFamilyId, uuidv5 } from "@/lib/kb/family";

describe("uuidv5", () => {
  it("matches the published RFC 4122 vector", () => {
    // uuidv5(DNS namespace, "example.com") — the value every uuid library agrees on. If this test
    // ever fails, families computed by this build do not match families computed by any other tool.
    expect(uuidv5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "example.com")).toBe(
      "cfbff0d1-9375-5685-968c-48ce8b15ae17",
    );
  });
  it("rejects a malformed namespace instead of hashing garbage", () => {
    expect(() => uuidv5("not-a-uuid", "x")).toThrow();
  });
});

describe("docFamilyId", () => {
  const orgA = "11111111-1111-4111-8111-111111111111";
  const orgB = "22222222-2222-4222-8222-222222222222";

  it("is stable for the same tenant + key", () => {
    expect(docFamilyId(orgA, "https://x.test/policy")).toBe(docFamilyId(orgA, "https://x.test/policy"));
  });

  it("separates tenants that ingest the same public URL", () => {
    // The whole reason the organization is inside the hash: a shared family id would make any
    // future family-wide delete that forgets an org filter delete across tenants, and RLS on these
    // tables is service_role only, so there is no database backstop.
    expect(docFamilyId(orgA, "https://x.test/policy")).not.toBe(docFamilyId(orgB, "https://x.test/policy"));
  });
});

describe("canonicalKeyFor", () => {
  it("prefers the canonical URL when there is one", () => {
    expect(canonicalKeyFor({ kind: "url", title: "退貨政策", canonicalUrl: "https://x.test/a" })).toBe("https://x.test/a");
  });
  it("falls back to kind + title for manual uploads", () => {
    expect(canonicalKeyFor({ kind: "sop", title: " 退貨政策 " })).toBe("kb://manual/sop/退貨政策");
  });
  it("treats an empty URL as absent", () => {
    expect(canonicalKeyFor({ kind: "doc", title: "T", canonicalUrl: "   " })).toBe("kb://manual/doc/T");
  });
});

describe("contentHash", () => {
  it("ignores line endings and trailing spaces", () => {
    expect(contentHash("a  \r\nb\r\n")).toBe(contentHash("a\nb"));
  });
  it("does not ignore a real edit", () => {
    expect(contentHash("退貨期限 7 天")).not.toBe(contentHash("退貨期限 14 天"));
  });
});
