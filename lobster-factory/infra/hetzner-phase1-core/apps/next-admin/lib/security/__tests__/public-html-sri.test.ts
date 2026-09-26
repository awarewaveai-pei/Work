// T23: every external <script src> / <link rel="stylesheet" href> in NA/public/**/*.html must be
// version-pinned and carry integrity + crossorigin. NA/public/vector-editor.html runs on the app
// origin, outside login, where the Supabase session cookie is readable by JS -- a compromised CDN
// file there is session theft. No allowlist: a new tag gets its hash from the CDN-published SRI.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractExternalTags, hasValidIntegrityFormat, isVersionPinned, tagViolations } from "../public-html-sri";

const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "..", "public");

function walkHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function relOf(file: string): string {
  return path.relative(PUBLIC_DIR, file).replace(/\\/g, "/");
}

describe("public/**/*.html: every external script/stylesheet is pinned + SRI'd (T23)", () => {
  it("sanity: finds the real public/ directory and at least one html file", () => {
    const files = walkHtmlFiles(PUBLIC_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  it("every external tag is compliant", () => {
    const files = walkHtmlFiles(PUBLIC_DIR);
    const violations: string[] = [];
    for (const file of files) {
      const rel = relOf(file);
      const html = fs.readFileSync(file, "utf8");
      for (const tag of extractExternalTags(html)) {
        const reasons = tagViolations(tag);
        if (reasons.length === 0) continue;
        violations.push(`${rel}: <${tag.kind}> ${tag.url} -- ${reasons.join("; ")}`);
      }
    }
    if (violations.length > 0) {
      throw new Error(`${violations.length} external tag(s) fail the SRI contract:\n` + violations.map((v) => `  - ${v}`).join("\n"));
    }
    expect(violations).toEqual([]);
  });
});

describe("parser + rule contract (synthetic fixtures)", () => {
  const GOOD =
    '<script src="https://cdn.example.com/pkg@1.2.3/pkg.min.js" integrity="sha384-abcDEF123+/=" crossorigin="anonymous"></script>';

  it("positive control: a script with no integrity/crossorigin/pinning is flagged (all three reasons)", () => {
    const html = '<script src="https://cdn.example.com/pkg/latest/pkg.min.js"></script>';
    const [tag] = extractExternalTags(html);
    const reasons = tagViolations(tag);
    expect(reasons).toHaveLength(3);
  });

  it("negative control: a fully-compliant script tag has zero violations", () => {
    const [tag] = extractExternalTags(GOOD);
    expect(tagViolations(tag)).toEqual([]);
  });

  it("a compliant <link rel=stylesheet> is also recognized and passes", () => {
    const html = '<link rel="stylesheet" href="https://cdn.example.com/pkg@2.0.0/pkg.min.css" integrity="sha384-xyz" crossorigin="anonymous">';
    const [tag] = extractExternalTags(html);
    expect(tag.kind).toBe("link");
    expect(tagViolations(tag)).toEqual([]);
  });

  it("a same-origin (relative) script/link is not flagged at all -- only external tags are extracted", () => {
    const html = '<script src="/vendor/local.js"></script><link rel="stylesheet" href="./styles.css">';
    expect(extractExternalTags(html)).toEqual([]);
  });

  it("version pinning: \"latest\" path segment is rejected", () => {
    expect(isVersionPinned("https://cdnjs.cloudflare.com/ajax/libs/foo/latest/foo.js")).toBe(false);
  });

  it("version pinning: a floating @latest (jsdelivr) is rejected", () => {
    expect(isVersionPinned("https://cdn.jsdelivr.net/npm/foo@latest/foo.js")).toBe(false);
  });

  it("version pinning: a bare floating major (@2, no minor) is rejected", () => {
    expect(isVersionPinned("https://cdn.jsdelivr.net/npm/foo@2/foo.js")).toBe(false);
  });

  it("version pinning: full semver on both jsdelivr and cdnjs conventions is accepted", () => {
    expect(isVersionPinned("https://cdn.jsdelivr.net/npm/foo@1.2.3/foo.js")).toBe(true);
    expect(isVersionPinned("https://cdnjs.cloudflare.com/ajax/libs/foo/1.2.3/foo.js")).toBe(true);
  });

  it("version pinning: an unrecognized CDN URL shape fails closed (reported, not silently passed)", () => {
    expect(isVersionPinned("https://example.com/some/random/path.js")).toBe(false);
  });

  it("integrity format: accepts sha256/384/512, rejects garbage or empty", () => {
    expect(hasValidIntegrityFormat("sha384-abc123+/=")).toBe(true);
    expect(hasValidIntegrityFormat("sha256-abc123==")).toBe(true);
    expect(hasValidIntegrityFormat("sha512-abc123")).toBe(true);
    expect(hasValidIntegrityFormat("md5-abc123")).toBe(false);
    expect(hasValidIntegrityFormat("")).toBe(false);
    expect(hasValidIntegrityFormat(null)).toBe(false);
  });

  it("attribute extraction is order-independent (integrity/crossorigin before src)", () => {
    const html = '<script integrity="sha384-x" crossorigin="anonymous" src="https://cdn.example.com/pkg@1.0.0/pkg.js"></script>';
    const [tag] = extractExternalTags(html);
    expect(tagViolations(tag)).toEqual([]);
  });
});
