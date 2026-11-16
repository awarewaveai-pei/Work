// video-unify-plan-20261116 §1.8 / §4 U2: one look across the video tool, checked by machine. Every file the
// workbench pages import has no hex color, no font of its own and no <select>; the shared controls in
// components/tools/panel-primitives.ts carry the same values as the workbench's own pages (VW/styles/projects.css).
import fs from "node:fs";
import path from "node:path";
import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import { buttonStyle, cardStyle, inputStyle, optionStyle } from "@/components/tools/panel-primitives";

const APP = path.resolve(__dirname, "../../../..");
const rel = (f: string) => path.relative(APP, f).split(path.sep).join("/");

// The workbench pages, plus the components U3 / U6 mount there (script page, QA, release), so they are held to the
// contract before their page exists. Once mounted, the import walk reaches them anyway.
const ROOTS = [
  ...fs.readdirSync(path.join(APP, "app/video/(wb)"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__"))
    .map((f) => path.join(APP, "app/video/(wb)", f)),
  ...["ScriptForge", "StoryBibleWorkbench", "QaStep", "ReleaseDeliveryPanel", "RightsCheckbox"]
    .map((n) => path.join(APP, `app/(shell)/tools/video/${n}.tsx`)),
];

// Plan §4 U2: the door always locks the organization, so this picker never shows inside the workbench.
const EXEMPT = new Set(["app/(shell)/tools/video/OrganizationPicker.tsx"]);

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(APP, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (/\.tsx?$/.test(c) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function importGraph(roots: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^import\s+["']([^"']+)["']/gm)) {
      const next = resolveImport(file, m[1] ?? m[2] ?? m[3]);
      if (next) queue.push(next);
    }
  }
  return [...seen].map(rel).sort();
}

const FILES = importGraph(ROOTS);
// Components draw the screen; plain .ts modules hold data (tarot card colors feed image prompts) -- except the style source.
const PRIMITIVES = "components/tools/panel-primitives.ts";
const hits = (re: RegExp) =>
  FILES.filter((f) => (f.endsWith(".tsx") || f === PRIMITIVES) && !EXEMPT.has(f)).flatMap((f) =>
    fs.readFileSync(path.join(APP, f), "utf8").split("\n").flatMap((line, i) => (re.test(line) ? [`${f}:${i + 1}`] : [])));

describe("video tool style contract", () => {
  it("walks the workbench pages and the components they will mount", () => {
    expect(FILES).toEqual(expect.arrayContaining(["app/(shell)/tools/video/ScriptForge.tsx", PRIMITIVES]));
    for (const f of EXEMPT) expect(FILES).toContain(f); // a stale exemption fails here
  });

  it("no hex color literal", () => {
    expect(hits(/(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/)).toEqual([]);
  });

  it("no font of its own: no fontFamily / font-family, no font shorthand other than inherit", () => {
    expect(hits(/fontFamily|font-family|\bfont\s*:\s*["'`](?!inherit["'`])/)).toEqual([]);
  });

  it("no <select>: choices are visible buttons", () => {
    expect(hits(/<select\b/)).toEqual([]);
  });
});

// The workbench's own stylesheet sits next to next-admin in the repo; the host deploy gate syncs next-admin alone.
const WB_CSS = path.resolve(APP, "../video-workbench/styles/projects.css");

describe.skipIf(!fs.existsSync(WB_CSS))("panel primitives = the workbench's own controls", () => {
  const css = fs.existsSync(WB_CSS) ? fs.readFileSync(WB_CSS, "utf8") : "";
  const camel = (p: string) => p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  // Every declaration of exactly this selector, later blocks winning (projects.css splits `input` over several).
  const rule = (selector: string, ...skip: string[]) => {
    const decl: Record<string, string> = {};
    for (const m of css.matchAll(/(?:^|\n)([^{}\n]+)\{([^}]*)\}/g)) {
      if (m[1].trim() !== selector) continue;
      for (const d of m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) if (!skip.includes(camel(d[1]))) decl[camel(d[1])] = d[2].trim();
    }
    expect(Object.keys(decl).length).toBeGreaterThan(0);
    return decl;
  };
  // The primitive's value for each property the CSS rule declares, written the way CSS writes it.
  const asCss = (style: CSSProperties, decl: Record<string, string>) =>
    Object.fromEntries(Object.keys(decl).map((k) => {
      const v = (style as Record<string, unknown>)[k];
      return [k, typeof v === "number" && k !== "opacity" ? `${v}px` : String(v)];
    }));

  it("button = .btn, .btn.primary, .btn.small, button:disabled", () => {
    expect(asCss(buttonStyle(), rule(".btn"))).toEqual(rule(".btn"));
    // .btn.primary turns the border transparent; the primitive writes the whole border
    expect(asCss(buttonStyle({ tone: "primary" }), rule(".btn.primary", "borderColor"))).toEqual(rule(".btn.primary", "borderColor"));
    expect(rule(".btn.primary").borderColor).toBe("transparent");
    expect(buttonStyle({ tone: "primary" }).border).toBe("1px solid transparent");
    expect(asCss(buttonStyle({ small: true }), rule(".btn.small"))).toEqual(rule(".btn.small"));
    expect(asCss(buttonStyle({ disabled: true }), rule("button:disabled"))).toEqual(rule("button:disabled"));
  });

  it("input = input, input:focus-visible", () => {
    // `outline: none` at rest becomes `revert` here so an input that does not track focus keeps the browser ring
    expect(asCss(inputStyle(), rule("input", "outline"))).toEqual(rule("input", "outline"));
    expect(asCss(inputStyle(true), rule("input:focus-visible"))).toEqual(rule("input:focus-visible"));
  });

  it("card = .panel; option = .chip, .chip.on", () => {
    expect(asCss(cardStyle(), rule(".panel"))).toEqual(rule(".panel"));
    expect(Object.keys(cardStyle()).sort()).toEqual(Object.keys(rule(".panel")).sort()); // nothing .panel does not set
    expect(asCss(optionStyle(false), rule(".chip"))).toEqual(rule(".chip"));
    expect(asCss(optionStyle(true), rule(".chip.on", "borderColor"))).toEqual(rule(".chip.on", "borderColor"));
    expect(optionStyle(true).border).toBe(`1px solid ${rule(".chip.on").borderColor}`);
  });
});
