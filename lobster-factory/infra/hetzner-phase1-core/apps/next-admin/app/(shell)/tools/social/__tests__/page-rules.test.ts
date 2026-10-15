// The product page keeps the mock's rules (lobster-factory/docs/social/mockups/check-social-mocks.py, SOCIAL_MANAGER_PLAN
// C6): no dropdown, and no colour of its own -- every colour is a globals.css token (platform marks = --p-*).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "..");
const files = readdirSync(DIR).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => ({ f, src: readFileSync(path.join(DIR, f), "utf8") }));
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // comments may name a rule
const NAMED = /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-?color|fill|stroke|outline-color)\s*:\s*[^;{}]*\b(white|black|red|green|blue|gray|grey|yellow|orange|purple|pink)\b/i;

describe("/tools/social page rules", () => {
  it("covers the page's files", () => {
    expect(files.map((x) => x.f)).toEqual(expect.arrayContaining(["SocialManager.tsx", "Editor.tsx", "Calendar.tsx", "social.css"]));
  });

  it("no <select>, in JSX or built by script", () => {
    for (const { f, src } of files) {
      expect(code(src), f).not.toMatch(/<select\b/i);
      expect(code(src), f).not.toMatch(/createElement\(\s*["'`]select/);
    }
  });

  it("no colour literal: hex, colour functions or named colours", () => {
    for (const { f, src } of files) {
      const c = code(src).replace(/var\([^()]*\)/g, "");
      expect(c.match(/#[0-9a-fA-F]{3,8}\b/g), `${f} hex`).toBeNull();
      expect(c.match(/\b(?:rgba?|hsla?|hwb|oklch|oklab|color-mix)\s*\(/g), `${f} colour function`).toBeNull();
      expect(c.match(NAMED), `${f} named colour`).toBeNull();
    }
  });
});
