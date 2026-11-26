// Rewrites lib/systems/block-usage.generated.json from the real "@/" imports (run: npm run blocks:usage). blocks.ts merges it
// into every block's usedBy, so a system that starts importing a block needs no hand edit. Needs the repo root (registry).
import { readFileSync, writeFileSync } from "node:fs";
import { LEGO_BLOCKS } from "../lib/systems/blocks";
import { GENERATED, derivedUsedBy, hasRepo, readRegistry, scanImports, serialize } from "../lib/systems/block-usage";

if (!hasRepo()) {
  console.error("gen-block-usage: agency-os/systems/registry.json not found -- run from the repo checkout, not the host copy");
  process.exit(2);
}
const next = derivedUsedBy(LEGO_BLOCKS, scanImports(readRegistry()));
const before = (() => { try { return JSON.parse(readFileSync(GENERATED, "utf8")) as Record<string, string[]>; } catch { return {}; } })();
const changes = [...new Set([...Object.keys(before), ...Object.keys(next)])].sort().flatMap((no) => {
  const a = new Set(before[no] ?? []), b = new Set(next[no] ?? []);
  return [...[...b].filter((s) => !a.has(s)).map((s) => `+ ${no} ${s}`), ...[...a].filter((s) => !b.has(s)).map((s) => `- ${no} ${s}`)];
});
writeFileSync(GENERATED, serialize(next), "utf8");
console.log(changes.length ? changes.join("\n") : "gen-block-usage: no change");
