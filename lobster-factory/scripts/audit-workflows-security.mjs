import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workRoot = resolve(import.meta.dirname, "..", "..");
const workflowsDir = resolve(workRoot, "lobster-factory", "packages", "workflows");
const reportsDir = resolve(workRoot, "agency-os", "reports", "security");

const run = spawnSync("npm audit --json", {
  cwd: workflowsDir,
  encoding: "utf8",
  shell: true,
});

// npm audit returns non-zero when vulnerabilities exist; still parse stdout.
const raw = `${run.stdout || ""}\n${run.stderr || ""}`.trim();
if (!raw) {
  throw new Error("npm audit returned empty output");
}

let audit;
try {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("no JSON object found in npm audit output");
  }
  audit = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
} catch (err) {
  throw new Error(`Unable to parse npm audit JSON: ${err.message}`);
}

const ts = new Date();
const stamp = ts.toISOString().replace(/[:]/g, "").replace(/\..+/, "").replace("T", "-");
mkdirSync(reportsDir, { recursive: true });

const counts = audit?.metadata?.vulnerabilities || {};
const vulns = audit?.vulnerabilities || {};

const lines = [];
lines.push("# Workflows npm audit report");
lines.push("");
lines.push(`- Generated UTC: ${ts.toISOString()}`);
lines.push(`- Path: \`lobster-factory/packages/workflows\``);
lines.push(`- Total: ${counts.total ?? 0}`);
lines.push(`- Critical: ${counts.critical ?? 0}`);
lines.push(`- High: ${counts.high ?? 0}`);
lines.push(`- Moderate: ${counts.moderate ?? 0}`);
lines.push(`- Low: ${counts.low ?? 0}`);
lines.push("");

lines.push("## Findings");
lines.push("");
if (Object.keys(vulns).length === 0) {
  lines.push("- No vulnerabilities reported.");
} else {
  for (const [name, details] of Object.entries(vulns)) {
    const via = Array.isArray(details.via)
      ? details.via
          .map((item) => (typeof item === "string" ? item : item?.source ? `${item.name} (${item.source})` : item?.name))
          .filter(Boolean)
          .join(", ")
      : "";
    lines.push(`- \`${name}\`: severity=\`${details.severity}\`, direct=\`${Boolean(details.isDirect)}\`, fixAvailable=\`${Boolean(details.fixAvailable)}\`${via ? `, via=${via}` : ""}`);
  }
}

// --- Stale-override detection -------------------------------------------------
// Root cause 2026-08-12: an `overrides` entry can stop protecting its package for
// two different reasons, and the weekly scan reported neither — it just showed the
// high count climbing (6 -> 10 in two weeks) with no explanation.
//   (a) the advisory range widened upstream until it swallowed the pinned floor
//       (e.g. fast-uri pinned "3.1.4" while the advisory grew to "3.0.0 - 3.1.4");
//   (b) the floor is a caret range that still ALLOWS a patched version, but the
//       lockfile keeps an older in-range resolution because `npm install` never
//       upgrades within range on its own.
// Either way the symptom is identical: package X has an override AND is still
// reported vulnerable. That is exactly what this section flags — and the fix for
// both causes is the same: raise the floor so the old resolution falls out of range.
const pkgPath = resolve(workflowsDir, "package.json");
let overrides = {};
try {
  overrides = JSON.parse(readFileSync(pkgPath, "utf8")).overrides || {};
} catch (err) {
  lines.push("");
  lines.push(`> WARN: could not read overrides from package.json: ${err.message}`);
}

const stale = [];
const uncovered = [];
for (const [name, details] of Object.entries(vulns)) {
  // Only packages with their OWN advisory matter; the rest are transitive echoes
  // that clear automatically once the real offender is bumped.
  const hasOwnAdvisory = Array.isArray(details.via) && details.via.some((item) => typeof item !== "string");
  if (!hasOwnAdvisory) continue;
  if (Object.prototype.hasOwnProperty.call(overrides, name)) {
    stale.push({ name, pinned: overrides[name], range: details.range });
  } else {
    uncovered.push({ name, range: details.range });
  }
}

lines.push("");
lines.push("## Override health");
lines.push("");
if (stale.length === 0 && uncovered.length === 0) {
  lines.push("- All overrides cover their advisories; nothing stale.");
} else {
  for (const s of stale) {
    lines.push(`- STALE OVERRIDE \`${s.name}\`: pinned \`${s.pinned}\` but advisory covers \`${s.range}\` — raise the floor above that range.`);
  }
  for (const u of uncovered) {
    lines.push(`- NOT OVERRIDDEN \`${u.name}\`: advisory covers \`${u.range}\` — add an override if upstream has not bumped it.`);
  }
}

lines.push("");
lines.push("## Remediation playbook");
lines.push("");
lines.push("1. Bump the direct deps first: `npm install @trigger.dev/sdk@<latest> @trigger.dev/build@<latest> trigger.dev@<latest> --save-exact` (keep all three in lockstep). Re-audit — some transitives clear natively.");
lines.push("2. For whatever remains, raise the `overrides` floor to a patched version **inside the same major** (`npm view <pkg> versions`). Same-major keeps the override semver-safe.");
lines.push("3. `npm install && npm audit` — target `high=0`. Then `npm test`.");
lines.push("4. Never take npm's `--force` suggestion here: it 'fixes' the tree by downgrading trigger.dev 4.x to 1.0.8, which destroys the SDK generation this package is built on.");
lines.push("5. Repo-only fixes do not protect production — the workflows must be redeployed to the EU Trigger.dev instance for the new tree to take effect.");

const content = `${lines.join("\n")}\n`;
const reportPath = resolve(reportsDir, `workflows-npm-audit-${stamp}.md`);
const latestPath = resolve(reportsDir, "workflows-npm-audit-LATEST.md");
writeFileSync(reportPath, content, "utf8");
writeFileSync(latestPath, content, "utf8");

console.log(`Wrote: ${reportPath}`);
console.log(`Wrote: ${latestPath}`);
