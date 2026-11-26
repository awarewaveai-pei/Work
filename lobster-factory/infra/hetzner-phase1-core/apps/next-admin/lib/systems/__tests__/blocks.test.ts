// Only an edit of lib/systems/blocks.ts itself can turn this red (numbers, shapes, links). Everything that follows the rest
// of the code -- who imports what, new capability ids, method counts, dead entry paths -- is in block-usage.generated.json,
// which GitHub refreshes after every push (block-usage-refresh.yml) and the page lists as 待處理: feature work never waits.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCK_LAYERS, BLOCK_STATUS, LEGO_BLOCKS, TIERS, blockHref, blockStats, blocksForSystem, catalogHref, isLive } from "../blocks";
import { GENERATED, hasRepo as repoPresent, readRegistry } from "../block-usage";

const hasRepo = repoPresent();
const covered = new Set(LEGO_BLOCKS.flatMap((b) => b.covers ?? []));

describe("積木目錄 shape", () => {
  it("numbers are unique, carry their tier prefix and run without gaps (a retired block keeps its number)", () => {
    for (const t of TIERS) {
      const nos = LEGO_BLOCKS.filter((b) => b.tier === t.key).map((b) => b.no);
      const digits = t.key === "block" ? 3 : 2;
      expect(nos, t.key).toEqual(nos.map((_, i) => `${t.prefix}-${String(i + 1).padStart(digits, "0")}`));
    }
  });

  it("status is known, a live entry has users, 功能積木 have a layer", () => {
    const layers = BLOCK_LAYERS.map((l) => l.key as string);
    for (const b of LEGO_BLOCKS) {
      for (const s of b.status) expect(Object.keys(BLOCK_STATUS), b.no).toContain(s);
      if (isLive(b)) expect(b.usedBy.length, b.no).toBeGreaterThan(0);
      expect(new Set(b.usedBy).size, `${b.no} lists a system twice`).toBe(b.usedBy.length);
      expect(b.tier === "block" ? layers.includes(b.layer ?? "") : b.layer === undefined, b.no).toBe(true);
    }
  });

  it("live blocks name an entry; planned and retired name none; a code id is covered once", () => {
    for (const b of LEGO_BLOCKS) expect(b.entry.length > 0, b.no).toBe(isLive(b));
    const all = LEGO_BLOCKS.flatMap((b) => b.covers ?? []);
    expect(all.length).toBe(covered.size);
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

describe("積木目錄 scan file", () => {
  it("block-usage.generated.json has its shape and names only real block numbers", () => {
    const d = JSON.parse(readFileSync(GENERATED, "utf8")) as Record<string, unknown>;
    const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
    const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
    const nos = new Set(LEGO_BLOCKS.map((b) => b.no));
    expect(rec(d.usedBy) && Object.entries(d.usedBy).every(([no, v]) => nos.has(no) && strs(v))).toBe(true);
    expect(rec(d.methodCounts) && Object.values(d.methodCounts).every((n) => Number.isInteger(n))).toBe(true);
    const row = (r: unknown) => rec(r) && typeof r.path === "string" && strs(r.systems);
    expect(Array.isArray(d.shared) && d.shared.every(row)).toBe(true);
    expect(Array.isArray(d.pending) && d.pending.every((r) => row(r) && ["shared", "uncovered", "dead"].includes(String((r as { kind?: unknown }).kind)))).toBe(true);
  });
});

describe.skipIf(!hasRepo)("積木目錄 against the system registry", () => {
  const registry = hasRepo ? readRegistry() : { shared_paths: [], systems: [] };

  it("every usedBy slug is a registered system", () => {
    const slugs = new Set(registry.systems.map((s) => s.slug));
    expect(LEGO_BLOCKS.flatMap((b) => b.usedBy.filter((s) => !slugs.has(s)).map((s) => `${b.no}: ${s}`))).toEqual([]);
  });
});
