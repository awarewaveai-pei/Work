// P6 L4: node scripts/migrate-media-to-r2.cjs --data <org data dir> --org <uuid> [--dry-run] [--undo <report.json>]
// Run with the server stopped (it owns state.json). Needs VW_INTERNAL_BASE + VW_INTERNAL_TOKEN unless --dry-run/--undo.
const path = require("node:path");
const root = path.join(__dirname, "..");
const { vwEnv } = require("../backend/env-compat.cjs");
const { migrate, undo } = require("../backend/migrate-media.cjs");

const args = process.argv.slice(2), flag = (n) => args.includes("--" + n), value = (n) => args[args.indexOf("--" + n) + 1];
(async () => {
  const data = flag("data") && path.resolve(value("data"));
  if (!data) throw Error("usage: --data <org data dir> --org <uuid> [--dry-run] [--undo <report.json>]");
  if (flag("undo")) {
    const { assetIds } = undo({ data, report: path.resolve(value("undo")) });
    console.log("local state reverted. Ledger rows are NOT deleted; remove these media_assets ids by SQL if wanted:");
    for (const a of assetIds) console.log(`${a.assetId}  ${a.status}  ${a.url}`);
    return;
  }
  const env = { VW_INTERNAL_BASE: vwEnv(process.env, "INTERNAL_BASE"), VW_INTERNAL_TOKEN: vwEnv(process.env, "INTERNAL_TOKEN") };
  const report = await migrate({
    data, org: flag("org") && value("org"), dryRun: flag("dry-run"), env, fetchImpl: fetch,
    appDir: require("../backend/appearance.cjs").resolveSource(root, process.env), log: (l) => console.log(l),
  });
  console.log(JSON.stringify(report.counts));
  if (report.reportFile) console.log("report: " + report.reportFile);
  if (report.abortReason) { console.error("state.json NOT updated: " + report.abortReason + " (report written; ids are in the ledger)"); process.exitCode = 1; }
  if (report.counts.error) process.exitCode = 1;
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
