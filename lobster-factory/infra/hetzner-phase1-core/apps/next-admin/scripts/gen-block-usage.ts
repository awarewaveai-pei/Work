// Rewrites lib/systems/block-usage.generated.json from the code (npm run blocks:usage): who imports which block, 共用小工具,
// 待處理, cognitive method counts. GitHub runs it after every push to main (.github/workflows/block-usage-refresh.yml), so
// nobody has to; locally it is optional. Needs the repo root (registry).
import { readFileSync, writeFileSync } from "node:fs";
import { LEGO_BLOCKS } from "../lib/systems/blocks";
import { GENERATED, fsFacts, hasRepo, readRegistry, scanCatalog, scanImports, serialize, type CatalogScan } from "../lib/systems/block-usage";

async function main() {
  if (!hasRepo()) {
    console.error("gen-block-usage: agency-os/systems/registry.json not found -- run from the repo checkout, not the host copy");
    process.exit(2);
  }
  // content registry ids (ids built in loops included); operator RSS feeds come from env and belong to B-008 by design
  process.env.CONTENT_TRENDING_FEEDS = "";
  await import("../lib/content/blocks/register-all");
  await import("../lib/content/trending-sources");
  const { listAll } = await import("../lib/content/blocks/registry");
  const facts = fsFacts();
  facts.ids.push(...listAll().map((b) => b.id));
  const reg = readRegistry();
  const next = scanCatalog(LEGO_BLOCKS, reg, scanImports(reg), facts);

  const before = (() => { try { return JSON.parse(readFileSync(GENERATED, "utf8")) as Partial<CatalogScan>; } catch { return {}; } })();
  const was = before.usedBy ?? {};
  const changes = [...new Set([...Object.keys(was), ...Object.keys(next.usedBy)])].sort().flatMap((no) => {
    const a = new Set(was[no] ?? []), b = new Set(next.usedBy[no] ?? []);
    return [...[...b].filter((s) => !a.has(s)).map((s) => `+ ${no} ${s}`), ...[...a].filter((s) => !b.has(s)).map((s) => `- ${no} ${s}`)];
  });
  writeFileSync(GENERATED, serialize(next), "utf8");
  console.log(changes.length ? changes.join("\n") : "gen-block-usage: usedBy unchanged");
  if (next.pending.length) console.log(`待處理 ${next.pending.length}: ${next.pending.map((r) => `${r.kind} ${r.path}`).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
