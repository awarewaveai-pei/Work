import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Operator 2026-10-25: palette colors are surfaces, never text. Words in the accent role read
// var(--accent-text); var(--accent) as a text color would turn unreadable under a pastel preset.
const ROOT = path.resolve(__dirname, "../../..");
const DIRECT = /(?<![-\w])color\s*:\s*['"]?var\(--accent\)/;
const CONDITIONAL = /(?<![-\w])color\s*:\s*[^,;{}\n]*?\?[^,;{}\n]*?var\(--accent\)/;

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : walk(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });

describe("accent color is not used for text", () => {
  it("no style paints text with var(--accent)", () => {
    const hits = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((f) =>
        fs.readFileSync(f, "utf8").split("\n").flatMap((line, i) =>
          DIRECT.test(line) || CONDITIONAL.test(line) ? [`${path.relative(ROOT, f)}:${i + 1}`] : []));
    expect(hits).toEqual([]);
  });

  // A text token is only guaranteed on the surface it was derived for (critic 2026-10-25 M2/m1):
  // words on the AI box read --ai-text; words on a solid accent fill read --btn-primary-text.
  it("text on the AI box or on a solid accent fill uses that surface's own ink", () => {
    const SOLID_ACCENT_BG = /background\s*:[^;{}\n]*?(?<!srgb, )var\(--accent\)/;
    const FIXED_WHITE = /(?<![-\w])color\s*:\s*['"]?(#fff\b|#ffffff\b|white\b|var\(--accent-contrast)/i;
    // Judged per style object / CSS rule block ({...} with no nested braces), so two elements sharing
    // one long line are not mixed up.
    const hits = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((f) => {
        const src = fs.readFileSync(f, "utf8");
        return [...src.matchAll(/\{[^{}]*\}/g)].flatMap((m) => {
          const block = m[0];
          const where = `${path.relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length}`;
          return [
            block.includes("var(--ai-bg)") && block.includes("var(--accent-text)") ? [`${where} accent-text on ai-bg`] : [],
            SOLID_ACCENT_BG.test(block) && FIXED_WHITE.test(block) ? [`${where} fixed white on accent`] : [],
          ].flat();
        });
      });
    expect(hits).toEqual([]);
  });
});
