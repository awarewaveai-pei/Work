// What products.ts claims, checked against the code: a door API is a real route prefix (ADR 018 §1); every declared
// feature is asked by a grantFor/withFeature call site (ADR 017 §4); a product whose code calls another product's
// routes or bills its features declares it in dependsOn or optional (ADR 017 §0b). Plain library imports across
// lib/<key>/ are not dependencies: one app ships whole (ADR 017 §5), so code location is not what must be installed.
// Limits: an /api URL built without a literal "/api/..." prefix, or a key passed through a variable, is not seen.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BACK_OFFICE_FEATURES } from "../../entitlements/can";
import { ROUTE_FEATURES } from "../../entitlements/route-features";
import { nextAdminProducts } from "../doors";
import { PRODUCTS, type PortalProduct } from "../products";

const ROOT = path.join(__dirname, "../../..");
const posix = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["node_modules", ".next", "__tests__"].includes(e.name)) return [];
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return sources(f);
    return /\.[cm]?[jt]sx?$/.test(e.name) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(e.name) ? [f] : [];
  });
}

interface Scan { asked: string[]; apis: string[]; imports: string[] }
function scan(file: string, text: string): Scan {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Scan = { asked: [], apis: [], imports: [] };
  const spec = (s: string) => {
    const r = s.startsWith("@/") ? s.slice(2) : s.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), s)) : null;
    if (r) out.imports.push(r);
  };
  const visit = (n: ts.Node) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) spec(n.moduleSpecifier.text);
    if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword) spec(arg.text);
        if (ts.isIdentifier(n.expression) && ["grantFor", "withFeature"].includes(n.expression.text)) out.asked.push(arg.text);
      }
      const featureArg = n.arguments[1];
      if (ts.isIdentifier(n.expression) && n.expression.text === "can" && featureArg && ts.isStringLiteralLike(featureArg)) out.asked.push(featureArg.text);
    }
    const text = ts.isStringLiteralLike(n) ? n.text : ts.isTemplateExpression(n) ? n.head.text : null;
    if (text?.startsWith("/api/")) out.apis.push(text.split(/[?#]/)[0].replace(/\/$/, ""));
    ts.forEachChild(n, visit);
  };
  visit(source);
  return out;
}

const FILES = new Map(["app", "lib"].flatMap((d) => sources(path.join(ROOT, d))).map((f) => {
  const rel = posix(f);
  return [rel, scan(rel, readFileSync(f, "utf8"))] as const;
}));
const resolve = (r: string) => [r, `${r}.ts`, `${r}.tsx`, `${r}/index.ts`].find((c) => FILES.has(c)) ?? null;

// Code a product owns: lib/<key>/, its staff paths, its door page and door API directories (longest prefix wins).
const OWNED = PRODUCTS.flatMap((p) => [`lib/${p.key}`, ...p.staffPaths.map((s) => `app/(shell)/${s}`),
  ...(p.door.app === "next-admin" ? [`app${p.door.page}`, ...p.door.api.map((a) => `app${a}`)] : [])].map((dir) => ({ dir, key: p.key })))
  .sort((a, b) => b.dir.length - a.dir.length);
const ownerOfFile = (rel: string) => OWNED.find((o) => rel.startsWith(`${o.dir}/`))?.key ?? null;
const FEATURE_OWNER = new Map(PRODUCTS.flatMap((p) => p.features.map((f) => [f.feature_key, p.key] as const)));
const ownerOfApi = (url: string) => nextAdminProducts().find((p) => p.door.api.some((a) => under(url, a)))?.key
  ?? FEATURE_OWNER.get(ROUTE_FEATURES[url] ?? "") ?? null;

function closure(key: string, seen = new Set<string>()): Set<string> {
  for (const d of PRODUCTS.find((p) => p.key === key)?.modules.dependsOn ?? []) if (!seen.has(d)) { seen.add(d); closure(d, seen); }
  return seen;
}
const optional = (p: PortalProduct): readonly string[] => p.modules.optional ?? [];

/** Every place a product's code reaches another product: its routes, or a feature it asks for (directly, or in a file it imports). */
function edges(): Array<{ from: string; to: string; why: string }> {
  const out: Array<{ from: string; to: string; why: string }> = [];
  for (const [rel, s] of FILES) {
    const from = ownerOfFile(rel);
    if (!from) continue;
    const add = (to: string | null | undefined, why: string) => { if (to && to !== from) out.push({ from, to, why: `${rel}: ${why}` }); };
    for (const u of s.apis) add(ownerOfApi(u), u);
    for (const k of s.asked) add(FEATURE_OWNER.get(k), `asks ${k}`);
    for (const r of s.imports) {
      const f = resolve(r);
      const to = f && ownerOfFile(f);
      if (f && to) for (const k of FILES.get(f)!.asked) if (FEATURE_OWNER.get(k) === to) add(to, `imports ${f}, which asks ${k}`);
    }
  }
  return out;
}

describe("registry claims match the code", () => {
  it("every door API prefix is an existing route directory a door can serve, owned by one product", () => {
    const doors = nextAdminProducts();
    const routeFile = (dir: string): boolean => readdirSync(dir, { withFileTypes: true })
      .some((e) => (e.isDirectory() ? routeFile(path.join(dir, e.name)) : /^route\.[cm]?[jt]sx?$/.test(e.name)));
    for (const p of doors) for (const a of p.door.api) {
      // middleware's matcher skips these, so no door ever routes them (ADR 018 §1)
      expect(under(a, "/api/webhooks") || under(a, "/api/internal"), `${p.key} ${a}`).toBe(false);
      const dir = path.join(ROOT, "app", ...a.split("/").filter(Boolean));
      expect(existsSync(dir) && routeFile(dir), `${p.key} ${a}: no route under app${a}`).toBe(true);
      for (const q of doors) if (q !== p) for (const b of q.door.api) expect(under(a, b), `${p.key} ${a} inside ${q.key} ${b}`).toBe(false);
    }
  });

  it("every feature of a next-admin product is asked by a call site, and every asked key is declared", () => {
    const asked = new Set([...FILES.values()].flatMap((s) => s.asked));
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const f of p.features) expect(asked.has(f.feature_key), `${f.feature_key}: no grantFor/withFeature asks it`).toBe(true);
    }
    for (const k of BACK_OFFICE_FEATURES) expect(asked.has(k), `${k}: back-office key nothing asks`).toBe(true);
    for (const k of asked) expect(FEATURE_OWNER.has(k) || BACK_OFFICE_FEATURES.has(k), `${k}: asked but not declared`).toBe(true);
  });

  it("a product reaching another product's routes or features declares it, and declares nothing it does not reach", () => {
    const found = edges();
    const missing = found.filter((e) => {
      const p = PRODUCTS.find((x) => x.key === e.from)!;
      return !closure(p.key).has(e.to) && !optional(p).includes(e.to);
    });
    expect(missing.map((e) => `${e.from} -> ${e.to} (${e.why})`)).toEqual([]);
    for (const p of PRODUCTS.filter((x) => x.door.app === "next-admin")) {
      for (const d of [...p.modules.dependsOn, ...optional(p)].filter((k) => PRODUCTS.some((x) => x.key === k))) {
        expect(found.some((e) => e.from === p.key && e.to === d), `${p.key} declares ${d} but its code never reaches it`).toBe(true);
      }
    }
    for (const p of PRODUCTS) for (const d of optional(p)) expect(PRODUCTS.some((x) => x.key === d), `${p.key} optional ${d}`).toBe(true);
  });

  it("a standalone product's required closure carries no SAFETY_GATE feature (it must install alone, ADR 017 §5)", () => {
    for (const p of PRODUCTS.filter((x) => x.standalone)) {
      for (const k of closure(p.key)) {
        for (const f of PRODUCTS.find((x) => x.key === k)?.features ?? []) expect(f.limitKind, `${p.key} -> ${k}: ${f.feature_key}`).not.toBe("SAFETY_GATE");
      }
    }
  });

  it("the scanner sees literal asks, URLs in templates, and keys in an imported file", () => {
    const s = scan("lib/x/a.ts", 'import { g } from "@/lib/tarot/b"; await grantFor("studio.image"); fetch(`/api/tools/studio/x?y=${1}`); const s = "/api/social/";');
    expect(s).toEqual({ asked: ["studio.image"], apis: ["/api/tools/studio/x", "/api/social"], imports: ["lib/tarot/b"] });
    expect(scan("lib/x/a.ts", 'grant("studio.image"); x.grantFor("studio.image"); // grantFor("cs.answer")').asked).toEqual([]);
  });
});
