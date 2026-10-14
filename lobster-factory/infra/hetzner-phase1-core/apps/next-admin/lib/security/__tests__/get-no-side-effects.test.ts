// T20: a GET handler under app/api must never change state or spend money -- the session cookie
// is SameSite=Lax, so a same-site page (client staging sites live on aware-wave.com) can force the
// browser to send an authenticated GET via <img>/<script>; the CSRF guard (middleware.ts
// isCrossSiteWrite) only covers non-GET.
//
// Parsed with the TypeScript compiler API (reusing the walk/resolve approach of
// lib/system-modes/__tests__/production-change-coverage.test.ts), so comments and string contents
// never count as imports or calls. Unlike that test, analysis is scoped to the exported GET
// function's OWN subtree (not the whole file) -- a route with a safe GET and a writing POST is not
// a violation. Primitives are tracked at (module, export name) granularity, not whole-module,
// because most of these modules also export safe reads (job-store's getJob, r2's r2GetObject) --
// whole-module targeting (as the gate-coverage test uses for ssh2/wp-bridge-client, which have no
// safe export) would over-flag those. Two ways a GET can reach a primitive: (a) calling a name
// bound by a static top-of-file import, or by a `const { x } = await import(...)` / `const ns =
// await import(...)` destructure *inside the GET function itself* (the established pattern in this
// codebase's polling routes) -- one hop, not a full call graph; (b) a direct
// `<x>.from(...).insert/update/upsert/delete(...)` Supabase write chain, detected structurally
// regardless of the receiver's variable name. It cannot prove a called *local helper function*
// (declared in the same file, not one of the tracked primitive modules) is side-effect free --
// none of the routes in this codebase do that today (verified by the violation scan below being
// empty beyond the allowlist).
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // .../apps/next-admin
const API_ROOT = path.join(ROOT, "app", "api");
const SKIP_DIR_NAMES = new Set(["__tests__", "node_modules", ".next", "dist", "build", "coverage"]);

function mod(rel: string): string {
  return path.join(ROOT, rel).replace(/\\/g, "/");
}

// resolved module -> which export names count as the primitive; "*" = every export (no safe read
// export exists on that module).
const PRIMITIVES: Record<string, "*" | Set<string>> = {
  [mod("lib/content/trending-sources")]: new Set(["aiChat"]), // paid AI call (Claude Haiku)
  [mod("lib/content/video/job-store")]: new Set(["createJob", "updateJobStep", "finishJob"]), // job-store write; getJob is a read
  [mod("lib/content/blocks/video-pipeline")]: new Set(["recordVideoAsset", "cleanupVideoInputKeys"]), // media_assets insert + R2 delete
  [mod("lib/content/video/qa-persistence")]: "*", // persistAutomaticTechnicalQa -- write-only module
  [mod("lib/content/video/caption-qa-persistence")]: "*", // persistAutomaticCaptionQa -- write-only module
  [mod("lib/storage/r2")]: new Set(["r2PutObject", "r2DeleteObject", "deleteDesignObject", "deleteVideoObjects", "putDesignObject"]), // R2 put/delete; r2GetObject/r2ListObjects/isR2Configured/etc. are reads
};

// Relative path (forward-slash, from ROOT) -> one-line reason this GET is exempt.
const ALLOWLIST: Record<string, string> = {
  "app/api/outreach/connectors/gmail/oauth/callback/route.ts":
    "OAuth2 authorization-code callback -- Google's redirect here is always a browser GET (outside our control, spec-mandated), and the write is gated by verifyState()'s HMAC-signed state token minted only by ../authorize, not by the session cookie -- immune to the SameSite=Lax img/script forgery this test otherwise guards against.",
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
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /^route\.tsx?$/.test(entry.name)) out.push(full);
  }
}

function resolveSpecifier(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith("@/")) return path.join(ROOT, specifier.slice(2)).replace(/\\/g, "/");
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fromFile), specifier).replace(/\\/g, "/");
  return null; // bare package specifier -- not a target
}

function primitiveHit(resolvedModule: string, exportName: string): boolean {
  const spec = PRIMITIVES[resolvedModule];
  if (!spec) return false;
  return spec === "*" || spec.has(exportName);
}

function findExportedFunction(sf: ts.SourceFile, name: string): ts.Node | null {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
      if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return st;
    }
    if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) return decl.initializer;
      }
    }
  }
  return null;
}

interface Binding {
  module: string;
  exportName: string;
}

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

function analyzeGetHandler(content: string, file: string): { hasGet: boolean; hits: string[] } {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const getNode = findExportedFunction(sf, "GET");
  if (!getNode) return { hasGet: false, hits: [] };

  // File-level static import bindings (apply throughout the file, including inside GET).
  const staticNamed = new Map<string, Binding>();
  const staticNamespace = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const clause = st.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const resolved = resolveSpecifier(st.moduleSpecifier.text, file);
    if (!resolved) continue;
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        if (el.isTypeOnly) continue;
        staticNamed.set(el.name.text, { module: resolved, exportName: (el.propertyName ?? el.name).text });
      }
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      staticNamespace.set(clause.namedBindings.name.text, resolved);
    }
  }

  // Bindings created INSIDE the GET handler via `await import(...)` (static or dynamic-destructure)
  // -- scoped to this function's own traversal, so a sibling POST importing the same primitive
  // never counts against GET.
  const localNamed = new Map<string, Binding>();
  const localNamespace = new Map<string, string>();
  const hits: string[] = [];

  function recordDynamicImportBinding(bindingName: ts.BindingName, resolved: string): void {
    if (ts.isIdentifier(bindingName)) {
      localNamespace.set(bindingName.text, resolved);
    } else if (ts.isObjectBindingPattern(bindingName)) {
      for (const el of bindingName.elements) {
        if (!ts.isIdentifier(el.name)) continue;
        const exportName = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : el.name.text;
        localNamed.set(el.name.text, { module: resolved, exportName });
      }
    }
  }

  function checkCallee(callee: ts.Expression): void {
    if (ts.isIdentifier(callee)) {
      const b = localNamed.get(callee.text) ?? staticNamed.get(callee.text);
      if (b && primitiveHit(b.module, b.exportName)) hits.push(`${b.module}#${b.exportName}`);
    } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const nsModule = localNamespace.get(callee.expression.text) ?? staticNamespace.get(callee.expression.text);
      if (nsModule && primitiveHit(nsModule, callee.name.text)) hits.push(`${nsModule}#${callee.name.text}`);
    }
  }

  function checkSupabaseWrite(node: ts.CallExpression): void {
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee) || !WRITE_METHODS.has(callee.name.text)) return;
    const receiver = callee.expression;
    if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === "from") {
      hits.push(`supabase.from(...).${callee.name.text}(...)`);
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      let init: ts.Expression = node.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (ts.isCallExpression(init) && init.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = init.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          const resolved = resolveSpecifier(arg.text, file);
          if (resolved) recordDynamicImportBinding(node.name, resolved);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      checkCallee(node.expression);
      checkSupabaseWrite(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(getNode);

  return { hasGet: true, hits };
}

const files: string[] = [];
walk(API_ROOT, files);
const relOf = (file: string) => path.relative(ROOT, file).replace(/\\/g, "/");
const FAKE = path.join(API_ROOT, "x", "route.ts");
const analyzeFake = (src: string) => analyzeGetHandler(src, FAKE);

const PRIMITIVE_IMPORT =
  'import { aiChat } from "@/lib/content/trending-sources";\n' +
  'import { finishJob } from "@/lib/content/video/job-store";\n';

describe("GET handlers under app/api never reach a known side-effect primitive", () => {
  it("scans the real tree (a detector that sees nothing passes vacuously)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("primitive reach: a call to a tracked (module, export) pair inside GET counts", () => {
    expect(analyzeFake(PRIMITIVE_IMPORT + "export async function GET() { await aiChat('x'); }").hits).toContain(
      `${mod("lib/content/trending-sources")}#aiChat`,
    );
    expect(analyzeFake(PRIMITIVE_IMPORT + "export async function GET() { await finishJob('id', {}); }").hits).toContain(
      `${mod("lib/content/video/job-store")}#finishJob`,
    );
  });

  it("primitive reach: a `const { x } = await import(...)` destructure inside GET counts (the pattern this codebase's polling routes use)", () => {
    const src = 'export async function GET() { const { finishJob } = await import("@/lib/content/video/job-store"); await finishJob("id", {}); }';
    expect(analyzeFake(src).hits).toContain(`${mod("lib/content/video/job-store")}#finishJob`);
  });

  it("a safe export from the SAME module (job-store's getJob) does not count", () => {
    const src = 'import { getJob } from "@/lib/content/video/job-store";\nexport async function GET() { await getJob("id"); }';
    expect(analyzeFake(src).hits).toEqual([]);
  });

  it("a primitive reached only from POST (a sibling function) does not count against GET", () => {
    const src = PRIMITIVE_IMPORT + "export async function GET() { return 1; }\nexport async function POST() { await aiChat('x'); }";
    expect(analyzeFake(src).hits).toEqual([]);
  });

  it("supabase write detection: any of insert/update/upsert/delete after .from(...) counts, chained calls after it too", () => {
    expect(analyzeFake('export async function GET() { await supabase.from("t").insert({}); }').hits.length).toBeGreaterThan(0);
    expect(analyzeFake('export async function GET() { await supabase.from("t").update({}).eq("id", 1); }').hits.length).toBeGreaterThan(0);
    expect(analyzeFake('export async function GET() { await supabase.from("t").select("id"); }').hits).toEqual([]);
  });

  it("comments and string literals never count as a call", () => {
    const src = PRIMITIVE_IMPORT + 'export async function GET() { // await aiChat("x")\n const s = "await aiChat(\'x\')"; return s; }';
    expect(analyzeFake(src).hits).toEqual([]);
  });

  it("no GET export in the file: not analyzed (no false positive on a POST-only route)", () => {
    expect(analyzeFake(PRIMITIVE_IMPORT + "export async function POST() { await aiChat('x'); }").hasGet).toBe(false);
  });

  it("the fixed routes (T20) no longer export a GET that reaches a primitive -- moved to POST", () => {
    for (const rel of ["app/api/video/status/route.ts", "app/api/video/remotion-job-status/route.ts"]) {
      const file = path.join(ROOT, rel);
      const facts = analyzeGetHandler(fs.readFileSync(file, "utf8"), file);
      expect(facts.hasGet, `${rel} should no longer export GET`).toBe(false);
    }
    const trendingFile = path.join(ROOT, "app/api/content/trending/route.ts");
    const trendingFacts = analyzeGetHandler(fs.readFileSync(trendingFile, "utf8"), trendingFile);
    expect(trendingFacts.hasGet, "trending/route.ts should still export a (now trending-only) GET").toBe(true);
    expect(trendingFacts.hits, "trending/route.ts's GET should no longer reach aiChat").toEqual([]);
  });

  it("every GET handler under app/api is either primitive-free or allowlisted with a reason", () => {
    const violations: string[] = [];
    for (const file of files) {
      const facts = analyzeGetHandler(fs.readFileSync(file, "utf8"), file);
      if (!facts.hasGet || facts.hits.length === 0) continue;
      const rel = relOf(file);
      if (ALLOWLIST[rel]) continue;
      violations.push(`${rel}: ${facts.hits.join(", ")}`);
    }

    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v}\n    Fix: move the side effect behind POST, or add a one-line-justified ALLOWLIST entry.`)
        .join("\n");
      throw new Error(`GET side-effect scan failed for ${violations.length} route(s):\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  it("every allowlist entry is still needed (file exists, still has a GET, and still reaches a primitive)", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      const file = path.join(ROOT, rel);
      expect(fs.existsSync(file), `stale ALLOWLIST entry (file gone): ${rel}`).toBe(true);
      const facts = analyzeGetHandler(fs.readFileSync(file, "utf8"), file);
      expect(facts.hasGet, `unneeded ALLOWLIST entry (no GET any more): ${rel}`).toBe(true);
      expect(facts.hits.length, `unneeded ALLOWLIST entry (GET no longer reaches a primitive): ${rel}`).toBeGreaterThan(0);
    }
  });
});
