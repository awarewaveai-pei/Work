// T23: every external <script src> / <link rel="stylesheet" href> in NA/public/**/*.html, and every external
// script a NA/public/**/*.js module injects at runtime, must be version-pinned and carry integrity + crossorigin.
// These files run on the app origin (the /tools/vector-pro dock blocks run inside the signed-in page), where the
// Supabase session cookie is readable by JS -- a compromised CDN file there is session theft. No allowlist: a new
// script gets its hash from the CDN-published SRI.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractExternalTags, hasValidIntegrityFormat, isVersionPinned, tagViolations } from "../public-html-sri";

const PUBLIC_DIR = path.resolve(__dirname, "..", "..", "..", "public");

function walkFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, ext));
    else if (entry.isFile() && entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}
const walkHtmlFiles = (dir: string) => walkFiles(dir, ".html");

function relOf(file: string): string {
  return path.relative(PUBLIC_DIR, file).replace(/\\/g, "/");
}

describe("public/**/*.html: every external script/stylesheet is pinned + SRI'd (T23)", () => {
  it("sanity: finds the real public/ directory and the modules that load CDN scripts", () => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, "editor-shared"))).toBe(true);
    expect(walkFiles(PUBLIC_DIR, ".js").length).toBeGreaterThan(0);
  });

  // A module injects a script with `s.src = "https://…js"` (or a URL constant) and sets s.integrity / s.crossOrigin on the
  // same element: every external .js URL in the file must be pinned, and the file must carry at least as many SRI hashes.
  it("every external script a public/**/*.js module loads is pinned + SRI'd + crossOrigin anonymous", () => {
    const violations: string[] = [];
    let loaders = 0;
    for (const file of walkFiles(PUBLIC_DIR, ".js")) {
      const src = fs.readFileSync(file, "utf8");
      const urls = [...src.matchAll(/["'`](https:\/\/[^"'`\s]+\.js)["'`]/g)].map((m) => m[1]);
      if (urls.length === 0) continue;
      loaders++;
      const hashes = [...src.matchAll(/["'`](sha(?:256|384|512)-[A-Za-z0-9+/=]+)["'`]/g)].map((m) => m[1]);
      for (const u of urls) if (!isVersionPinned(u)) violations.push(`${relOf(file)}: ${u} -- not version-pinned`);
      if (hashes.length < urls.length) violations.push(`${relOf(file)}: ${urls.length} script URL(s), ${hashes.length} integrity hash(es)`);
      for (const h of hashes) if (!hasValidIntegrityFormat(h)) violations.push(`${relOf(file)}: bad integrity ${h}`);
      if (!/crossOrigin\s*=\s*["']anonymous["']/.test(src)) violations.push(`${relOf(file)}: no crossOrigin = "anonymous"`);
    }
    expect(loaders, "no module loads a CDN script: the scan itself is broken").toBeGreaterThan(0);
    expect(violations).toEqual([]);
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
