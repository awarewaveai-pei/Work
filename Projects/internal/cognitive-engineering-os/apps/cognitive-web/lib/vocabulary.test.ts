import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toolLabel } from "./catalog";

// Two classes of words that must never reach a person's screen (walk 2026-10-12 W20, W16): the old word for a project, and a
// tool's id where its name belongs. Checked over every page source, so a new page cannot bring them back.
const ROOT = process.cwd();
const sources = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(path.join(ROOT, full)).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sources(full);
  return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
});
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const found = (pattern: RegExp) => ["app", "components", "lib"].flatMap(sources).flatMap((file) => code(readFileSync(path.join(ROOT, file), "utf8")).split("\n").flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim().slice(0, 90)}`] : [])));

describe("words a person reads", () => {
  it("the old word for a project is nowhere in what pages and messages say: a case is 案子, what 直接分析 left is 分析", () => {
    expect(found(/專案/)).toEqual([]);
  });

  it("a tool is never shown by its id: a name lookup that fails falls back to toolLabel, not to the id", () => {
    expect(found(/names\[[^\]]+\]\s*\?\?\s*[^"\s(]/)).toEqual([]);
    expect(found(/\?\? (id|methodId|[\w.]*method_id)\b/)).toEqual([]);
    expect(found(/[（(]\{(x|id|methodId|[\w.]*method_id)\}[）)]/)).toEqual([]);   // an id in brackets after a words-only label
  });

  it("toolLabel gives the name; an id the catalog lacks becomes a plain sentence; a package name stays as it is", () => {
    const names = { "framing.problem_statement": "問題陳述" };
    expect(toolLabel(names, "framing.problem_statement")).toBe("問題陳述");
    expect(toolLabel(names, "systems.iceberg_model")).toBe("（找不到名稱的工具）");
    expect(toolLabel(names, "learning.after_action_review")).toBe("（找不到名稱的工具）");
    expect(toolLabel({}, "自我理解")).toBe("自我理解");
    expect(toolLabel({}, "root_cause.five_whys")).not.toContain("five_whys");
  });
});
