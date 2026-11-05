import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_APPLIED_CHANNEL, THEME_CHANNEL, THEME_READY_CHANNEL, THEME_TOKEN_NAMES, readThemeTokens } from "../frame-theme";
import { ALL_TOKEN_GROUPS } from "../tokens";

const APP = path.resolve(__dirname, "../../..");

describe("app → embedded tool theme protocol (lib/theme/frame-theme.ts)", () => {
  it("the channel names are the video workbench's, and the vector-pro page takes them from here only", () => {
    expect([THEME_READY_CHANNEL, THEME_CHANNEL, THEME_APPLIED_CHANNEL]).toEqual(["awarewave:theme-ready", "awarewave:theme", "awarewave:theme-applied"]);
    const page = fs.readFileSync(path.join(APP, "app/(full)/tools/vector-pro/VectorProFrame.tsx"), "utf8");
    expect(page).toContain('from "@/lib/theme/frame-theme"');
    expect(page).not.toMatch(/["'`]awarewave:theme/);
  });

  it("the tokens sent are every theme editor token (lib/theme/tokens.ts ALL_TOKEN_GROUPS), each read from the computed style", () => {
    const all = ALL_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => t.name));
    expect([...THEME_TOKEN_NAMES]).toEqual(all);
    expect(THEME_TOKEN_NAMES).toContain("--accent-text");
    const sent = readThemeTokens({ getPropertyValue: (n: string) => ` v${n} ` });
    expect(Object.keys(sent)).toEqual(all);
    expect(sent["--body-bg"]).toBe("v--body-bg");
  });
});
