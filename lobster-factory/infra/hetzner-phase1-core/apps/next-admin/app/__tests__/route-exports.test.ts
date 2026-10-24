// A route file may export only the names Next.js accepts; anything else passes tsc and vitest but fails `next build`
// ("X is not a valid Route export field") -- the 2026-10-24 deploy failed on app/api/tools/image/process exporting a
// constant. Shared values go in lib/. Type-only exports are erased and allowed.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP = path.join(__dirname, "..");
const ALLOWED = new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS",
  "runtime", "dynamic", "dynamicParams", "revalidate", "fetchCache", "preferredRegion", "maxDuration", "generateStaticParams"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : routeFiles(f);
    return /^route\.[cm]?[jt]sx?$/.test(e.name) ? [f] : [];
  });
}

/** Value names a module exports (declarations, export lists, re-exports); type-only exports are skipped. */
export function valueExports(text: string, file = "route.ts"): string[] {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const exported = (n: ts.Node) => (ts.getCombinedModifierFlags(n as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
  for (const st of src.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && exported(st)) {
      out.push(st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : st.name?.text ?? "default");
    } else if (ts.isVariableStatement(st) && exported(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text);
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      if (!st.exportClause) out.push("*");
      else if (ts.isNamedExports(st.exportClause)) for (const e of st.exportClause.elements) if (!e.isTypeOnly) out.push(e.name.text);
    } else if (ts.isExportAssignment(st)) out.push("default");
  }
  return out;
}

describe("route files export only what Next.js accepts", () => {
  it("every app/**/route.ts", () => {
    const bad = routeFiles(APP).flatMap((f) => valueExports(readFileSync(f, "utf8"), f).filter((n) => !ALLOWED.has(n))
      .map((n) => `${path.relative(APP, f)}: ${n}`));
    expect(bad).toEqual([]);
  });
  it("the reader sees declarations, lists and re-exports, and skips types", () => {
    expect(valueExports("export const MAX = 2; export async function POST() {} export type T = 1; export interface I {}")).toEqual(["MAX", "POST"]);
    expect(valueExports("const a = 1; export { a as GET }; export type { X } from './x'; export * from './y';")).toEqual(["GET", "*"]);
  });
});
