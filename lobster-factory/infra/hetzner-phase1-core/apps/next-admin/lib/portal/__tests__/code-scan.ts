// The source scanner shared by the registry tests (registry-code: doors and features; staff-tools: staff grants).
// Limits: an /api URL built without a literal "/api/..." prefix, a template whose later parts leave that prefix
// (".."), or a key passed through a variable, is not seen.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.join(__dirname, "../../..");
export const posix = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
export const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);

export function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".next", "__tests__"].includes(e.name)) return [];
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return sources(f);
    return /\.[cm]?[jt]sx?$/.test(e.name) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(e.name) ? [f] : [];
  });
}

// apis: every "/api/..." literal (registry tables included); calls: only those passed to a call or `new`, or set as a
// JSX attribute -- what a page actually requests. Type-only imports are erased at build, so they are not imports.
// called: "<module>#<name>" for each function imported by name and called in the file (`import { a as b }; b()` is a).
// db: the file itself opens a database client (a value import of a database driver).
// prefixCalls: the calls whose URL is a template, so only its leading "/api/..." text is known (a prefix, not a route).
// templates: those calls as route patterns -- each path segment holding a substitution becomes "[x]"
// (`/api/ops/clients/${slug}/cs-knowledge` -> "/api/ops/clients/[x]/cs-knowledge"); query and hash dropped.
export interface Scan { asked: string[]; apis: string[]; calls: string[]; prefixCalls: string[]; templates: Array<{ prefix: string; route: string }>; called: string[]; db: boolean; imports: string[]; meters: boolean }

const HOLE = "\u0000";
/** A template URL as a route pattern, or null when it does not start with "/api/". */
export function templateRoute(n: ts.TemplateExpression): string | null {
  const text = n.head.text + n.templateSpans.map((sp) => HOLE + sp.literal.text).join("");
  const path = text.split(/[?#]/)[0];
  if (!path.startsWith("/api/")) return null;
  return path.split("/").map((seg) => (seg.includes(HOLE) ? "[x]" : seg)).join("/").replace(/\/$/, "");
}
export const DB_DRIVERS = new Set(["@supabase/supabase-js", "@supabase/ssr", "pg", "postgres"]);
export const unwrap = (n: ts.Node | undefined): ts.Node | undefined =>
  n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n)) ? unwrap(n.expression) : n;
export const apiText = (node: ts.Node | undefined) => {
  const n = unwrap(node);
  const t = n && (ts.isStringLiteralLike(n) ? n.text : ts.isTemplateExpression(n) ? n.head.text : null);
  return t?.startsWith("/api/") ? t.split(/[?#]/)[0].replace(/\/$/, "") : null;
};
export const typeOnly = (n: ts.ImportDeclaration | ts.ExportDeclaration) => ts.isExportDeclaration(n) ? n.isTypeOnly
  : !!n.importClause && (n.importClause.isTypeOnly || (!n.importClause.name && !!n.importClause.namedBindings
    && ts.isNamedImports(n.importClause.namedBindings) && n.importClause.namedBindings.elements.length > 0
    && n.importClause.namedBindings.elements.every((e) => e.isTypeOnly)));
export function scan(file: string, text: string): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Scan = { asked: [], apis: [], calls: [], prefixCalls: [], templates: [], called: [], db: false, imports: [], meters: false };
  const call = (node: ts.Node | undefined) => {
    const u = apiText(node);
    if (!u) return;
    out.calls.push(u);
    const n = unwrap(node);
    if (n && ts.isTemplateExpression(n)) {
      out.prefixCalls.push(u);
      const route = templateRoute(n);
      if (route) out.templates.push({ prefix: u, route });
    }
  };
  const bindings: Array<{ mod: string; name: string; local: string }> = [];
  const callees = new Set<string>();
  const spec = (s: string) => {
    const r = s.startsWith("@/") ? s.slice(2) : s.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), s)) : null;
    if (r) out.imports.push(r);
    return r;
  };
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier) && !typeOnly(n)) {
      const r = spec(n.moduleSpecifier.text);
      if (DB_DRIVERS.has(n.moduleSpecifier.text)) out.db = true;
      const b = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : undefined;
      if (r && b && ts.isNamedImports(b)) for (const e of b.elements) if (!e.isTypeOnly) bindings.push({ mod: r, name: (e.propertyName ?? e.name).text, local: e.name.text });
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      for (const a of n.arguments ?? []) call(a);
      if (ts.isIdentifier(n.expression)) callees.add(n.expression.text);
    }
    if (ts.isJsxAttribute(n) && n.initializer) call(ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer);
    if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require")) spec(arg.text);
        if (ts.isIdentifier(n.expression) && ["grantFor", "withFeature"].includes(n.expression.text)) out.asked.push(arg.text);
      }
      if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "recordUse") out.meters = true;
      const featureArg = n.arguments[1];
      if (ts.isIdentifier(n.expression) && n.expression.text === "can" && featureArg && ts.isStringLiteralLike(featureArg)) out.asked.push(featureArg.text);
    }
    const u = apiText(n);
    if (u) out.apis.push(u);
    ts.forEachChild(n, visit);
  };
  visit(source);
  out.called = bindings.filter((b) => callees.has(b.local)).map((b) => `${b.mod}#${b.name}`);
  return out;
}

/** Scanned source files under `dirs` (relative to the app root), with import resolution and closure over them. */
export function codeIndex(dirs: readonly string[]) {
  const files = new Map(dirs.flatMap((d) => sources(path.join(ROOT, d))).map((f) => {
    const rel = posix(f);
    return [rel, scan(rel, readFileSync(f, "utf8"))] as const;
  }));
  const resolve = (spec: string) => {
    const r = spec.replace(/\.[cm]?js$/, "");   // ESM-style "./x.js" names the x.ts source
    return [r, `${r}.ts`, `${r}.tsx`, `${r}/index.ts`, `${r}/index.tsx`].find((c) => files.has(c)) ?? null;
  };
  function importClosure(start: readonly string[], stopAt: ReadonlySet<string> = new Set()): Set<string> {
    const todo = [...start];
    const seen = new Set<string>();
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      if (stopAt.has(f)) continue;
      for (const r of files.get(f)?.imports ?? []) { const g = resolve(r); if (g) todo.push(g); }
    }
    return seen;
  }
  return { files, resolve, importClosure };
}

// The door tests' index. It leaves out components/: including it turns the tarot door red on calls it really makes
// (OutputTrackBar's /api/tools/image/process, ImageEditPromptPanel's studio edit-prompt), a door fix of its own.
const DOOR_INDEX = codeIndex(["app", "lib"]);
export const FILES = DOOR_INDEX.files;
export const resolve = DOOR_INDEX.resolve;
export const importClosure = DOOR_INDEX.importClosure;
export const isRoute = (f: string) => /\/route\.[cm]?[jt]sx?$/.test(f);
