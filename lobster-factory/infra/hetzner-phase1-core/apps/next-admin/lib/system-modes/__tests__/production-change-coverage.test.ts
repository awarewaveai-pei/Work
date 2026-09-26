// Structural test: any file that imports a production-changing primitive (ssh2, the repair-center
// SSH wrapper, the WP Bridge signing client, or the WordPress publish core) or writes directly to
// the WordPress REST API must call checkProductionChangeAllowed somewhere in it, or be listed below
// with a one-line justification (read-only, or gated by whichever caller it's only ever reached
// through). This is a coarse text-presence check by design -- it cannot verify the gate actually
// runs before the write, only that the file hasn't been added/edited without it appearing at all.
//
// Pure fs/path (no shelling out to find/grep) so it runs identically on Windows and Linux.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // .../apps/next-admin
const SCAN_DIRS = ["app", "lib"];
const SKIP_DIR_NAMES = new Set(["__tests__", "node_modules", ".next", "dist", "build", "coverage"]);
const GATE_MARKER = "checkProductionChangeAllowed";
const SSH2_SPECIFIER = "ssh2";

const TARGET_MODULES = [
  path.join(ROOT, "lib", "repair-center", "ssh"),
  path.join(ROOT, "lib", "studio", "wp-bridge-client"),
  path.join(ROOT, "lib", "content", "publish", "wordpress-core"),
].map((p) => p.replace(/\\/g, "/"));

// Relative path (forward-slash, from ROOT) -> one-line reason this file is exempt.
const ALLOWLIST: Record<string, string> = {
  "lib/repair-center/ssh.ts":
    "primitive SSH transport -- not a call site; every real caller in this repo is itself gated or allowlisted below.",
  "lib/repair-center/evidence.ts":
    "read-only evidence collection (own header: \"Read-only. Evidence collection NEVER mutates any system.\").",
  "lib/repair-center/backup.ts":
    "runPreRepairBackup is called only from lib/repair-center/service.ts startRepairFromIncident, AFTER its checkProductionChangeAllowed gate.",
  "lib/repair-center/remediations/restart-unhealthy-container.ts":
    "a REMEDIATIONS catalog entry invoked only via tryRemediate (lib/repair-center/remediations/engine.ts), which gates before calling any remediation step.",
  "app/api/content/publish/route.ts":
    "imports wordpress-core only for publishToWordPress(); the gate lives inside that function, not in this HTTP shell.",
  "lib/content/blocks/publish-wordpress.ts":
    "imports wordpress-core only for publishToWordPress(); the gate lives inside that function, not in this block wrapper.",
  "app/api/content/newsletter/route.ts":
    "imports wp-bridge-client only for createNewsletter(); the gate lives in bridgePost() (the shared dispatch function every bridge write goes through), not in this route.",
  "app/api/tools/publish/route.ts":
    "imports wp-bridge-client only for createWooProduct(); the gate lives in bridgePost(), not in this route.",
  "app/api/content/calendar/route.ts":
    "read-only WP REST GET (posts listing for the content calendar) -- no method: override, no body.",
  "app/api/content/categories/route.ts":
    "read-only WP REST GET (category list) -- no method: override, no body.",
  "app/api/content/patterns/route.ts":
    "read-only WP REST GET (Kadence pattern/blocks list) -- no method: override, no body.",
  "app/api/content/related-posts/route.ts":
    "read-only WP REST GET -- no method: override, no body.",
  "app/api/content/tags/route.ts":
    "read-only WP REST GET (tag list) -- no method: override, no body.",
  "app/api/content/sites/[id]/test/route.ts":
    "read-only WP REST GET (/wp/v2/users/me connectivity probe) -- no method: override, no body.",
};

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (specifier === SSH2_SPECIFIER) return SSH2_SPECIFIER;
  if (specifier.startsWith("@/")) return path.join(ROOT, specifier.slice(2)).replace(/\\/g, "/");
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fromFile), specifier).replace(/\\/g, "/");
  return null; // some other bare package specifier -- not a target
}

function matchesTarget(resolved: string): boolean {
  if (resolved === SSH2_SPECIFIER) return true;
  return TARGET_MODULES.includes(resolved);
}

// Matches an `import ... from "specifier"` statement (single- or multi-line), capturing whether
// the WHOLE import is `import type ...` (excluded -- no runtime dependency) and the specifier.
const IMPORT_RE = /(?:^|\n)[ \t]*import\s+(type\s+)?[\s\S]*?\bfrom\s+["']([^"']+)["']/g;

function importsAnyTarget(content: string, file: string): boolean {
  const re = new RegExp(IMPORT_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1]) continue; // import type ... -- no runtime dependency
    const resolved = resolveSpecifier(m[2], file);
    if (resolved && matchesTarget(resolved)) return true;
  }
  return false;
}

// Empirical pattern from the real write sites (wp-post PATCH/DELETE, embed-to-wp, wordpress-core's
// standard-REST path): a wp-json/wp/v2 URL used together with a non-GET method, either via fetch's
// own `method:` option or WP's X-HTTP-Method-Override header (used for PATCH-as-POST).
function looksLikeDirectWpRestWrite(content: string): boolean {
  if (!content.includes("wp-json/wp/v2")) return false;
  return /method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(content) || content.includes("X-HTTP-Method-Override");
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

describe("production-change gate coverage", () => {
  it("every SSH / WP-Bridge / WordPress-REST-writing file is gated or allowlisted", () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const needsGate = importsAnyTarget(content, file) || looksLikeDirectWpRestWrite(content);
      if (!needsGate) continue;
      if (content.includes(GATE_MARKER)) continue;
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      if (ALLOWLIST[rel]) continue;
      violations.push(rel);
    }

    if (violations.length > 0) {
      const detail = violations
        .map(
          (f) =>
            `  - ${f}\n` +
            `    imports ssh2 / repair-center/ssh / wp-bridge-client / wordpress-core, or writes to WP REST ` +
            `directly, but never calls ${GATE_MARKER}.\n` +
            `    Fix: call checkProductionChangeAllowed(getSupabaseWriteClient(), orgId) before the write ` +
            `(see lib/system-modes/production-change-gate.ts), or add a one-line-justified ALLOWLIST entry ` +
            `in this test file.`,
        )
        .join("\n");
      throw new Error(
        `production-change gate coverage failed for ${violations.length} file(s):\n${detail}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("every allowlist entry points at a file that still exists", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      expect(fs.existsSync(path.join(ROOT, rel)), `stale ALLOWLIST entry (file gone): ${rel}`).toBe(true);
    }
  });
});
