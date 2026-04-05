import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const lobsterRoot = path.resolve(__dirname, "..");

function getArg(name, fallback) {
  const p = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(p));
  if (!hit) return fallback;
  return hit.slice(p.length);
}

/** Parent of lobster-factory = D:\Work when layout is Work/lobster-factory */
const workRoot = path.resolve(
  getArg("workRoot", path.resolve(lobsterRoot, ".."))
);

const strictDuplicates = process.argv.includes("--strict-duplicates");
const skipAgencyCanonical =
  process.env.LOBSTER_SKIP_AGENCY_CANONICAL === "1" ||
  process.argv.includes("--skip-agency-canonical");

function walkMarkdownFiles(rootDir, out = []) {
  if (!fs.existsSync(rootDir)) return out;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
      walkMarkdownFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;

function extractLinks(mdContent) {
  const links = [];
  let m;
  while ((m = linkRe.exec(mdContent)) !== null) {
    links.push(m[2].trim());
  }
  return links;
}

function resolveLink(fromFile, href) {
  const noAnchor = href.split("#")[0].trim();
  if (!noAnchor || noAnchor.startsWith("http://") || noAnchor.startsWith("https://") || noAnchor.startsWith("mailto:")) {
    return null;
  }
  if (noAnchor.startsWith("//")) return null;
  const base = path.dirname(fromFile);
  return path.normalize(path.join(base, noAnchor));
}

const broken = [];
const scannedRoots = [];

function scanRoot(label, absRoot) {
  if (!fs.existsSync(absRoot)) {
    return;
  }
  scannedRoots.push(label);
  const files = walkMarkdownFiles(absRoot);
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const href of extractLinks(content)) {
      const target = resolveLink(file, href);
      if (!target) continue;
      if (!fs.existsSync(target)) {
        broken.push({
          type: "broken_link",
          from: path.relative(workRoot, file),
          href,
          resolved: path.relative(workRoot, target),
        });
      }
    }
  }
}

/** Canonical files that must exist (lobster-factory + cross-links) */
function assertCanonical() {
  const required = [
    path.join(lobsterRoot, "README.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_MASTER_CHECKLIST.md"),
    path.join(lobsterRoot, "docs", "C1_EXECUTION_RUNBOOK.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_COMPLETION_PLAN_V2.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md"),
    path.join(lobsterRoot, "docs", "V3_GOVERNANCE_GATES.md"),
    path.join(lobsterRoot, "docs", "ROUTING_MATRIX.md"),
    path.join(lobsterRoot, "docs", "e2e", "OPERABLE_E2E_PLAYBOOK.md"),
    path.join(lobsterRoot, "docs", "operations", "ARTIFACTS_LIFECYCLE_POLICY.md"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      broken.push({
        type: "missing_canonical",
        detail: path.relative(workRoot, p),
      });
    }
  }
  if (!skipAgencyCanonical) {
    const agencyDashboard = path.join(workRoot, "agency-os", "docs", "overview", "EXECUTION_DASHBOARD.md");
    if (!fs.existsSync(agencyDashboard)) {
      broken.push({
        type: "missing_canonical",
        detail: path.relative(workRoot, agencyDashboard),
      });
    }
  }
}

/** Long command lines duplicated across many files (潔癖提示) */
function findDuplicateCommandLines() {
  const commandLike = /^\s*(node\s+|powershell\s+)/i;
  const minLen = 72;
  const map = new Map();
  const roots = [
    path.join(lobsterRoot, "docs"),
    path.join(lobsterRoot),
    path.join(workRoot, "agency-os", "memory"),
    path.join(workRoot, "agency-os", "docs", "overview"),
  ];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const files = walkMarkdownFiles(r);
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (t.length < minLen || !commandLike.test(t)) continue;
        const norm = t.replace(/\s+/g, " ");
        if (!map.has(norm)) map.set(norm, []);
        map.get(norm).push(path.relative(workRoot, file));
      }
    }
  }
  const dups = [];
  for (const [line, files] of map) {
    const uniq = [...new Set(files)];
    if (uniq.length >= 2) {
      dups.push({ line: line.slice(0, 200), files: uniq });
    }
  }
  return dups.sort((a, b) => b.files.length - a.files.length).slice(0, 30);
}

assertCanonical();

scanRoot("lobster-factory", lobsterRoot);
scanRoot("agency-os/docs", path.join(workRoot, "agency-os", "docs"));
scanRoot("agency-os/memory", path.join(workRoot, "agency-os", "memory"));
const specRaw = path.join(workRoot, "docs", "spec", "raw");
if (fs.existsSync(specRaw)) {
  scanRoot("docs/spec/raw", specRaw);
}

const dups = findDuplicateCommandLines();

if (dups.length > 0) {
  console.log("\n--- Duplicate long command lines (consider linking to runbook instead) ---");
  for (const d of dups.slice(0, 15)) {
    console.log(`Files: ${d.files.join(", ")}`);
    console.log(`  ${d.line}${d.line.length >= 200 ? "..." : ""}\n`);
  }
  if (strictDuplicates) {
    console.error("strict-duplicates: failing due to duplicate command blocks");
    process.exitCode = 1;
  }
}

if (broken.length > 0) {
  console.error("Doc integrity failures:");
  for (const b of broken) {
    if (b.type === "broken_link") {
      console.error(`  broken_link: ${b.from} -> ${b.href} (resolved: ${b.resolved})`);
    } else {
      console.error(`  ${b.type}: ${b.detail || JSON.stringify(b)}`);
    }
  }
  process.exitCode = 1;
} else {
  console.log(
    `Doc integrity PASSED (workRoot=${workRoot}, scanned: ${scannedRoots.join(", ")})`
  );
  if (dups.length > 0 && !strictDuplicates) {
    console.log(`Note: ${dups.length} duplicate command patterns (warnings only; use --strict-duplicates to fail)`);
  }
}

process.exit(process.exitCode || 0);
