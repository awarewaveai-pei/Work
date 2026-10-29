// A failed AI call must reach the screen: a forge() call whose catch is empty left the form back with no message (F7).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "ScriptForge.tsx"), "utf8");

describe("ScriptForge modules", () => {
  it("no try around a forge() call ends in an empty catch", () => {
    const silent = src.split("\n").filter((l) => /await forge\(/.test(l) && /catch\s*\{\s*\}/.test(l));
    expect(silent).toEqual([]);
    expect(src).not.toMatch(/await forge\([^\n]*\}\s*catch\s*\{\s*\}\s*setLoading/);
  });

  it("every module that shows the failure renders it from an err state", () => {
    expect((src.match(/catch\(e\)\{set(?:Rep)?Err\(errText\(e\)\)/g) ?? []).length).toBeGreaterThanOrEqual(17);
    expect(src).toContain("<ErrBox e={err}/>");
  });
});
