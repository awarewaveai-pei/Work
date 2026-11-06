import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// A paid call's Hold.settle must go through lib/ai/log-ai-call.ts (logImageCost / logToolCost) so its spend lands in
// ai_call_logs and shows on /ops/costs. A direct hold.settle(...) charges the wallet and leaves no cost row.
const ROOT = join(__dirname, "..", "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "entitlements"]);
const ALLOWED = new Set(["lib/ai/log-ai-call.ts"]);

function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); continue; }
    if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

describe("settle goes through the cost ledger", () => {
  it("no .settle( call outside log-ai-call.ts and lib/entitlements", () => {
    const hits = [...walk(join(ROOT, "app"), []), ...walk(join(ROOT, "lib"), [])]
      .map((f) => relative(ROOT, f).split(sep).join("/"))
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) => readFileSync(join(ROOT, f), "utf8").split("\n")
        .map((line, i) => (/\.settle\(/.test(line) && !/^\s*(\/\/|\*)/.test(line) ? `${f}:${i + 1}` : ""))
        .filter(Boolean));
    expect(hits).toEqual([]);
  });
});
