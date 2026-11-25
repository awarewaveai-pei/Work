// Keeps lib/systems/blocks.ts true to the code: permanent numbers, no dead path, nothing unlisted, and every system that
// imports a block through "@/..." is in its usedBy. Registry / cognitive checks need the repo root (local and CI); the
// host copy of next-admin has neither, so those cases skip there and the rest still run.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BLOCK_LAYERS, BLOCK_STATUS, LEGO_BLOCKS, TIERS, blockStats, blocksForSystem, catalogHref, isLive } from "../blocks";

const APP = resolve(__dirname, "../../..");
const REPO = resolve(APP, "../../../../..");
const REGISTRY = join(REPO, "agency-os/systems/registry.json");
const APP_FROM_REPO = relative(REPO, APP).replace(/\\/g, "/") + "/";
const hasRepo = existsSync(REGISTRY);
const abs = (p: string) => (p.startsWith("repo:") ? join(REPO, p.slice(5)) : join(APP, p));
const rel = (f: string) => relative(APP, f).replace(/\\/g, "/");
const covered = new Set(LEGO_BLOCKS.flatMap((b) => b.covers ?? []));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("積木目錄 shape", () => {
  it("numbers are unique, carry their tier prefix and run without gaps (a retired block keeps its number)", () => {
    for (const t of TIERS) {
      const nos = LEGO_BLOCKS.filter((b) => b.tier === t.key).map((b) => b.no);
      const digits = t.key === "block" ? 3 : 2;
      expect(nos, t.key).toEqual(nos.map((_, i) => `${t.prefix}-${String(i + 1).padStart(digits, "0")}`));
    }
  });

  it("status is known, usedBy is non-empty, 功能積木 have a layer", () => {
    const layers = BLOCK_LAYERS.map((l) => l.key as string);
    for (const b of LEGO_BLOCKS) {
      for (const s of b.status) expect(Object.keys(BLOCK_STATUS), b.no).toContain(s);
      expect(b.usedBy.length, b.no).toBeGreaterThan(0);
      expect(new Set(b.usedBy).size, `${b.no} lists a system twice`).toBe(b.usedBy.length);
      expect(b.tier === "block" ? layers.includes(b.layer ?? "") : b.layer === undefined, b.no).toBe(true);
    }
  });

  it("live blocks name an entry; planned and retired name none; a code id is covered once", () => {
    for (const b of LEGO_BLOCKS) expect(b.entry.length > 0, b.no).toBe(isLive(b));
    const all = LEGO_BLOCKS.flatMap((b) => b.covers ?? []);
    expect(all.length).toBe(covered.size);
  });

  it("every entry path exists", () => {
    const dead = LEGO_BLOCKS.flatMap((b) => b.entry.filter((p) => hasRepo || !p.startsWith("repo:")).filter((p) => !existsSync(abs(p))).map((p) => `${b.no}: ${p}`));
    expect(dead).toEqual([]);
  });

  it("catalogHref leaves defaults out and opens the list filtered by system", () => {
    expect(catalogHref()).toBe("/ops/systems/blocks");
    expect(catalogHref({ view: "systems", tier: "block" })).toBe("/ops/systems/blocks");
    expect(catalogHref({ view: "blocks", sys: "studio" })).toBe("/ops/systems/blocks?view=blocks&sys=studio");
    expect(catalogHref({ grp: "attention" })).toBe("/ops/systems/blocks?grp=attention");
  });

  it("stats and per-system lookup agree with the list", () => {
    const s = blockStats();
    const blocks = LEGO_BLOCKS.filter((b) => b.tier === "block");
    expect(s.live + s.planned + s.retired).toBe(blocks.length);
    expect(blocksForSystem("studio").every((b) => b.usedBy.includes("studio") && isLive(b))).toBe(true);
  });
});

describe("積木目錄 coverage", () => {
  it("every block the backend registry actually holds is covered (ids built in loops included)", async () => {
    // operator RSS feeds (search/<feed id>) come from env at runtime and are part of B-008 by design; a host with feeds
    // configured must not fail this test, so the registry is read with none
    vi.stubEnv("CONTENT_TRENDING_FEEDS", "");
    await import("@/lib/content/blocks/register-all");
    await import("@/lib/content/trending-sources");
    const { listAll } = await import("@/lib/content/blocks/registry");
    const ids = listAll().map((b) => b.id);
    expect(ids.length).toBeGreaterThan(10);
    expect(ids.filter((id) => !covered.has(id))).toEqual([]);
  });

  it("every editor dock panel is covered", () => {
    const panels = readdirSync(join(APP, "public/editor-shared/blocks")).filter((f) => f.endsWith(".js")).map((f) => `panel/${f.slice(0, -3)}`);
    expect(panels.filter((id) => !covered.has(id))).toEqual([]);
  });

  it("every product MODULE_MANIFEST is covered", () => {
    const mods = readdirSync(join(APP, "lib")).filter((d) => existsSync(join(APP, "lib", d, "MODULE_MANIFEST.json"))).map((d) => `module/${d}`);
    expect(mods.length).toBeGreaterThan(5);
    expect(mods.filter((id) => !covered.has(id))).toEqual([]);
  });

  it.skipIf(!hasRepo)("every cognitive family is listed with its method count", () => {
    const root = join(REPO, "Projects/internal/cognitive-engineering-os/ai_lego/modules");
    if (!existsSync(root)) return;
    const actual = Object.fromEntries(readdirSync(root).filter((d) => !d.startsWith("_") && statSync(join(root, d)).isDirectory())
      .map((d) => [`cognitive/${d}`, readdirSync(join(root, d)).filter((f) => f.endsWith(".py") && !f.startsWith("__")).length]));
    const listed = Object.fromEntries(LEGO_BLOCKS.filter((b) => b.tier === "method").map((b) => [b.covers?.[0], b.count]));
    expect(listed).toEqual(actual);
  });
});

describe.skipIf(!hasRepo)("積木目錄 against the system registry", () => {
  const registry = hasRepo ? (JSON.parse(readFileSync(REGISTRY, "utf8")) as { shared_paths: string[]; systems: Array<{ slug: string; source_paths: string[] }> }) : { shared_paths: [], systems: [] };
  const prefixes = registry.systems.flatMap((s) => s.source_paths.map((p) => ({ p, slug: s.slug }))).sort((a, b) => b.p.length - a.p.length);
  const under = (path: string, p: string) => (p.endsWith("/") ? path.startsWith(p) : path === p);
  const owner = (repoPath: string) => prefixes.find(({ p }) => under(repoPath, p))?.slug ?? null;
  // every "@/x" import of a source file, resolved to an app-relative file path, with the importer's system
  const imports = ["app", "lib", "components"].flatMap((d) => walk(join(APP, d))).flatMap((f) => {
    const sys = owner(APP_FROM_REPO + rel(f));
    if (!sys) return [];
    return [...readFileSync(f, "utf8").matchAll(/["']@\/([^"']+)["']/g)].flatMap(([, spec]) => {
      // every module kind tsconfig resolves (allowJs, resolveJsonModule): the spec itself, then the extension-less forms
      const file = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"].map((x) => spec + x)
        .find((c) => existsSync(join(APP, c)) && statSync(join(APP, c)).isFile());
      return file ? [{ file, sys, from: rel(f) }] : [];
    });
  });
  const liveEntries = (b: (typeof LEGO_BLOCKS)[number]) => b.entry.filter((e) => !e.startsWith("repo:"));

  it("every usedBy slug is a registered system", () => {
    const slugs = new Set(registry.systems.map((s) => s.slug));
    expect(LEGO_BLOCKS.flatMap((b) => b.usedBy.filter((s) => !slugs.has(s)).map((s) => `${b.no}: ${s}`))).toEqual([]);
  });

  it("every system importing a block through @/ is in that block's usedBy (file and folder entries)", () => {
    const missing = new Set<string>();
    for (const b of LEGO_BLOCKS) {
      for (const { file, sys, from } of imports) {
        if (liveEntries(b).some((e) => under(file, e)) && !b.usedBy.includes(sys)) missing.add(`${b.no} <- ${sys} (${from})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("every file two or more systems assemble belongs to a block (or is registry shared plumbing)", () => {
    const users = new Map<string, Set<string>>();
    for (const { file, sys } of imports) users.set(file, (users.get(file) ?? new Set()).add(sys));
    const entries = LEGO_BLOCKS.filter(isLive).flatMap(liveEntries);
    const orphans = [...users].filter(([file, s]) => s.size >= 2 && !entries.some((e) => under(file, e))
      && !registry.shared_paths.some((p) => under(APP_FROM_REPO + file, p))).map(([file, s]) => `${file} <- ${[...s].sort().join(",")}`);
    expect(orphans).toEqual([]);
  });
});
