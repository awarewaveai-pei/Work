// Structural test: any file that reaches a production-changing primitive (ssh2, the repair-center SSH
// wrapper, the WP Bridge signing client, the WordPress publish core) or writes to a WordPress REST route
// must import the gate and call checkProductionChangeAllowed, or be listed below with a one-line
// justification. Parsed with the TypeScript compiler API, so comments and string contents never count
// as imports or calls, and re-exports / import() / require() count as reaching a primitive. It cannot
// prove the call runs before the write -- the per-route mode-gate tests do that.
//
// Pure fs/path (no shelling out to find/grep) so it runs identically on Windows and Linux.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // .../apps/next-admin
const SCAN_DIRS = ["app", "lib"];
const SKIP_DIR_NAMES = new Set(["__tests__", "node_modules", ".next", "dist", "build", "coverage"]);
const GATE_FN = "checkProductionChangeAllowed";
const GATE_MODULE = path.join(ROOT, "lib", "system-modes", "production-change-gate").replace(/\\/g, "/");
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
  return resolved === SSH2_SPECIFIER || TARGET_MODULES.includes(resolved);
}

const READ_METHODS = new Set(["get", "head", "options"]);

function propName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text.toLowerCase() : null;
}

interface FileFacts {
  runtimeRefs: string[]; // resolved modules reached at runtime: import, export-from, import(), require()
  callsGate: boolean; // the gate function, imported (not type-only) from the gate module, is called
  wpRestWrite: boolean; // a /wp-json/ string plus a write-capable method or a method-override header
}

function analyze(content: string, file: string): FileFacts {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const runtimeRefs: string[] = [];
  const gateNames = new Set<string>(); // local identifiers bound to the gate function
  const gateNamespaces = new Set<string>(); // `import * as ns` of the gate module
  let callsGate = false;
  let wpJson = false;
  let writeMethod = false;

  const ref = (spec: string) => {
    const r = resolveSpecifier(spec, file);
    if (r) runtimeRefs.push(r);
    return r;
  };

  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const clause = st.importClause;
    if (clause?.isTypeOnly) continue;
    const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined;
    const allTypeOnly = !!named && named.length > 0 && !clause?.name && named.every((e) => e.isTypeOnly);
    if (allTypeOnly) continue;
    const resolved = ref(st.moduleSpecifier.text);
    if (resolved !== GATE_MODULE) continue;
    for (const e of named ?? []) {
      if (!e.isTypeOnly && (e.propertyName ?? e.name).text === GATE_FN) gateNames.add(e.name.text);
    }
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) gateNamespaces.add(clause.namedBindings.name.text);
  }

  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      ref(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg = node.arguments[0];
      const isLoader = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require");
      if (isLoader && arg && ts.isStringLiteralLike(arg)) ref(arg.text);
      if (ts.isIdentifier(callee) && gateNames.has(callee.text)) callsGate = true;
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === GATE_FN && ts.isIdentifier(callee.expression) && gateNamespaces.has(callee.expression.text)) {
        callsGate = true;
      }
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (/\/wp-json(\/|$)/i.test(node.text)) wpJson = true;
    } else if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name);
      if (name === "x-http-method-override") writeMethod = true;
      // A literal read method is safe; anything else (a write literal, a variable, a conditional) may write.
      if (name === "method" && !(ts.isStringLiteralLike(node.initializer) && READ_METHODS.has(node.initializer.text.toLowerCase()))) {
        writeMethod = true;
      }
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === "method") {
      writeMethod = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return { runtimeRefs, callsGate, wpRestWrite: wpJson && writeMethod };
}

// A target module itself (the bridge client, the publish core, the SSH wrapper) needs the gate too,
// or an allowlist entry saying its callers hold it.
function needsGate(facts: FileFacts, file: string): boolean {
  const self = file.replace(/\\/g, "/").replace(/\.tsx?$/, "");
  return matchesTarget(self) || facts.runtimeRefs.some(matchesTarget) || facts.wpRestWrite;
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
const relOf = (file: string) => path.relative(ROOT, file).replace(/\\/g, "/");
const factsOf = (rel: string) => analyze(fs.readFileSync(path.join(ROOT, rel), "utf8"), path.join(ROOT, rel));
const FAKE = path.join(ROOT, "app", "api", "x", "route.ts");
const fake = (src: string) => analyze(src, FAKE);
const IMP = 'import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";\n';

describe("production-change gate coverage", () => {
  it("scans the real tree and detects the known write paths (a detector that sees nothing passes vacuously)", () => {
    expect(files.length).toBeGreaterThan(400);
    const known = ["lib/content/publish/wordpress-core.ts", "app/api/content/wp-post/route.ts", "lib/studio/wp-bridge-client.ts"];
    for (const rel of [...known, "lib/repair-center/ssh.ts", "app/api/video/embed-to-wp/route.ts"]) {
      expect(needsGate(factsOf(rel), path.join(ROOT, rel)), `${rel} no longer detected`).toBe(true);
    }
    for (const rel of known) expect(factsOf(rel).callsGate, `${rel} lost its gate call`).toBe(true);
  });

  it("write detection: any method case, any /wp-json/ namespace, non-literal methods count, comments do not", () => {
    expect(fake('fetch(`${u}/wp-json/wc/v3/products`, { method: "post" });').wpRestWrite).toBe(true);
    expect(fake('fetch(u + "/wp-json/wp/v2/posts/1", { method: "POST", headers: { "X-HTTP-Method-Override": "PUT" } });').wpRestWrite).toBe(true);
    expect(fake('fetch(`${u}/wp-json/wp/v2/posts`, { method });').wpRestWrite).toBe(true);
    expect(fake('fetch(`${u}/wp-json/wp/v2/posts`, { method: del ? "DELETE" : "GET" });').wpRestWrite).toBe(true);
    expect(fake("fetch(`${u}/wp-json/wp/v2/tags`);").wpRestWrite).toBe(false);
    expect(fake('fetch(u + "/wp-json/wp/v2/tags", { method: "GET" });').wpRestWrite).toBe(false);
    expect(fake('// fetch("/wp-json/wp/v2/posts", { method: "POST" })\nconst x = 1;').wpRestWrite).toBe(false);
  });

  it("primitive reach: re-export, import() and require() count; import type does not", () => {
    const reach = (src: string) => needsGate(fake(src), FAKE);
    expect(reach('export { bridgePost } from "@/lib/studio/wp-bridge-client";')).toBe(true);
    expect(reach('const m = await import("@/lib/repair-center/ssh");')).toBe(true);
    expect(reach('const { Client } = require("ssh2");')).toBe(true);
    expect(reach('import type { BridgeResult } from "@/lib/studio/wp-bridge-client";')).toBe(false);
    expect(reach('import { type BridgeResult } from "@/lib/studio/wp-bridge-client";')).toBe(false);
    expect(reach('/* import { bridgePost } from "@/lib/studio/wp-bridge-client"; */')).toBe(false);
  });

  it("gate call: only a real call of the imported gate counts", () => {
    expect(fake(IMP + "const g = await checkProductionChangeAllowed(c, o);").callsGate).toBe(true);
    expect(fake('import { checkProductionChangeAllowed as gate } from "@/lib/system-modes/production-change-gate";\nawait gate(c, o);').callsGate).toBe(true);
    expect(fake('import * as pcg from "@/lib/system-modes/production-change-gate";\nawait pcg.checkProductionChangeAllowed(c, o);').callsGate).toBe(true);
    expect(fake(IMP + "// checkProductionChangeAllowed(client, org) happens upstream\n").callsGate).toBe(false);
    expect(fake(IMP + 'switch (k) { case "a":// checkProductionChangeAllowed(c, o)\n}').callsGate).toBe(false);
    expect(fake(IMP + 'const s = "checkProductionChangeAllowed(c, o)";').callsGate).toBe(false);
    expect(fake("const g = await checkProductionChangeAllowed(c, o);").callsGate).toBe(false);
    expect(fake('/* import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate"; */\nawait checkProductionChangeAllowed(c, o);').callsGate).toBe(false);
    expect(fake('import type { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";\nawait checkProductionChangeAllowed(c, o);').callsGate).toBe(false);
  });

  it("every SSH / WP-Bridge / WordPress-REST-writing file is gated or allowlisted", () => {
    const violations: string[] = [];
    for (const file of files) {
      const facts = analyze(fs.readFileSync(file, "utf8"), file);
      if (!needsGate(facts, file) || facts.callsGate) continue;
      const rel = relOf(file);
      if (ALLOWLIST[rel]) continue;
      violations.push(rel);
    }

    if (violations.length > 0) {
      const detail = violations
        .map(
          (f) =>
            `  - ${f}\n` +
            `    reaches ssh2 / repair-center/ssh / wp-bridge-client / wordpress-core, or writes to WP REST ` +
            `directly, but never calls ${GATE_FN}.\n` +
            `    Fix: call checkProductionChangeAllowed(getSupabaseWriteClient(), orgId) before the write ` +
            `(see lib/system-modes/production-change-gate.ts), or add a one-line-justified ALLOWLIST entry ` +
            `in this test file.`,
        )
        .join("\n");
      throw new Error(`production-change gate coverage failed for ${violations.length} file(s):\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  it("every allowlist entry is still needed (file exists, is detected, and has no gate call of its own)", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      const file = path.join(ROOT, rel);
      expect(fs.existsSync(file), `stale ALLOWLIST entry (file gone): ${rel}`).toBe(true);
      const facts = factsOf(rel);
      expect(needsGate(facts, file), `unneeded ALLOWLIST entry (not a write path): ${rel}`).toBe(true);
      expect(facts.callsGate, `unneeded ALLOWLIST entry (file is gated itself): ${rel}`).toBe(false);
    }
  });
});
