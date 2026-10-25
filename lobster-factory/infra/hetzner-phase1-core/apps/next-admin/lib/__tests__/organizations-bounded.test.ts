// Every WordPress buyer is an organization (lib/entitlements/wp-customers.ts), so a read of `organizations` must be
// bounded: a key filter (eq / in / match), a limit or range, a single row, or a count only. Pickers use the first
// NAV_FIRST rows plus GET /api/ops/org-search (app/(shell)/ops/clients/OrgPicker.tsx). A chain built in steps
// (`let q = sb.from(...)`, then `q = q.limit(...)`) counts its later steps in the same function.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROOT, posix, sources } from "../portal/__tests__/code-scan";
import path from "node:path";

const BOUNDS = new Set(["eq", "in", "match", "limit", "range", "single", "maybeSingle", "insert", "update", "upsert", "delete"]);

// Known whole-table reads, not pickers (WORKLOG 2026-10-25, the org pickers entry, 同類未修). Shrink this list; never
// grow it to quiet the test.
const KNOWN_UNBOUNDED: Readonly<Record<string, string>> = {
  "app/(shell)/ops/integrations/page.tsx": "one card per org plus a <select> over every org",
  "app/api/ops/integrations/route.ts": "GET lists every org's integrations with metadata",
  "app/(shell)/ops/repairs/page.tsx": "org name map when no org filter is set",
  "lib/command-plane/handlers/clientStatus.ts": "Telegram /client_status lists every org and probes each site",
  "lib/content/video/reconcile.ts": "id-prefix map for orphaned videos (ids only, background job)",
  "lib/schedules/view.ts": "/ops/schedules without ?slug= lists every org, then wp_sites .in(every id)",
  "lib/social/store.ts": "listBrands(null): staff see every organization as a brand",
};

function enclosingFunction(n: ts.Node): ts.Node {
  let p = n.parent;
  while (p && !ts.isFunctionLike(p) && !ts.isSourceFile(p)) p = p.parent;
  return p ?? n.getSourceFile();
}

/** The method names called along a chain rooted at `id` (`id.a().b()` -> a, b); null if `e` is not such a chain. */
function chainOn(e: ts.Expression, id: string): string[] | null {
  const names: string[] = [];
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    names.push(e.expression.name.text);
    e = e.expression.expression;
  }
  return ts.isIdentifier(e) && e.text === id && names.length > 0 ? names : null;
}

/** e always bounds `id`: a bounded chain on it, or a ?: whose both branches do. */
function bounds(e: ts.Expression, id: string): boolean {
  if (ts.isParenthesizedExpression(e) || ts.isAwaitExpression(e)) return bounds(e.expression, id);
  if (ts.isConditionalExpression(e)) return bounds(e.whenTrue, id) && bounds(e.whenFalse, id);
  return chainOn(e, id)?.some((m) => BOUNDS.has(m)) ?? false;
}

/** Some step of the function always bounds `id` (a step under an if / loop / ?: runs only sometimes). */
function laterStepBounds(fn: ts.Node, id: string): boolean {
  let found = false;
  const conditional = (n: ts.Node) => {
    for (let p = n.parent; p && p !== fn; p = p.parent) {
      if (ts.isIfStatement(p) || ts.isConditionalExpression(p) || ts.isIterationStatement(p, false) || ts.isSwitchStatement(p)
        || (ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind))) return true;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (found) return;
    const assigned = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === id;
    if (assigned && bounds(n.right, id) && !conditional(n)) { found = true; return; }
    if (!assigned && ts.isExpression(n) && bounds(n, id) && !conditional(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return found;
}

/** The unbounded `.from("organizations")` reads in one file, as line numbers. */
function unboundedReads(file: string): number[] {
  const text = readFileSync(file, "utf8");
  if (!text.includes('"organizations"')) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: number[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "from"
      && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && n.arguments[0].text === "organizations") {
      const methods: string[] = [];
      let top: ts.Node = n;
      let headOnly = false;
      while (ts.isPropertyAccessExpression(top.parent) && ts.isCallExpression(top.parent.parent) && top.parent.parent.expression === top.parent) {
        const name = top.parent.name.text;
        methods.push(name);
        if (name === "select" && top.parent.parent.arguments.some((a) => /head:\s*true/.test(a.getText()))) headOnly = true;
        top = top.parent.parent;
      }
      let bounded = headOnly || methods.some((m) => BOUNDS.has(m));
      // a chain kept in a variable: a later step that always runs (`x = x.limit(...)`, `await x.limit(...)`) counts
      if (!bounded && ts.isVariableDeclaration(top.parent) && ts.isIdentifier(top.parent.name)) {
        bounded = laterStepBounds(enclosingFunction(top), top.parent.name.text);
      }
      if (!bounded) out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe("organizations reads are bounded", () => {
  const files = ["app", "lib", "components"].flatMap((d) => sources(path.join(ROOT, d)));
  const found = Object.fromEntries(files.map((f) => [posix(f), unboundedReads(f)]).filter(([, lines]) => (lines as number[]).length > 0));

  it("no new whole-table read of organizations", () => {
    const fresh = Object.entries(found).filter(([f]) => !(f in KNOWN_UNBOUNDED)).map(([f, lines]) => `${f}:${(lines as number[]).join(",")}`);
    expect(fresh).toEqual([]);
  });

  it("the known list holds only files that still read the whole table", () => {
    expect(Object.keys(KNOWN_UNBOUNDED).filter((f) => !(f in found))).toEqual([]);
  });

  // the known list above proves the scanner sees whole-table reads; these are the pickers it guards
  it("the client pickers read a bounded page", () => {
    expect(found["app/(shell)/outreach/layout.tsx"]).toBeUndefined();
    expect(found["app/(shell)/ops/collect/page.tsx"]).toBeUndefined();
    expect(found["app/api/ops/org-search/route.ts"]).toBeUndefined();
    expect(found["app/api/content/sites/route.ts"]).toBeUndefined();
  });
});
