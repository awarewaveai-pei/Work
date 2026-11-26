// Node-only (fs): which registry system imports which block through "@/...". Used by scripts/gen-block-usage.ts (writes
// block-usage.generated.json, merged into usedBy by blocks.ts) and lib/systems/__tests__/blocks.test.ts. Never import from
// app code: the host copy of next-admin has no repo root / registry.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { LegoBlock } from "./blocks";

export const APP = resolve(__dirname, "../..");
export const REPO = resolve(APP, "../../../../..");
export const REGISTRY = join(REPO, "agency-os/systems/registry.json");
export const GENERATED = join(APP, "lib/systems/block-usage.generated.json");
export const GEN_CMD = "npm run blocks:usage";
const APP_FROM_REPO = relative(REPO, APP).replace(/\\/g, "/") + "/";

export interface Registry { shared_paths: string[]; systems: Array<{ slug: string; source_paths: string[] }> }
export interface ImportEdge { file: string; sys: string; from: string }

export const hasRepo = () => existsSync(REGISTRY);
export const readRegistry = (): Registry => JSON.parse(readFileSync(REGISTRY, "utf8")) as Registry;
/** `p` ending in "/" is a folder, otherwise one file. */
export const under = (path: string, p: string) => (p.endsWith("/") ? path.startsWith(p) : path === p);
export const inShared = (reg: Registry, file: string) => reg.shared_paths.some((p) => under(APP_FROM_REPO + file, p));
export const liveEntries = (b: LegoBlock) => b.entry.filter((e) => !e.startsWith("repo:"));
const rel = (f: string) => relative(APP, f).replace(/\\/g, "/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Every "@/x" import in app/lib/components, resolved to an app-relative file, with the importing file's system (longest
 *  registry source_path wins). Files no system owns are skipped. */
export function scanImports(reg: Registry): ImportEdge[] {
  const prefixes = reg.systems.flatMap((s) => s.source_paths.map((p) => ({ p, slug: s.slug }))).sort((a, b) => b.p.length - a.p.length);
  const owner = (repoPath: string) => prefixes.find(({ p }) => under(repoPath, p))?.slug ?? null;
  return ["app", "lib", "components"].flatMap((d) => walk(join(APP, d))).flatMap((f) => {
    const sys = owner(APP_FROM_REPO + rel(f));
    if (!sys) return [];
    return [...readFileSync(f, "utf8").matchAll(/["']@\/([^"']+)["']/g)].flatMap(([, spec]) => {
      // every module kind tsconfig resolves (allowJs, resolveJsonModule): the spec itself, then the extension-less forms
      const file = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"].map((x) => spec + x)
        .find((c) => existsSync(join(APP, c)) && statSync(join(APP, c)).isFile());
      return file ? [{ file, sys, from: rel(f) }] : [];
    });
  });
}

/** Live block number -> systems that import it, sorted; only blocks with at least one importer. Deterministic (key order). */
export function derivedUsedBy(blocks: readonly LegoBlock[], edges: readonly ImportEdge[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const b of blocks) {
    if (b.status.includes("planned") || b.status.includes("retired")) continue;
    const entries = liveEntries(b);
    const sys = [...new Set(edges.filter((e) => entries.some((x) => under(e.file, x))).map((e) => e.sys))].sort();
    if (sys.length) out[b.no] = sys;
  }
  return out;
}

export const serialize = (d: Record<string, string[]>) => JSON.stringify(d, null, 2) + "\n";
