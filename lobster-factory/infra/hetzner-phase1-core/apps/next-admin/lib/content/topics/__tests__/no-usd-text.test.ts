// N3: every amount a person reads on the auto-content and schedule pages is NT$ (operator rule). A user-visible string in
// these files that says 美元 or US$ fails here, so it cannot grow back. Comments are not user-visible and are skipped.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(__dirname, "../../../..");
const SCANNED = ["app/(shell)/tools/content/topics", "app/video/(wb)/schedule", "app/(shell)/ops/schedules", "lib/schedules/jobs.ts", "lib/schedules/view.ts"];

function filesOf(rel: string): string[] {
  const abs = path.join(APP, rel);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__") && !/\.test\.tsx?$/.test(f))
    .map((f) => path.join(abs, f));
}

describe("no dollar text on the auto-content and schedule pages", () => {
  it("scans the pages' source (not an empty list)", () => {
    expect(SCANNED.flatMap(filesOf).length).toBeGreaterThan(5);
  });

  it("no user-visible 美元 or US$", () => {
    const hits = SCANNED.flatMap(filesOf).flatMap((f) =>
      fs.readFileSync(f, "utf8").split("\n").flatMap((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return [];
        return /美元|US\$/.test(line) ? [`${path.relative(APP, f).split(path.sep).join("/")}:${i + 1}`] : [];
      }));
    expect(hits).toEqual([]);
  });
});
