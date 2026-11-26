// Node-only (fs): which registry system imports what through "@/...". scripts/gen-block-usage.ts writes the result to
// block-usage.generated.json (usedBy merged by blocks.ts; 共用小工具 and 待歸類 shown on /ops/systems/blocks). GitHub refreshes
// it after every push (.github/workflows/block-usage-refresh.yml). Never import from app code: the host has no registry.
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

export interface ScanRow { path: string; systems: string[] }
/** shared = 2+ systems import a file that is in no block and not shared plumbing; uncovered = a capability id the catalog
 *  does not list yet (content registry id, dock panel, product module, cognitive family); dead = a block entry path gone. */
export type PendingKind = "shared" | "uncovered" | "dead";
export interface PendingRow extends ScanRow { kind: PendingKind }
export interface CatalogScan { usedBy: Record<string, string[]>; methodCounts: Record<string, number>; shared: ScanRow[]; pending: PendingRow[] }
/** What the generator learns outside the import graph: code ids that exist, cognitive families and their method counts. */
export interface CodeFacts { ids: string[]; methodCounts: Record<string, number> }

export const COS_MODULES = join(REPO, "Projects/internal/cognitive-engineering-os/ai_lego/modules");
const exists = (p: string) => existsSync(p.startsWith("repo:") ? join(REPO, p.slice(5)) : join(APP, p));

/** Code ids every catalog entry must cover (fs part): dock panels, product modules, cognitive families + their method counts.
 *  Content registry ids need the registry loaded, so the generator adds those. */
export function fsFacts(): CodeFacts {
  const panelDir = join(APP, "public/editor-shared/blocks");
  const panels = existsSync(panelDir) ? readdirSync(panelDir).filter((f) => f.endsWith(".js")).map((f) => `panel/${f.slice(0, -3)}`) : [];
  const modules = readdirSync(join(APP, "lib")).filter((d) => existsSync(join(APP, "lib", d, "MODULE_MANIFEST.json"))).map((d) => `module/${d}`);
  const methodCounts: Record<string, number> = {};
  if (existsSync(COS_MODULES)) {
    for (const d of readdirSync(COS_MODULES).filter((d) => !d.startsWith("_") && statSync(join(COS_MODULES, d)).isDirectory()).sort()) {
      methodCounts[d] = readdirSync(join(COS_MODULES, d)).filter((f) => f.endsWith(".py") && !f.startsWith("__")).length;
    }
  }
  return { ids: [...panels, ...modules, ...Object.keys(methodCounts).map((d) => `cognitive/${d}`)], methodCounts };
}

/** usedBy per block; 共用小工具 = registry shared_paths inside next-admin with the systems importing them (files a block
 *  already holds left out); 待處理 = the PendingKind rows above. */
export function scanCatalog(blocks: readonly LegoBlock[], reg: Registry, edges: readonly ImportEdge[], facts: CodeFacts): CatalogScan {
  const live = blocks.filter((b) => !b.status.includes("planned") && !b.status.includes("retired")).flatMap(liveEntries);
  const inBlock = (f: string) => live.some((e) => under(f, e));
  const users = new Map<string, Set<string>>();
  for (const { file, sys } of edges) users.set(file, (users.get(file) ?? new Set()).add(sys));
  const shared = reg.shared_paths.filter((p) => p.startsWith(APP_FROM_REPO)).map((p) => p.slice(APP_FROM_REPO.length)).flatMap((path) => {
    const sys = new Set([...users].filter(([f]) => under(f, path) && !inBlock(f)).flatMap(([, s]) => [...s]));
    return sys.size ? [{ path, systems: [...sys].sort() }] : [];
  });
  const covered = new Set(blocks.flatMap((b) => b.covers ?? []));
  const pending: PendingRow[] = [
    ...[...users].filter(([f, s]) => s.size >= 2 && !inBlock(f) && !inShared(reg, f))
      .map(([path, s]) => ({ kind: "shared" as const, path, systems: [...s].sort() })).sort((a, b) => a.path.localeCompare(b.path)),
    ...[...new Set(facts.ids)].filter((id) => !covered.has(id)).sort().map((path) => ({ kind: "uncovered" as const, path, systems: [] })),
    ...blocks.flatMap((b) => b.entry.filter((e) => !exists(e)).map((e) => ({ kind: "dead" as const, path: `${b.no} ${e}`, systems: [] }))),
  ];
  return { usedBy: derivedUsedBy(blocks, edges), methodCounts: facts.methodCounts, shared, pending };
}

export const serialize = (d: CatalogScan) => JSON.stringify(d, null, 2) + "\n";
