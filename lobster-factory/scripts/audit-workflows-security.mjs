import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workRoot = resolve(import.meta.dirname, "..", "..");
const workflowsDir = resolve(workRoot, "lobster-factory", "packages", "workflows");
const reportsDir = resolve(workRoot, "agency-os", "reports", "security");

function runAudit(extraArgs) {
  const run = spawnSync(`npm audit --json${extraArgs ? ` ${extraArgs}` : ""}`, {
    cwd: workflowsDir,
    encoding: "utf8",
    shell: true,
  });
  // npm audit returns non-zero when vulnerabilities exist; still parse stdout.
  const raw = `${run.stdout || ""}\n${run.stderr || ""}`.trim();
  if (!raw) {
    throw new Error(`npm audit${extraArgs ? ` ${extraArgs}` : ""} returned empty output`);
  }
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error("no JSON object found in npm audit output");
    }
    return JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    throw new Error(`Unable to parse npm audit JSON: ${err.message}`);
  }
}

// TWO audits, because "is it vulnerable" and "does it reach production" are different
// questions, and conflating them is what made this gate permanently red. The shipped set is
// judged unconditionally; the toolchain-only set is judged against dated acknowledgements.
const audit = runAudit("");
const shipped = runAudit("--omit=dev");

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

// --- Exposure split + dated acknowledgements ----------------------------------
// The gate this feeds used to be a single `npm audit --audit-level=high` over dev AND prod.
// On 2026-08-25 that gate had been red for ten weeks on a finding with ZERO production reach
// and no upstream remediation, so it could never go green - and a gate that can never go
// green stops being read. (The same week, a different permanently-red workflow is exactly how
// the fifth ClickHouse incident got its window.) The split below keeps the shipped set
// unconditional and makes the toolchain set answerable.
const shippedCounts = shipped?.metadata?.vulnerabilities || {};
const shippedHigh = (shippedCounts.high ?? 0) + (shippedCounts.critical ?? 0);

// Own-advisory entries only: transitive echoes clear when the real offender is bumped.
const ownAdvisories = [];
for (const [name, details] of Object.entries(vulns)) {
  for (const item of Array.isArray(details.via) ? details.via : []) {
    if (typeof item === "string" || !item?.source) continue;
    if (!["high", "critical"].includes(String(item.severity || details.severity))) continue;
    ownAdvisories.push({
      id: item.source,
      ghsa: (item.url || "").split("/").pop() || "",
      package: name,
      range: item.range || details.range || "",
      severity: String(item.severity || details.severity),
      url: item.url || "",
    });
  }
}

const ackPath = resolve(workflowsDir, "security-acknowledgements.json");
let acknowledgements = [];
let ackReadError = "";
try {
  acknowledgements = JSON.parse(readFileSync(ackPath, "utf8")).advisories || [];
} catch (err) {
  // A missing or unparseable acknowledgement file must NOT read as "nothing acknowledged and
  // therefore fine" - it means policy is unknown, so every finding stays unacknowledged.
  ackReadError = err.message;
}
const ackById = new Map(acknowledgements.map((a) => [String(a.id), a]));

const today = ts.toISOString().slice(0, 10);
const unacknowledged = [];
const expired = [];
const accepted = [];
for (const adv of ownAdvisories) {
  const ack = ackById.get(String(adv.id));
  if (!ack) { unacknowledged.push(adv); continue; }
  if (!ack.reviewBy || ack.reviewBy < today) {
    expired.push({ ...adv, reviewBy: ack.reviewBy || "(none)" });
  } else {
    accepted.push({ ...adv, reviewBy: ack.reviewBy });
  }
}

// An acknowledgement can only ever excuse something with no production reach. If the shipped
// audit is non-zero the gate fails regardless of what this file says.
const verdict = shippedHigh > 0
  ? "shipped"
  : (unacknowledged.length > 0 || expired.length > 0 || ackReadError ? "toolchain" : "pass");

lines.push("");
lines.push("## Exposure split");
lines.push("");
lines.push(`- Shipped dependencies (\`npm audit --omit=dev\`) high+critical: **${shippedHigh}**`);
lines.push(`- Toolchain-only high/critical advisories: **${ownAdvisories.length - (shippedHigh > 0 ? 0 : 0)}** (${ownAdvisories.map((a) => a.package).join(", ") || "none"})`);
if (ackReadError) {
  lines.push(`- WARN: security-acknowledgements.json unreadable (${ackReadError}) - treating every finding as unacknowledged.`);
}
if (accepted.length > 0) {
  lines.push("");
  lines.push("Accepted (dated, expiring - not silenced):");
  for (const a of accepted) {
    lines.push(`- \`${a.package}\` ${a.ghsa} - accepted until **${a.reviewBy}**, then it fails this gate again.`);
  }
}
if (expired.length > 0) {
  lines.push("");
  for (const a of expired) {
    lines.push(`- EXPIRED ACCEPTANCE \`${a.package}\` ${a.ghsa}: reviewBy ${a.reviewBy} has passed - re-evaluate or extend deliberately.`);
  }
}
if (unacknowledged.length > 0) {
  lines.push("");
  for (const a of unacknowledged) {
    lines.push(`- UNACKNOWLEDGED \`${a.package}\` ${a.ghsa} (advisory ${a.id}, range \`${a.range}\`): fix it, or record a dated acceptance in security-acknowledgements.json.`);
  }
}
lines.push("");
lines.push(`- Gate verdict: **${verdict}** (shipped = hard fail; toolchain = unacknowledged or expired; pass = nothing outstanding)`);

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
