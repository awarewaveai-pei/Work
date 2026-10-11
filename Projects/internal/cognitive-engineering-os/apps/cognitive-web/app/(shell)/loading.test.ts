import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// B8: a link pressed anywhere shows 載入中 at once. Next shows the loading.tsx of the segment whose child changes, so a
// folder with subfolders and no loading.tsx is a place where a click shows nothing until the next page arrives.
const SHELL = join(__dirname);
const folders = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name));

describe("every (shell) segment with children has a loading state", () => {
  it("has loading.tsx in each folder that holds other routes", () => {
    const missing: string[] = [];
    const walk = (dir: string) => {
      const children = folders(dir);
      if (children.length && !existsSync(join(dir, "loading.tsx"))) missing.push(dir.slice(SHELL.length) || "(shell)");
      children.forEach(walk);
    };
    walk(SHELL);
    expect(missing).toEqual([]);
  });
});
