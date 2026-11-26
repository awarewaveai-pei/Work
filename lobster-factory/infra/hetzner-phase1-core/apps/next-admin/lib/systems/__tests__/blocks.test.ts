// Keeps lib/systems/blocks.ts true to the code: permanent numbers, no dead path, nothing unlisted, and the import-derived
// usedBy file is current. Registry / cognitive checks need the repo root (local and CI); the host copy of next-admin has
// neither, so those cases skip there and the rest still run.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BLOCK_LAYERS, BLOCK_STATUS, LEGO_BLOCKS, TIERS, blockHref, blockStats, blocksForSystem, catalogHref, isLive } from "../blocks";
import { APP, GENERATED, GEN_CMD, REPO, derivedUsedBy, hasRepo as repoPresent, inShared, liveEntries, readRegistry, scanImports, under } from "../block-usage";

const hasRepo = repoPresent();
const abs = (p: string) => (p.startsWith("repo:") ? join(REPO, p.slice(5)) : join(APP, p));
const covered = new Set(LEGO_BLOCKS.flatMap((b) => b.covers ?? []));

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
    expect(catalogHref({ view: "blocks", shared: true })).toBe("/ops/systems/blocks?view=blocks&shared=1");
    expect(blockHref("M-05")).toBe("/ops/systems/blocks?view=blocks&tier=module#M-05");
    expect(blockHref("B-999")).toBeNull();
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
  const registry = hasRepo ? readRegistry() : { shared_paths: [], systems: [] };
  const imports = hasRepo ? scanImports(registry) : [];

  it("every usedBy slug is a registered system", () => {
    const slugs = new Set(registry.systems.map((s) => s.slug));
    expect(LEGO_BLOCKS.flatMap((b) => b.usedBy.filter((s) => !slugs.has(s)).map((s) => `${b.no}: ${s}`))).toEqual([]);
  });

  it("block-usage.generated.json matches the real @/ imports (file and folder entries)", () => {
    // parsed first so a failure prints which block / system differs, not a truncated JSON string
    expect(JSON.parse(readFileSync(GENERATED, "utf8")), `a system started (or stopped) importing a block -- run \`${GEN_CMD}\` in apps/next-admin and commit the file`)
      .toEqual(derivedUsedBy(LEGO_BLOCKS, imports));
  });

  it("every file two or more systems assemble belongs to a block (or is registry shared plumbing)", () => {
    const users = new Map<string, Set<string>>();
    for (const { file, sys } of imports) users.set(file, (users.get(file) ?? new Set()).add(sys));
    const entries = LEGO_BLOCKS.filter(isLive).flatMap(liveEntries);
    const orphans = [...users].filter(([file, s]) => s.size >= 2 && !entries.some((e) => under(file, e))
      && !inShared(registry, file)).map(([file, s]) => `${file} <- ${[...s].sort().join(",")}`);
    expect(orphans).toEqual([]);
  });
});
