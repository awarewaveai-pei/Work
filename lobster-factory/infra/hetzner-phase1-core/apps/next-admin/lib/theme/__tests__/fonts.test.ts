import { describe, expect, it } from "vitest";
import { FONT_CHOICES, FONT_TOKENS, SAME_AS_BODY, googleFontsHref } from "../fonts";
import { DEFAULT_TOKENS, isSafeTokenValue } from "../tokens";

// Operator 2026-10-25: body / heading / code fonts are picked from a fixed list. The API takes a font
// value only by exact match, since stacks carry quotes and commas the generic value check refuses.
describe("theme fonts", () => {
  it("every font token's default is one of its own choices", () => {
    for (const name of Object.keys(FONT_TOKENS)) expect(isSafeTokenValue(name, DEFAULT_TOKENS[name])).toBe(true);
  });

  it("each choice is accepted only on the token of its kind", () => {
    for (const c of FONT_CHOICES) {
      expect(isSafeTokenValue("--font-family-base", c.stack)).toBe(c.kind === "text");
      expect(isSafeTokenValue("--font-family-mono", c.stack)).toBe(c.kind === "mono");
    }
    expect(isSafeTokenValue("--font-family-heading", SAME_AS_BODY)).toBe(true);
    expect(isSafeTokenValue("--font-family-base", SAME_AS_BODY)).toBe(false);
  });

  it("anything off the list is refused, including injection attempts", () => {
    for (const v of [`"Comic Sans MS", cursive`, `x; } body { display:none`, `url(https://evil/x.woff)`, ""]) {
      expect(isSafeTokenValue("--font-family-base", v)).toBe(false);
    }
    expect(isSafeTokenValue("--accent", `"Inter", sans-serif`)).toBe(false);
  });

  it("only web fonts produce a stylesheet link, one family each", () => {
    const system = FONT_CHOICES.find((c) => c.id === "system")!.stack;
    const noto = FONT_CHOICES.find((c) => c.id === "noto-sans-tc")!.stack;
    expect(googleFontsHref([system, SAME_AS_BODY])).toBeNull();
    expect(googleFontsHref([noto, noto, system])).toBe("https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap");
  });
});
