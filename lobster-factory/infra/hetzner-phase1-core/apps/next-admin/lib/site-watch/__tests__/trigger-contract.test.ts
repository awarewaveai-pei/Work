// The Trigger task (packages/workflows/src/trigger/site-watch.ts) turns run status
// "renderer_unavailable" into a failed, Sentry-reported run — the one place a renderer outage is loud
// at the moment it happens. It matches a string mirrored from runner.ts across a package boundary no
// compiler sees, so a rename on either side would make every renderer outage silent there.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const NEXT_ADMIN = path.resolve(__dirname, "../../..");
const WORKFLOWS = path.resolve(NEXT_ADMIN, "../../../../packages/workflows");

function unionLiterals(file: string, typeName: string): string[] {
  const src = readFileSync(file, "utf8");
  const m = new RegExp(`export type ${typeName} =([^;]+);`).exec(src);
  expect(m, `${typeName} not found in ${file}`).toBeTruthy();
  return [...m![1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
}

describe("site-watch run status contract (next-admin runner ↔ Trigger task)", () => {
  it("the Trigger side mirrors exactly the statuses the runner can return", () => {
    const runner = unionLiterals(path.join(NEXT_ADMIN, "lib/site-watch/runner.ts"), "RunStatus");
    const mirrored = unionLiterals(path.join(WORKFLOWS, "src/lib/siteWatch/post.ts"), "SiteWatchRunStatus");
    expect(runner).toContain("renderer_unavailable");
    expect(mirrored).toEqual(runner);
  });

  it("the task still fails the run on renderer_unavailable", () => {
    const task = readFileSync(path.join(WORKFLOWS, "src/trigger/site-watch.ts"), "utf8");
    expect(task).toMatch(/status === "renderer_unavailable"\)\s*\{\s*throw /);
  });
});
