// Legacy Sharp-shaped grade → Fabric filters (Tarot print, Studio GradedPreview). Fabric's HueRotation computes
// rad = rotation * Math.PI (node_modules/fabric/dist/index.mjs), so rotation is degrees / 180; radians double-count π.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFabricImageFilters } from "@/app/(shell)/tools/canvas/fabric-filters";
import { NEUTRAL_PARAMS } from "../color-grade";

class Rec { constructor(public cls: string, public opts?: Record<string, unknown>) {} }
const F = new Proxy({}, { get: (_t, cls: string) => class extends Rec { constructor(o?: Record<string, unknown>) { super(cls, o); } } }) as Record<string, new (o?: Record<string, unknown>) => object>;

describe("legacy buildFabricImageFilters hue", () => {
  it("30° → HueRotation rotation 30/180 (Fabric applies π itself)", () => {
    const out = buildFabricImageFilters({ filters: F }, { ...NEUTRAL_PARAMS, hue: 30 }) as Rec[];
    const hue = out.find((f) => f.cls === "HueRotation");
    expect(hue?.opts).toEqual({ rotation: 30 / 180 });
  });
  it("matches the editors' shared module for the same angle", async () => {
    const shared = await import("../editor-color-grade");
    const spec = shared.buildFilterSpecs(shared.setPath(shared.neutralAdj(), "grade.hue", -20)).find((s) => s.cls === "HueRotation");
    const legacy = (buildFabricImageFilters({ filters: F }, { ...NEUTRAL_PARAMS, hue: -20 }) as Rec[]).find((f) => f.cls === "HueRotation");
    expect(legacy?.opts).toEqual(spec?.opts);
  });
});

describe("no HueRotation is ever given radians", () => {
  const APP = path.resolve(__dirname, "..", "..", "..");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(tsx?|m?js|html)$/.test(e.name)) files.push(f);
    }
  };
  for (const d of ["app", "lib", "components", "public"]) walk(path.join(APP, d));
  // [^;] and [^,}] also match line breaks, so a constructor split over lines is caught too (Codex e94f5ada F1)
  const RADIANS = new RegExp("HueRotation[^;]{0,160}rotation:[^,}]*Math\\.PI");
  it("every source passes degrees / 180", () => {
    const bad = files.filter((f) => RADIANS.test(fs.readFileSync(f, "utf8")));
    expect(bad.map((f) => path.relative(APP, f))).toEqual([]);
  });
  it("the guard itself catches the old radians form", () => {
    expect(RADIANS.test("new F.HueRotation({ rotation: (p.hue * Math.PI) / 180 })")).toBe(true);
    expect(RADIANS.test("new F.HueRotation({ rotation: p.hue / 180 })")).toBe(false);
    expect(RADIANS.test("new F.HueRotation({\n  rotation: (p.hue * Math.PI) / 180,\n})")).toBe(true);
    expect(RADIANS.test("new F.HueRotation({\n  rotation: p.hue / 180,\n})")).toBe(false);
  });
});
