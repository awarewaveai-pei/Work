/**
 * Doc integrity gate (invoked from agency-os system-health-check + lobster bootstrap; --commit mode from
 * the post-commit hook rule mcp/claude-userlevel/hooks/rules/doc-link-commit-check.js).
 *
 * Flags:
 *   --strict-duplicates          Fail when the same long powershell/node command line appears in 2+ markdown files.
 *   --strict-canonical-dupes     Fail when charter-grade SSOT filenames appear outside approved doc trees (see scan).
 *   --skip-agency-canonical      Skip agency-os EXECUTION_DASHBOARD canonical assert (or LOBSTER_SKIP_AGENCY_CANONICAL=1).
 *   --workRoot=<abs path>        Monorepo root (parent of lobster-factory/). Default: parent of this script dir.
 *   --commit=<rev>               Only the links <rev> is responsible for (see runCommitMode); skips every other check.
 *   --json                       With --commit: print one JSON report on stdout (the hook's protocol).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

// RankMath-KB = third-party RankMath knowledge-base articles imported HTML→MD (2026-06-14).
// GEO = externally-imported SEO/GEO reference guides (LLMrefs/Ayzeo/Semrush/Profound/Google,
// 2026-06-15). Both hold scrape artifacts (site-relative paths like /search/docs/...,
// bare domains, in-page anchor words) that we neither author nor maintain → exclude from
// link integrity.
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "RankMath-KB", "GEO"]);

function walkMarkdownFiles(rootDir, out = []) {
  if (!fs.existsSync(rootDir)) return out;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkMarkdownFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

// CommonMark allows balanced parens in link URLs (e.g. Next.js route groups like (shell)).
// The inner group matches: non-paren chars OR a balanced (inner) pair — one level deep.
const linkRe = /\[([^\]]*)\]\(((?:[^()]*|\([^()]*\))*)\)/g;

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
  // Only treat as a file reference if it LOOKS like a path: has a separator OR a
  // file extension. Prose accidentally wrapped in ASCII parens after a bracket —
  // e.g. "[驗證結果](R0 四動作)" — is NOT a file link and must not be resolved as
  // a relative path (recurring false-positive broken_link, 2026-06-26).
  // CJK-named files (e.g. "...維護手冊.md") still match via the extension test.
  const looksLikePath = noAnchor.includes("/") || /\.[a-zA-Z0-9]{1,8}$/.test(noAnchor);
  if (!looksLikePath) return null;
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

/**
 * The markdown the link check covers. ONE list for both modes: the full scan walks it, --commit
 * filters a commit's paths through inLinkScope(). A second list would let the commit check and the
 * CI/health gate disagree about which files count.
 */
const LINK_SCAN_ROOTS = [
  { label: "lobster-factory", dir: lobsterRoot, recursive: true },
  { label: "agency-os/docs", dir: path.join(workRoot, "agency-os", "docs"), recursive: true },
  { label: "agency-os/memory", dir: path.join(workRoot, "agency-os", "memory"), recursive: true },
  { label: "agency-os/tenants", dir: path.join(workRoot, "agency-os", "tenants"), recursive: true },
  { label: "agency-os/*.md (top-level)", dir: path.join(workRoot, "agency-os"), recursive: false },
  { label: "docs/spec/raw", dir: path.join(workRoot, "docs", "spec", "raw"), recursive: true },
];

function rootMarkdownFiles(root) {
  if (root.recursive) return walkMarkdownFiles(root.dir);
  return fs
    .readdirSync(root.dir, { withFileTypes: true })
    .filter((ent) => ent.isFile() && ent.name.endsWith(".md"))
    .map((ent) => path.join(root.dir, ent.name));
}

/** True when the full scan would read absFile (same roots, same SKIP_DIRS). */
function inLinkScope(absFile) {
  if (!absFile.endsWith(".md")) return false;
  for (const root of LINK_SCAN_ROOTS) {
    const rel = path.relative(root.dir, absFile);
    if (!rel || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) continue;
    const dirs = rel.split(path.sep).slice(0, -1);
    if (root.recursive ? !dirs.some((d) => SKIP_DIRS.has(d)) : dirs.length === 0) return true;
  }
  return false;
}

/**
 * --commit=<rev>: the links one commit is responsible for, judged against that commit's own tree,
 * not the disk. The answer is a pure function of the commit and matches a CI checkout
 * (case-sensitive; untracked files do not count), which the Windows disk check does not.
 *   outgoing: every link in an in-scope .md the commit adds or modifies (touch a file, own its links)
 *   incoming: links from any in-scope .md to a path the commit deleted or moved away
 *             (--no-renames reports a move as D + A, so the old path lands in `removed`)
 * Merges (-c): only paths that differ from every parent, i.e. conflict resolutions and both-sides
 * auto-merges. A file taken whole from one side was judged at its own commit.
 */
function runCommitMode(rev) {
  const git = (args, input) =>
    execFileSync("git", args, { cwd: workRoot, input, maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] });
  const text = (args) => git(args).toString("utf8").trim();
  // Tree paths are repo-relative; mapping them onto LINK_SCAN_ROOTS needs workRoot == the toplevel.
  if (text(["rev-parse", "--show-prefix"]) !== "") throw new Error(`workRoot ${workRoot} is not the git toplevel`);
  const sha = text(["rev-parse", "--verify", `${rev}^{commit}`]);
  const report = { mode: "commit", commit: sha, changedMd: 0, removed: 0, broken: [] };

  // -c: on a merge, one status letter per parent ("MM", "DD"); a path absent from the result is D
  // against every parent that had it. On a normal commit -c changes nothing.
  const status = git(["diff-tree", "-r", "-c", "-z", "--root", "--no-commit-id", "--name-status", "--no-renames", sha])
    .toString("utf8")
    .split("\0");
  const changed = [];
  const removed = new Set();
  for (let i = 0; i + 1 < status.length; i += 2) {
    if (/^D+$/.test(status[i])) removed.add(status[i + 1]);
    else if (status[i]) changed.push(status[i + 1]);
  }

  const inTree = new Set();
  const scopeMd = [];
  for (const f of git(["ls-tree", "-r", "-z", "--name-only", sha]).toString("utf8").split("\0")) {
    if (!f) continue;
    inTree.add(f);
    for (let d = path.posix.dirname(f); d !== "."; d = path.posix.dirname(d)) inTree.add(d);
    if (inLinkScope(path.join(workRoot, f))) scopeMd.push(f);
  }
  const gone = new Set(); // removed paths + directories the commit emptied
  for (const r of removed) {
    for (let p = r; p !== "." && !inTree.has(p); p = path.posix.dirname(p)) gone.add(p);
  }

  const own = new Set(changed.filter((f) => inLinkScope(path.join(workRoot, f))));
  const toRead = gone.size ? scopeMd : [...own];
  const blobs = readBlobs(git, sha, toRead);
  for (const rel of toRead) {
    const content = blobs.get(rel);
    if (content === undefined) continue;
    const outgoing = own.has(rel);
    const fromAbs = path.join(workRoot, rel);
    for (const href of extractLinks(content)) {
      const target = resolveLink(fromAbs, href);
      if (!target) continue;
      const t = path.relative(workRoot, target).split(path.sep).join("/");
      const isBroken = outgoing ? t !== "" && !inTree.has(t) : gone.has(t);
      if (isBroken) {
        report.broken.push({ from: rel, href, resolved: t, cause: outgoing ? "changed_file" : "target_removed" });
      }
    }
  }
  report.changedMd = own.size;
  report.removed = removed.size;
  return report;
}

/** `files` at `rev` through one `git cat-file --batch` (a spawn per file is too slow for the tree-wide incoming check). */
function readBlobs(git, rev, files) {
  const out = new Map();
  if (!files.length) return out;
  const buf = git(["cat-file", "--batch"], files.map((f) => `${rev}:${f}`).join("\n") + "\n");
  let pos = 0;
  for (const f of files) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) break;
    const m = /^\S+ (\S+) (\d+)$/.exec(buf.subarray(pos, nl).toString("utf8"));
    pos = nl + 1;
    if (!m) continue; // "<name> missing" has no body
    const size = Number(m[2]);
    if (m[1] === "blob") out.set(f, buf.subarray(pos, pos + size).toString("utf8"));
    pos += size + 1; // body + trailing LF
  }
  return out;
}

function formatCommitReport(r) {
  const id = r.commit.slice(0, 12);
  if (!r.broken.length) {
    return `Doc integrity (commit ${id}) PASSED: ${r.changedMd} changed in-scope .md, ${r.removed} removed path(s)\n`;
  }
  const lines = [`Doc integrity (commit ${id}): ${r.broken.length} broken link(s)`];
  for (const b of r.broken) lines.push(`  broken_link: ${b.from} -> ${b.href} (resolved: ${b.resolved}) [${b.cause}]`);
  return lines.join("\n") + "\n";
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
/**
 * Section pointers into the agent rule set (AGENTS.md -> appendix; hooks/scripts/commands -> AGENTS.md).
 * The rule and its tests live at <workRoot>/scripts/verify-governance-pointers.mjs; it is run here so the
 * health gate and `npm run validate:docs` see it.
 */
function assertGovernancePointers() {
  const gate = path.join(workRoot, "scripts", "verify-governance-pointers.mjs");
  if (!fs.existsSync(gate)) {
    // Absent gate + absent rule files = a checkout that carries neither (lobster-factory on its own).
    // Absent gate while either rule file exists = the check was deleted or renamed: fail, never skip.
    const ruleFiles = [["agency-os", "AGENTS.md"], ["agency-os", "docs", "operations", "AGENTS_APPENDIX.md"]];
    if (ruleFiles.some((parts) => fs.existsSync(path.join(workRoot, ...parts)))) {
      broken.push({ type: "governance_pointer", detail: `gate script missing: ${gate} (the agent rule files exist, so their section pointers must be checked)` });
    }
    return;
  }
  scannedRoots.push("governance section pointers");
  try {
    const out = execFileSync(process.execPath, [gate, `--root=${workRoot}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    // Exit 0 is not enough: a truncated or emptied gate script also exits 0. Require its counted pass line.
    const pass = /Governance pointers PASSED \((\d+) files scanned, (\d+) headings, (\d+) pointers resolved\)/.exec(out);
    if (!pass || !(Number(pass[1]) > 0 && Number(pass[2]) > 0 && Number(pass[3]) > 0)) {
      broken.push({ type: "governance_pointer", detail: `gate exited 0 without proving it verified anything: ${JSON.stringify(String(out).slice(0, 120))}` });
    }
  } catch (e) {
    const lines = String((e && e.stderr) || (e && e.message) || e).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const issues = lines.slice(1);
    if (issues.length === 0) issues.push(lines[0] || "gate failed without output");
    for (const l of issues) broken.push({ type: "governance_pointer", detail: l });
  }
}

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

const commitRev = getArg("commit", null);
if (commitRev) {
  const jsonOut = process.argv.includes("--json");
  let out;
  let code;
  try {
    const report = runCommitMode(commitRev);
    code = report.broken.length ? 1 : 0;
    out = jsonOut ? JSON.stringify(report) + "\n" : formatCommitReport(report);
  } catch (e) {
    const msg = String((e && e.message) || e).split("\n")[0];
    code = 2;
    out = jsonOut
      ? JSON.stringify({ mode: "commit", error: msg }) + "\n"
      : `Doc integrity (commit mode) could not run: ${msg}\n`;
  }
  // Flush before exit: a piped stdout is async on Windows and process.exit() can drop the tail the
  // hook parses. The top-level await also keeps the full scan below from starting.
  const stream = code === 0 || jsonOut ? process.stdout : process.stderr;
  await new Promise((resolve) => stream.write(out, resolve));
  process.exit(code);
}

assertCanonical();
assertNonEmptyMarkdownTrees();
assertGovernancePointers();

for (const root of LINK_SCAN_ROOTS) {
  if (!fs.existsSync(root.dir)) continue;
  scannedRoots.push(root.label);
  for (const file of rootMarkdownFiles(root)) scanMarkdownFile(file);
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
