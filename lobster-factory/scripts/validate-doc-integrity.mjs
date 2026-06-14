/**
 * Doc integrity gate (invoked from agency-os system-health-check + lobster bootstrap).
 *
 * Flags:
 *   --strict-duplicates          Fail when the same long powershell/node command line appears in 2+ markdown files.
 *   --strict-canonical-dupes     Fail when charter-grade SSOT filenames appear outside approved doc trees (see scan).
 *   --skip-agency-canonical      Skip agency-os EXECUTION_DASHBOARD canonical assert (or LOBSTER_SKIP_AGENCY_CANONICAL=1).
 *   --workRoot=<abs path>        Monorepo root (parent of lobster-factory/). Default: parent of this script dir.
 */
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
      // RankMath-KB = third-party RankMath knowledge-base articles imported HTML→MD (2026-06-14).
      // GEO = externally-imported SEO/GEO reference guides (LLMrefs/Ayzeo/Semrush/Profound/Google,
      // 2026-06-15). Both hold scrape artifacts (site-relative paths like /search/docs/...,
      // bare domains, in-page anchor words) that we neither author nor maintain → exclude from
      // link integrity.
      if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist" || ent.name === "RankMath-KB" || ent.name === "GEO") continue;
      walkMarkdownFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;

/** Repo-relative markdown paths that commonly fork (Single Owner / charter §4.3). Warn-only unless --strict-canonical-dupes */
const canonicalDupPatterns = [
  { label: "30_YEAR_AI_CODING_EXEC_CHARTER", re: /30_YEAR_AI_CODING_EXEC_CHARTER\.md/i },
  { label: "REMOTE_WORKSTATION_STARTUP", re: /REMOTE_WORKSTATION_STARTUP\.md/i },
  { label: "LONG_TERM_OPERATING_DISCIPLINE", re: /LONG_TERM_OPERATING_DISCIPLINE\.md/i },
];

/**
 * Blank fenced code blocks and inline code spans so [text](href) inside them
 * are not treated as real links. CommonMark: code surfaces suppress link parsing.
 */
function stripCodeSurfaces(md) {
  // Pass 1: fenced code blocks (``` or ~~~) — state machine handles unterminated fences.
  const lines = md.split("\n");
  let inFence = false, fenceMark = "", fenceMin = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!inFence) {
      const m = lines[i].match(/^(`{3,}|~{3,})/);
      if (m) { inFence = true; fenceMark = m[1][0]; fenceMin = m[1].length; lines[i] = ""; }
    } else {
      const c = lines[i].match(/^(`{3,}|~{3,})\s*$/);
      if (c && c[1][0] === fenceMark && c[1].length >= fenceMin) inFence = false;
      lines[i] = "";
    }
  }
  // Pass 2: inline code spans — single-line, single or multi backtick.
  return lines.join("\n").replace(/`+[^`\n]*`+/g, "");
}

function extractLinks(mdContent) {
  const stripped = stripCodeSurfaces(mdContent);
  const links = [];
  let m;
  while ((m = linkRe.exec(stripped)) !== null) {
    links.push(m[2].trim());
  }
  return links;
}

// A non-file URI scheme: 2+ char scheme name + ":" (data:, mailto:, tel:, ftp:, http(s): …).
// Requires ≥2 chars so a Windows drive-letter path ("C:\...") is NOT mistaken for a scheme.
// data: URIs (inline SVG placeholders in imported KB articles) were being resolved as relative
// file paths → spurious broken_link failures (RankMath KB import, 2026-06-14).
const URI_SCHEME = /^[a-z][a-z0-9+.-]+:/i;

function resolveLink(fromFile, href) {
  const noAnchor = href.split("#")[0].trim();
  if (!noAnchor || URI_SCHEME.test(noAnchor)) {
    return null;
  }
  if (noAnchor.startsWith("//")) return null;
  const base = path.dirname(fromFile);
  return path.normalize(path.join(base, noAnchor));
}

const broken = [];
const scannedRoots = [];

function scanMarkdownFile(absFile) {
  if (!fs.existsSync(absFile) || !absFile.endsWith(".md")) return;
  const content = fs.readFileSync(absFile, "utf8");
  for (const href of extractLinks(content)) {
    const target = resolveLink(absFile, href);
    if (!target) continue;
    if (!fs.existsSync(target)) {
      broken.push({
        type: "broken_link",
        from: path.relative(workRoot, absFile),
        href,
        resolved: path.relative(workRoot, target),
      });
    }
  }
}

function scanRoot(label, absRoot) {
  if (!fs.existsSync(absRoot)) {
    return;
  }
  scannedRoots.push(label);
  const files = walkMarkdownFiles(absRoot);
  for (const file of files) {
    scanMarkdownFile(file);
  }
}

/** Catch disk-corruption / aborted writes (e.g. 0-byte README). */
function assertNonEmptyMarkdownTrees() {
  const rootReadme = path.join(workRoot, "README.md");
  if (fs.existsSync(rootReadme)) {
    const raw = fs.readFileSync(rootReadme, "utf8");
    if (raw.trim().length === 0) {
      broken.push({
        type: "empty_md",
        detail: path.relative(workRoot, rootReadme),
        reason: "empty_or_whitespace_only",
      });
    }
  }

  const dirs = [
    path.join(workRoot, "agency-os", "docs"),
    path.join(workRoot, "agency-os", "tenants"),
    path.join(lobsterRoot, "docs"),
    path.join(lobsterRoot, "infra", "trigger"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = walkMarkdownFiles(dir);
    for (const file of files) {
      let raw;
      try {
        raw = fs.readFileSync(file, "utf8");
      } catch {
        broken.push({
          type: "empty_md",
          detail: path.relative(workRoot, file),
          reason: "unreadable",
        });
        continue;
      }
      if (raw.trim().length === 0) {
        broken.push({
          type: "empty_md",
          detail: path.relative(workRoot, file),
          reason: "empty_or_whitespace_only",
        });
      }
    }
  }

  const agencyOs = path.join(workRoot, "agency-os");
  if (fs.existsSync(agencyOs)) {
    const topMd = fs
      .readdirSync(agencyOs, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => path.join(agencyOs, e.name));
    for (const file of topMd) {
      const raw = fs.readFileSync(file, "utf8");
      if (raw.trim().length === 0) {
        broken.push({
          type: "empty_md",
          detail: path.relative(workRoot, file),
          reason: "empty_or_whitespace_only",
        });
      }
    }
  }
}

/** Detect parallel copies of charter-grade SSOT filenames outside approved pockets (warn vs strict). */
function findCanonicalFilenameDuplicates() {
  const approvedPrefixes = [
    path.join(workRoot, "agency-os", "docs"),
    path.join(workRoot, "agency-os", "memory"),
    path.join(lobsterRoot, "docs"),
    path.join(workRoot, "docs"),
  ]
    .filter((p) => fs.existsSync(p))
    .map((p) => path.resolve(p) + path.sep);
  const hits = new Map();
  const roots = [workRoot].filter((r) => fs.existsSync(r));

  function visit(dir, depth, maxDepth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (
          ent.name === "node_modules" ||
          ent.name === ".git" ||
          ent.name === "dist" ||
          ent.name === ".next" ||
          ent.name === "coverage"
        ) {
          continue;
        }
        visit(full, depth + 1, maxDepth);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        for (const { label, re } of canonicalDupPatterns) {
          if (!re.test(ent.name)) continue;
          const rel = path.relative(workRoot, full);
          const resolvedFull = path.resolve(full);
          const ok = approvedPrefixes.some((pre) => resolvedFull.startsWith(pre));
          if (!ok) {
            if (!hits.has(label)) hits.set(label, []);
            hits.get(label).push(rel);
          }
        }
      }
    }
  }

  for (const r of roots) {
    visit(r, 0, 14);
  }
  return hits;
}

const strictCanonicalDupes = process.argv.includes("--strict-canonical-dupes");

/** Canonical files that must exist (lobster-factory + cross-links) */
function assertCanonical() {
  const required = [
    path.join(lobsterRoot, "README.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_CHECKLIST.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_MASTER_DEPLOYMENT_SYSTEM_v1.3.md"),
    path.join(lobsterRoot, "docs", "LOBSTER_FACTORY_DEPLOYMENT_CHECKLIST_v1.4.md"),
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
assertNonEmptyMarkdownTrees();

scanRoot("lobster-factory", lobsterRoot);
scanRoot("agency-os/docs", path.join(workRoot, "agency-os", "docs"));
scanRoot("agency-os/memory", path.join(workRoot, "agency-os", "memory"));
const tenantsMd = path.join(workRoot, "agency-os", "tenants");
if (fs.existsSync(tenantsMd)) {
  scanRoot("agency-os/tenants", tenantsMd);
}

const agencyOsTop = path.join(workRoot, "agency-os");
if (fs.existsSync(agencyOsTop)) {
  scannedRoots.push("agency-os/*.md (top-level)");
  for (const ent of fs.readdirSync(agencyOsTop, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith(".md")) {
      scanMarkdownFile(path.join(agencyOsTop, ent.name));
    }
  }
}

const specRaw = path.join(workRoot, "docs", "spec", "raw");
if (fs.existsSync(specRaw)) {
  scanRoot("docs/spec/raw", specRaw);
}

const canonicalDupHits = findCanonicalFilenameDuplicates();
let canonicalDupIssue = false;
if (canonicalDupHits.size > 0) {
  console.log("\n--- Canonical-looking SSOT filenames outside approved doc trees (charter §4.3) ---");
  for (const [label, paths] of canonicalDupHits) {
    if (!paths || paths.length === 0) continue;
    canonicalDupIssue = true;
    console.log(`${label}:`);
    for (const p of paths) console.log(`  - ${p}`);
  }
  if (strictCanonicalDupes) {
    console.error("strict-canonical-dupes: failing due to duplicate SSOT filename pockets");
    process.exitCode = 1;
  }
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
    } else if (b.type === "empty_md") {
      console.error(`  empty_md: ${b.detail} (${b.reason})`);
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
  if (canonicalDupIssue && !strictCanonicalDupes) {
    console.log(
      "Note: canonical SSOT filename pockets detected outside approved trees (warnings only; use --strict-canonical-dupes to fail)"
    );
  }
}

process.exit(process.exitCode || 0);
