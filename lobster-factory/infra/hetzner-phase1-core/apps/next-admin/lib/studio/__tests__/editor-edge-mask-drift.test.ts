// Drift guard for ✂️ 邊緣遮罩 and 🖼 擴圖 presets (R0-PLAN §6 C4.3): the styles / compositing are ONE file,
// public/editor-shared/edge-mask.js, and the flux-fill-pro outpaint enum is ONE file, public/editor-shared/outpaint-presets.js.
// lib/studio/{edge-mask,outpaint-presets}.ts only add types. Fails if (a) a door stops being the shared module, (b) a type union drifts
// from the runtime list, (c) the mask output changes without anyone meaning it to, (d) a private copy of the maths / enum comes back,
// (e) a shared file stops loading as a browser ES module.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import * as door from "../edge-mask";
import * as opDoor from "../outpaint-presets";
import * as shared from "../../../public/editor-shared/edge-mask.js";
import * as opShared from "../../../public/editor-shared/outpaint-presets.js";
import { OUTPAINT_PRESETS as SERVER_PRESETS } from "../generative-fill";
import * as postDoor from "../posterize";
import * as postShared from "../../../public/editor-shared/posterize.js";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const unionOf = (src: string, name: string) => {
  const m = src.match(new RegExp(`export type ${name} =([^;]+);`));
  expect(m, `type ${name}`).not.toBeNull();
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

describe("TS doors are the shared modules (types only)", () => {
  it("edge-mask.ts re-exports the shared objects, nothing of its own", () => {
    expect(door.EDGE_MASK_STYLES).toBe(shared.EDGE_MASK_STYLES);
    expect(door.DEFAULT_EDGE_PARAMS).toBe(shared.DEFAULT_EDGE_PARAMS);
    expect(door.getEdgeMaskStyle).toBe(shared.getEdgeMaskStyle);
    expect(door.buildMaskSvg).toBe(shared.buildMaskSvg);
    expect(door.applyEdgeMask).toBe(shared.applyEdgeMask);
    expect(read("lib/studio/edge-mask.ts")).not.toMatch(/feTurbulence|roundedRect|destination-in|function /);
  });
  it("outpaint-presets.ts re-exports the shared list; the genfill route validates against the same array", () => {
    expect(opDoor.OUTPAINT_PRESETS).toBe(opShared.OUTPAINT_PRESETS);
    expect(opDoor.OUTPAINT_LABELS).toBe(opShared.OUTPAINT_LABELS);
    expect(SERVER_PRESETS).toBe(opShared.OUTPAINT_PRESETS);
    expect(Object.keys(opShared.OUTPAINT_LABELS)).toEqual([...opShared.OUTPAINT_PRESETS]);
    expect(read("app/api/tools/studio/genfill/route.ts")).toMatch(/OUTPAINT_PRESETS\.includes\(/);
  });
  it("posterize.ts re-exports the shared functions; quantizeRgb keeps alpha and snaps RGB to N levels", () => {
    expect(postDoor.quantizeRgb).toBe(postShared.quantizeRgb);
    expect(postDoor.posterizeDataUrl).toBe(postShared.posterizeDataUrl);
    const px = new Uint8ClampedArray([10, 128, 250, 77]);
    postDoor.quantizeRgb(px, 2);
    expect(Array.from(px)).toEqual([0, 255, 255, 77]);
    expect(read("lib/studio/posterize.ts")).not.toMatch(/function |getImageData/);
  });
  it("type unions list exactly the runtime values", () => {
    expect(unionOf(read("lib/studio/edge-mask.ts"), "EdgeMaskId")).toEqual(shared.EDGE_MASK_STYLES.map((s: { id: string }) => s.id));
    expect(unionOf(read("lib/studio/outpaint-presets.ts"), "OutpaintPreset")).toEqual([...opShared.OUTPAINT_PRESETS]);
  });
});

describe("mask output unchanged by the move", () => {
  // sha256 of every style × 3 sizes × 6 amounts × 3 seeds, taken from lib/studio/edge-mask.ts as it was before the move (HEAD 7c61c7ffc)
  // and byte-identical from the shared module. A deliberate change to the masks updates this hash in the same commit.
  const GOLDEN = "3c0db91187fc2c67652ba466264b5bd87e590af5321bb5599469daeb486c8a23";
  it("buildMaskSvg / registry dump hashes to the pre-move golden", () => {
    const parts = [
      JSON.stringify(shared.DEFAULT_EDGE_PARAMS),
      JSON.stringify((shared.EDGE_MASK_STYLES as { build?: unknown }[]).map(({ build: b, ...s }) => ({ ...s, build: typeof b }))),
    ];
    for (const s of shared.EDGE_MASK_STYLES) for (const [w, h] of [[44, 44], [800, 1000], [833, 1211]]) for (const amount of [0, 10, 55, 62, 90, 100]) for (const seed of [1, 7, 93]) parts.push(shared.buildMaskSvg(s.id, w, h, { amount, seed }));
    expect(crypto.createHash("sha256").update(parts.join("\n")).digest("hex")).toBe(GOLDEN);
  });
});

describe("no private copy", () => {
  const files = (dir: string): string[] => fs.readdirSync(path.join(APP, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "node_modules" || e.name === "__tests__" ? [] : files(path.join(dir, e.name)))
      : /\.(tsx?|m?js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path.join(dir, e.name).replace(/\\/g, "/")] : []);
  const all = ["app", "lib", "components", "public"].flatMap(files);
  it("the procedural mask maths lives only in editor-shared/edge-mask.js", () => {
    expect(all.filter((f) => /feTurbulence|feDisplacementMap/.test(read(f)))).toEqual(["public/editor-shared/edge-mask.js"]);
  });
  it("the outpaint enum lives only in editor-shared/outpaint-presets.js (plus the type union of its door)", () => {
    expect(all.filter((f) => read(f).includes('"Bottom outpaint"')).sort()).toEqual(["lib/studio/outpaint-presets.ts", "public/editor-shared/outpaint-presets.js"]);
  });
  it("the posterize quantizer lives only in editor-shared/posterize.js", () => {
    expect(all.filter((f) => /Math\.round\(data\[i \+ 1\] \/ step\)/.test(read(f)))).toEqual(["public/editor-shared/posterize.js"]);
    expect(read("app/(shell)/tools/canvas/CanvasEditor.tsx")).toContain('from "@/lib/studio/posterize"');
  });
  it("every consumer still imports through the door", () => {
    for (const f of ["app/(shell)/tools/canvas/CanvasEditor.tsx", "app/(shell)/tools/studio/StudioWorkbench.tsx", "app/(shell)/tools/designs/DesignsGallery.tsx"]) {
      expect(read(f), f).toContain('from "@/lib/studio/edge-mask"');
    }
    expect(read("lib/studio/generative-fill.ts")).toContain('from "./outpaint-presets"');
  });
});

describe("shared files: browser ES modules, no UI colour", () => {
  it.each(["public/editor-shared/edge-mask.js", "public/editor-shared/outpaint-presets.js", "public/editor-shared/posterize.js"])("%s loads as an ES module", async (rel) => {
    const out = await build({ entryPoints: [path.join(APP, rel)], bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent" });
    const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
  it("the only colour literal is the mask fill (alpha source, not UI)", () => {
    for (const rel of ["public/editor-shared/edge-mask.js", "public/editor-shared/outpaint-presets.js"]) {
      const src = read(rel).replace(/\/\/.*$/gm, "");
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], rel).toEqual(rel.endsWith("edge-mask.js") ? ["#fff"] : []);
      expect(src, rel).not.toMatch(/\b(?:rgba?|hsla?)\(/);
    }
  });
});
