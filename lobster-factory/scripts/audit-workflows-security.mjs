import { mkdirSync, writeFileSync } from "node:fs";
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

lines.push("");
lines.push("## Decision template");
lines.push("");
lines.push("- Upgrade available now? (yes/no)");
lines.push("- If no: acceptable risk window (date range)");
lines.push("- Next review trigger (new upstream version / weekly AO-RESUME check)");

const content = `${lines.join("\n")}\n`;
const reportPath = resolve(reportsDir, `workflows-npm-audit-${stamp}.md`);
const latestPath = resolve(reportsDir, "workflows-npm-audit-LATEST.md");
writeFileSync(reportPath, content, "utf8");
writeFileSync(latestPath, content, "utf8");

console.log(`Wrote: ${reportPath}`);
console.log(`Wrote: ${latestPath}`);
