// Filter ownership invariant (CARD-06, Codex 7b1c8fc0 F1–F3 on CARD-05): every filter on an image is derived from its `adj`
// (public/editor-shared/color-grade.js buildFilterSpecs); nothing infers ownership from a filter's class or params.
//   F1 an old image with filters but no adj kept them through a 調色 edit      → adj.legacy
//   F2 a 去背 colour key at white / 0.12 survives a 調色 edit (it is not 去白底)  → adj.removeColor
//   F3 還原 clears the colour key only, never 去白底                             → clearRemoveColor
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  adoptAdj, buildFilterSpecs, clearRemoveColor, isGradeNeutral, isNeutralAdj, makeFilters, neutralAdj, resetGradeAdj, sanitizeAdj,
  sanitizeLegacy, sanitizeRemoveColor, serializeFilters, setPath, setRemoveColor,
} from "../editor-color-grade";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const names = (adj: unknown) => buildFilterSpecs(adj).map((s) => s.cls);

/** Stand-ins for Fabric's filter classes: constructor(opts) → instance whose toObject() is { type, ...opts } (what Fabric 5 and 7 serialize). */
const F = new Proxy({}, { get: (_t, cls: string) => class { type = cls; o: Record<string, unknown>; constructor(o?: Record<string, unknown>) { this.o = o ?? {}; } toObject() { return { type: this.type, ...this.o }; } } }) as Record<string, new (o?: Record<string, unknown>) => { toObject(): Record<string, unknown> }>;

describe("F1 — legacy filters (no adj) survive the first 調色 edit", () => {
  const legacy = [new F.Brightness({ brightness: 0.2 }), new F.Sepia()];
  it("adoptAdj keeps them verbatim in adj.legacy, controls neutral", () => {
    const a = adoptAdj(undefined, legacy);
    expect(a.legacy).toEqual([{ type: "Brightness", brightness: 0.2 }, { type: "Sepia" }]);
    expect(isGradeNeutral(a)).toBe(true);
    expect(buildFilterSpecs(a)).toEqual([{ cls: "Brightness", opts: { brightness: 0.2 } }, { cls: "Sepia", opts: undefined }]);
  });
  it("a 調色 edit rebuilds the legacy Brightness (after the panel's own filters, every time)", () => {
    let a = adoptAdj(undefined, legacy);
    a = setPath(a, "grade.sat", 150);
    expect(names(a)).toEqual(["Saturation", "Brightness", "Sepia"]);
    a = setPath(a, "grade.hue", 10);
    expect(names(a)).toEqual(["HueRotation", "Saturation", "Brightness", "Sepia"]);
    const rebuilt = makeFilters((cls) => F[cls], buildFilterSpecs(a)) as { toObject(): Record<string, unknown> }[];
    expect(rebuilt.map((f) => f.toObject())[2]).toEqual({ type: "Brightness", brightness: 0.2 });
  });
  it("it rides undo / save / load / cross-editor load: sanitizeAdj + JSON keep adj.legacy; an unknown class is kept, only skipped when instantiated", () => {
    const a = setPath(adoptAdj(null, [new F.Brightness({ brightness: -0.1 }), new F.SomeFutureFilter({ x: 1 })]), "contrast", 10);
    const loaded = sanitizeAdj(JSON.parse(JSON.stringify(a)));
    expect(loaded).toEqual(a);
    expect(loaded.legacy).toHaveLength(2);
    const made = makeFilters((cls) => (cls === "SomeFutureFilter" ? null : F[cls]), buildFilterSpecs(loaded)) as { toObject(): Record<string, unknown> }[];
    expect(made.map((f) => f.toObject().type)).toEqual(["Contrast", "Brightness"]);
  });
  it("an image that already has a usable adj is NOT given its filters again (no double application)", () => {
    const a = adoptAdj(setPath(neutralAdj(), "grade.sat", 130), [new F.Saturation({ saturation: 0.3 })]);
    expect(a.legacy).toEqual([]);
    expect(names(a)).toEqual(["Saturation"]);
  });
  it("an adj shape sanitizeAdj cannot map (unknown keys) is neutral + its filters in legacy", () => {
    const a = adoptAdj({ brightnessPct: 130, mystery: true }, [new F.Brightness({ brightness: 0.3 })]);
    expect(a.legacy).toEqual([{ type: "Brightness", brightness: 0.3 }]);
    expect(isGradeNeutral(a)).toBe(true);
    expect(adoptAdj(undefined, [])).toEqual(neutralAdj());
  });
  it("sanitizeLegacy drops anything that is not a plain { type } object and caps the list", () => {
    expect(sanitizeLegacy([{ type: "Brightness", brightness: 1 }, null, 3, { type: 5 }, { type: "bad name" }, { nope: 1 }])).toEqual([{ type: "Brightness", brightness: 1 }]);
    expect(sanitizeLegacy("x")).toEqual([]);
    expect(sanitizeLegacy(Array.from({ length: 100 }, () => ({ type: "Sepia" })))).toHaveLength(24);
    expect(serializeFilters([null, new F.Gamma({ gamma: [1.2, 1.2, 1.2] })])).toEqual([{ type: "Gamma", gamma: [1.2, 1.2, 1.2] }]);
  });
});

describe("F2 — a white / 0.12 colour key is its own entry, not 去白底", () => {
  const key = setRemoveColor(neutralAdj(), "#ffffff", 0.12);
  it("adj.removeColor builds its own RemoveColor spec; 去白底 off", () => {
    expect(key.removeWhite).toBe(false);
    expect(buildFilterSpecs(key)).toEqual([{ cls: "RemoveColor", opts: { color: "#ffffff", distance: 0.12 } }]);
  });
  it("any 調色 slider leaves it alone", () => {
    for (const [p, v] of [["grade.sat", 140], ["contrast", 30], ["blur", 20], ["grade.hue", -10]] as const) {
      const a = setPath(key, p, v);
      expect(a.removeColor).toEqual({ color: "#ffffff", distance: 0.12 });
      expect(names(a)).toContain("RemoveColor");
      expect(names(a).filter((n) => n === "RemoveColor")).toHaveLength(1);
    }
  });
  it("去白底 and the colour key coexist as two entries", () => {
    expect(names({ ...key, removeWhite: true }).filter((n) => n === "RemoveColor")).toHaveLength(2);
  });
  it("調色 重設 keeps the colour key and legacy; isGradeNeutral ignores them", () => {
    const a = { ...setPath(adoptAdj(null, [new F.Sepia()]), "grade.bri", 150), removeColor: { color: "#00ff00", distance: 0.3 } };
    const r = resetGradeAdj(a);
    expect(r.removeColor).toEqual(a.removeColor);
    expect(r.legacy).toEqual(a.legacy);
    expect(r.grade.bri).toBe(100);
    expect(isGradeNeutral(r)).toBe(true);
    expect(isGradeNeutral(a)).toBe(false);
    expect(isNeutralAdj(r)).toBe(false); // the key is still set: not "everything neutral"
  });
  it("sanitizeRemoveColor clamps the tolerance, lowercases the colour, and turns garbage into null (= off)", () => {
    expect(sanitizeRemoveColor({ color: "#FFAA00", distance: 9 })).toEqual({ color: "#ffaa00", distance: 0.6 });
    expect(sanitizeRemoveColor({ color: "#ffaa00", distance: -1 })).toEqual({ color: "#ffaa00", distance: 0 });
    expect(sanitizeRemoveColor({ color: "#ffaa00", distance: Number.NaN })).toEqual({ color: "#ffaa00", distance: 0.15 });
    for (const bad of [null, "x", { color: "red", distance: 0.1 }, { distance: 0.1 }]) expect(sanitizeRemoveColor(bad)).toBeNull();
  });
});

describe("F3 — 還原 clears only the colour key", () => {
  it("去白底 is still on, still built, after clearRemoveColor", () => {
    const a = { ...setRemoveColor(neutralAdj(), "#ffffff", 0.12), removeWhite: true };
    expect(names(a)).toEqual(["RemoveColor", "RemoveColor"]);
    const r = clearRemoveColor(a);
    expect(r.removeColor).toBeNull();
    expect(r.removeWhite).toBe(true);
    expect(names(r)).toEqual(["RemoveColor"]);
    expect(buildFilterSpecs(r)).toEqual([{ cls: "RemoveColor", opts: { color: "#ffffff", distance: 0.12 } }]);
  });
  it("every other entry (preset, sliders, HSL, legacy) is untouched", () => {
    const a = setRemoveColor({ ...setPath(adoptAdj(null, [new F.Sepia()]), "grade.sat", 120), presetId: "warm" }, "#ff0000", 0.2);
    const r = clearRemoveColor(a);
    expect({ ...r, removeColor: a.removeColor }).toEqual(a);
  });
});

describe("no ownership guessing anywhere", () => {
  it("isGradeFilter / param sniffing is gone from the shared module and both editors", () => {
    for (const f of ["public/editor-shared/color-grade.js", "public/editor-shared/bg-remove.js", "public/vector-editor.html", "app/(shell)/tools/canvas/CanvasEditor.tsx", "lib/studio/editor-color-grade.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/isGradeFilter/);
      expect(src, f).not.toMatch(/instanceof F\.RemoveColor|f\.type\s*===\s*["']RemoveColor|\.filter\(f\s*=>\s*!?\(?f instanceof/);
    }
  });
  it("both editors rebuild the image's filters from buildFilterSpecs(adj) only — the vector keeps no 'foreign' filter list", () => {
    const vector = read("public/vector-editor.html");
    expect(vector).toMatch(/o\.filters=cg\.makeFilters\(cls=>F\[cls\], cg\.buildFilterSpecs\(adj\)\)/);
    expect(vector).not.toMatch(/foreign/);
    expect(read("app/(shell)/tools/canvas/CanvasEditor.tsx")).toMatch(/target\.filters = makeFilters\(\(cls\) => aw\[cls\] \?\? F\[cls\], buildFilterSpecs\(adj\)\)/);
  });
  it("both editors show an image through adoptAdj (legacy adoption), and 重設 is resetGradeAdj on both", () => {
    const vector = read("public/vector-editor.html"), canvas = read("app/(shell)/tools/canvas/CanvasEditor.tsx");
    expect(vector).toMatch(/cg\.adoptAdj\(o\.adj, o\.filters\)/);
    expect(canvas).toMatch(/adoptAdj\(img\.adj, img\.filters\)/);
    expect(vector).toMatch(/cg\.resetGradeAdj\(cgAdj\)/);
    expect(canvas).toMatch(/resetGradeAdj\(a\)/);
  });
});

describe("F1b — a usable adj next to filters it does not produce (Codex 697e7d45 F1)", () => {
  const a = setPath(neutralAdj(), "grade.sat", 150);
  const own = () => makeFilters((cls) => F[cls], buildFilterSpecs(a)) as { toObject(): Record<string, unknown> }[];
  it("an old 去背 block colour key beside the adj goes to adj.legacy and survives the next rebuild", () => {
    const adopted = adoptAdj(a, [...own(), new F.RemoveColor({ color: "#00ff00", distance: 0.2 })]);
    expect(adopted.legacy).toEqual([{ type: "RemoveColor", color: "#00ff00", distance: 0.2 }]);
    expect(names(setPath(adopted, "grade.sat", 120))).toEqual(["Saturation", "RemoveColor"]);
  });
  it("the adj's own filters are not adopted twice (no duplicate on rebuild)", () => {
    expect(adoptAdj(a, own()).legacy).toEqual([]);
    const w = { ...a, removeWhite: true };
    expect(adoptAdj(w, makeFilters((cls) => F[cls], buildFilterSpecs(w)) as unknown[]).legacy).toEqual([]);
  });
});
