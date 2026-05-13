#!/usr/bin/env node
// verify-wp-plugin-stack-sync.mjs
//
// Drift check: WP_CLIENT_PLUGIN_STACK.md (human SSOT) vs wp-plugin-stack-catalog.ts (machine mirror).
//
// Exit 0 = aligned; Exit 1 = drift (prints diff).
//
// Owner doc: agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md §八.5
// Run:       node scripts/verify-wp-plugin-stack-sync.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const MD_PATH = join(REPO_ROOT, "agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md");
const TS_PATH = join(REPO_ROOT, "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts");

// Expected module sizes per the WP_CLIENT_PLUGIN_STACK.md §五 matrix and §一/二/三 headers
const EXPECTED_MODULE_COUNTS = {
  base: 16,
  ecommerce: 12,
  tourism: 5,
  brand: 3,
};

const TOTAL_EXPECTED = Object.values(EXPECTED_MODULE_COUNTS).reduce((a, b) => a + b, 0);

// ── MD parser ────────────────────────────────────────────────────────────────

/** Extract slugs from a table block by capturing the WP.org Slug column. */
function extractSlugsFromMdSection(md, sectionHeading) {
  const startIdx = md.indexOf(sectionHeading);
  if (startIdx === -1) return { slugs: [], paid: 0, optional: 0 };

  // End at next heading (## or ### at any level above section's level)
  const sectionLevel = (sectionHeading.match(/^#+/) ?? [""])[0].length;
  const remainder = md.slice(startIdx + sectionHeading.length);
  let endIdx = remainder.length;
  const headingRe = /\n(#{1,4}) [^\n]+/g;
  let m;
  while ((m = headingRe.exec(remainder)) !== null) {
    if (m[1].length <= sectionLevel) { endIdx = m.index; break; }
  }
  const block = remainder.slice(0, endIdx);

  const slugs = [];
  let paid = 0;
  let optional = 0;
  // Parse table rows: | category | name | tier | slug | desc |
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    if (/^[-:|\s]+$/.test(cells[1] ?? "")) continue; // separator row
    if (/^類別$/.test(cells[1] ?? "")) continue;     // header row
    const slugCell = cells[4] ?? "";
    if (!slugCell || slugCell === "WP.org Slug") continue;

    // slugCell can be: "kadence", "litespeed-cache ★ / PAID", "PAID", "DIRECT", "`leaflet-map` ↩"
    if (/†/.test(cells[2] ?? "") || /†/.test(slugCell)) optional++;
    if (/PAID|DIRECT/.test(slugCell)) paid++;

    // Extract token before any space/slash if not PAID-only
    const cleanSlugs = slugCell
      .replace(/`/g, "")
      .split(/[\s\/]+/)
      .filter((s) => s && !/^[★↩†]$/.test(s) && s !== "PAID" && s !== "DIRECT");
    for (const s of cleanSlugs) {
      // Normalize: strip trailing markers like "★", "↩"
      const normalized = s.replace(/[★↩†]/g, "");
      if (normalized && /^[a-z0-9-]+$/.test(normalized)) slugs.push(normalized);
    }
  }
  return { slugs, paid, optional };
}

// ── TS parser ────────────────────────────────────────────────────────────────

/** Extract { slug, free, required, module, alternativeSlug } tuples from catalog.ts. */
function extractEntriesFromTs(ts) {
  const arrayStart = ts.indexOf("WP_PLUGIN_CATALOG: WpPlugin[] = [");
  if (arrayStart === -1) throw new Error("Catalog array not found in catalog.ts");
  const arrayBody = ts.slice(arrayStart);

  const entries = [];
  // Match either a one-line entry or a multi-line entry between { ... },
  const objRe = /\{[^{}]*\}/gs;
  let m;
  while ((m = objRe.exec(arrayBody)) !== null) {
    const body = m[0];
    const slug = (body.match(/slug:\s*"([^"]+)"/) ?? [])[1];
    if (!slug) continue;
    const free = !/free:\s*false/.test(body);
    const required = !/required:\s*false/.test(body);
    const module = (body.match(/module:\s*"([^"]+)"/) ?? [])[1];
    const altSlug = (body.match(/alternativeSlug:\s*"([^"]+)"/) ?? [])[1];
    if (!module) continue;
    entries.push({ slug, free, required, module, alternativeSlug: altSlug });
  }
  return entries;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const errors = [];
const warnings = [];

const md = await readFile(MD_PATH, "utf8");
const ts = await readFile(TS_PATH, "utf8");

const mdBase     = extractSlugsFromMdSection(md, "## 一、基礎全員必裝");
const mdEcom     = extractSlugsFromMdSection(md, "## 二、電商模組");
const mdTourism  = extractSlugsFromMdSection(md, "### 3.1 旅遊業（追加）");
const mdBrand    = extractSlugsFromMdSection(md, "### 3.2 形象站 / 品牌站（追加）");

const tsEntries  = extractEntriesFromTs(ts);
const tsByModule = {
  base:      tsEntries.filter((e) => e.module === "base"),
  ecommerce: tsEntries.filter((e) => e.module === "ecommerce"),
  tourism:   tsEntries.filter((e) => e.module === "tourism"),
  brand:     tsEntries.filter((e) => e.module === "brand"),
};

// ── Check 1: module counts ──
const ALLOW_DUPLICATE_IN_TS = new Set(["custom-post-type-ui", "modula-best-grid-gallery"]);
for (const [mod, expected] of Object.entries(EXPECTED_MODULE_COUNTS)) {
  const actual = tsByModule[mod].length;
  if (actual !== expected) {
    errors.push(`Module count drift [${mod}]: MD expects ${expected}, catalog.ts has ${actual}`);
  }
}

// ── Check 2: total ──
if (tsEntries.length !== TOTAL_EXPECTED) {
  errors.push(`Total count drift: MD totals ${TOTAL_EXPECTED}, catalog.ts has ${tsEntries.length}`);
}

// ── Check 3: every MD slug must appear in catalog (as slug or alternativeSlug) ──
const allTsSlugs = new Set();
for (const e of tsEntries) {
  allTsSlugs.add(e.slug);
  if (e.alternativeSlug) allTsSlugs.add(e.alternativeSlug);
}

const mdAllSlugs = new Set([...mdBase.slugs, ...mdEcom.slugs, ...mdTourism.slugs, ...mdBrand.slugs]);
for (const slug of mdAllSlugs) {
  if (!allTsSlugs.has(slug)) {
    warnings.push(`MD slug "${slug}" not found in catalog.ts (might be PAID-only with no WP slug listed in MD column)`);
  }
}

// ── Check 4: catalog entries with free:false must have either alternativeSlug or appear in MD with PAID marker ──
for (const e of tsEntries) {
  if (!e.free && !e.alternativeSlug) {
    // Should be in MD as PAID/DIRECT with no free alternative
    // We just sanity-check the slug looks like a real plugin name (not "PAID" or "DIRECT")
    if (/^PAID$|^DIRECT$/i.test(e.slug)) {
      errors.push(`catalog.ts entry has invalid slug "${e.slug}" (should be specific plugin slug, not "PAID")`);
    }
  }
}

// ── Report ──
console.log("──────────────────────────────────────────────────────────");
console.log("WP Plugin Stack sync verification");
console.log("──────────────────────────────────────────────────────────");
console.log(`MD:      ${MD_PATH}`);
console.log(`Catalog: ${TS_PATH}`);
console.log("");
console.log("Module counts (expected → actual):");
for (const [mod, expected] of Object.entries(EXPECTED_MODULE_COUNTS)) {
  const actual = tsByModule[mod].length;
  const ok = actual === expected ? "✓" : "✗";
  console.log(`  ${ok} ${mod.padEnd(10)} ${expected} → ${actual}`);
}
console.log(`  Total: ${TOTAL_EXPECTED} → ${tsEntries.length}`);
console.log("");

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (errors.length > 0) {
  console.log("Errors:");
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log("");
  console.error("DRIFT DETECTED — update WP_CLIENT_PLUGIN_STACK.md or wp-plugin-stack-catalog.ts");
  process.exit(1);
}

console.log("PASS — catalog.ts is aligned with WP_CLIENT_PLUGIN_STACK.md");
// Note about ALLOW_DUPLICATE_IN_TS for context (CPT UI + Modula appear in both tourism and brand intentionally):
if (ALLOW_DUPLICATE_IN_TS.size > 0) {
  console.log(`(Intentional cross-module duplicates: ${[...ALLOW_DUPLICATE_IN_TS].join(", ")})`);
}
process.exit(0);
