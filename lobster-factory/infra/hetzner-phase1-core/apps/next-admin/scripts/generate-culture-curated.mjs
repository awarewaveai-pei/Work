/**
 * One-time (re-runnable) generator for the curated culture-items dataset.
 *
 * WHY: /api/tools/studio/culture calls an LLM per region×theme. Popular combos repeat
 * constantly → wasted tokens + latency. This script pre-bakes the LLM output ONCE into
 * lib/studio/culture-curated.json; the route then serves baked items for free + instantly
 * and only falls back to the live LLM for combos not in the file (the long tail).
 *
 * The region list and theme hints are PARSED from the real source files (culture-presets.ts
 * CULTURE_REGIONS + culture/route.ts LENS_HINTS) so this can never drift from production.
 *
 * Usage (needs OPENAI_API_KEY in env — source mcp/user-env.ps1 first):
 *   node scripts/generate-culture-curated.mjs --only=Taiwanese     # test one region
 *   node scripts/generate-culture-curated.mjs --all                # full batch (merges)
 *   node scripts/generate-culture-curated.mjs --all --force        # ignore existing, regen all
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, "..");
const PRESETS = join(APP, "lib/studio/culture-presets.ts");
const ROUTE = join(APP, "app/api/tools/studio/culture/route.ts");
const OUT = join(APP, "lib/studio/culture-curated.json");

const MODEL = "gpt-5.4-nano";
const CONCURRENCY = 12;
const MAX_TOKENS = 900;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error("OPENAI_API_KEY not set — source mcp/user-env.ps1 first"); process.exit(1); }

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const ALL = args.includes("--all");
const FORCE = args.includes("--force");
if (!ONLY && !ALL) { console.error("pass --only=<regionEn> or --all"); process.exit(1); }

// ── Parse region.en list from the CULTURE_REGIONS array ONLY (anchor on its declaration and
// stop at the array close `\n];`, so later consts like CORE_TOPICS/TOURIST_TOPICS — which also
// contain `en:` fallback fields — can never be mis-parsed as regions). ──────────────────────
const presetsSrc = readFileSync(PRESETS, "utf8");
const afterDecl = presetsSrc.split("export const CULTURE_REGIONS")[1] ?? "";
const regionsBlock = afterDecl.split("\n];")[0];
const regions = [...regionsBlock.matchAll(/en:\s*"([^"]+)"/g)].map((m) => m[1]);
const uniqRegions = [...new Set(regions)];
if (uniqRegions.length < 50) { console.error(`parsed only ${uniqRegions.length} regions (expected ~60) — CULTURE_REGIONS parse likely broke`); process.exit(1); }

// ── Parse LENS_HINTS (key → hint) from the route (the SSOT the API validates against) ─
const routeSrc = readFileSync(ROUTE, "utf8");
const hintsBlock = routeSrc.split("const LENS_HINTS")[1].split("};")[0];
const hints = {};
for (const m of hintsBlock.matchAll(/^\s*([a-z]+):\s*"([^"]+)",/gm)) hints[m[1]] = m[2];
const themeKeys = Object.keys(hints);
// Fail loud if a route reformat ever truncates the hint parse (would silently skip themes).
if (themeKeys.length < 21) { console.error(`parsed only ${themeKeys.length} theme hints (expected >=21) — LENS_HINTS parse likely broke`); process.exit(1); }

const targetRegions = ONLY ? uniqRegions.filter((r) => r.includes(ONLY)) : uniqRegions;
if (targetRegions.length === 0) { console.error(`no region matches --only=${ONLY}`); process.exit(1); }

console.log(`regions=${targetRegions.length} themes=${themeKeys.length} combos=${targetRegions.length * themeKeys.length}`);

const SYSTEM = `You are a cultural design researcher helping a designer create clothing graphics inspired by world cultures.
Given a culture and a facet, return ONLY a valid JSON array of 12 specific, authentic, visually distinctive items of that facet from that culture.
Each item is an object: {"zh": "<short Traditional Chinese label, 2-6 chars>", "en": "<English phrase, 2-6 words, vivid and visual for an image prompt>", "desc": "<short Traditional Chinese description, under 12 chars>"}.
Be culturally accurate and respectful - use real names of dishes, patterns, garments, landmarks, instruments, figures, etc. Avoid stereotypes and avoid sacred items that should not be commercialized.
No markdown, no explanation, no extra text - just the raw JSON array.`;

let existing = {};
if (!FORCE && existsSync(OUT)) {
  try { existing = JSON.parse(readFileSync(OUT, "utf8")); }
  catch (e) { console.warn(`existing ${OUT} unreadable (${e.message}) — starting fresh`); }
}

function coerce(raw) {
  const arr = raw.match(/\[[\s\S]*\]/)?.[0];
  if (!arr) return null;
  let parsed;
  try { parsed = JSON.parse(arr); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const items = parsed
    .filter((it) => it && typeof it === "object")
    .map((it) => ({
      zh: typeof it.zh === "string" ? it.zh.replace(/\s+/g, " ").trim().slice(0, 24) : "",
      en: typeof it.en === "string" ? it.en.replace(/\s+/g, " ").trim().slice(0, 80) : "",
      desc: typeof it.desc === "string" ? it.desc.replace(/\s+/g, " ").trim().slice(0, 40) : "",
    }))
    .filter((it) => it.zh && it.en)
    .slice(0, 12);
  return items.length ? items : null;
}

let inTok = 0, outTok = 0, done = 0, failed = 0, skipped = 0;

async function fetchCombo(region, key) {
  const cacheKey = `${region}|${key}`;
  if (!FORCE && existing[cacheKey]?.length >= 8) { skipped++; return; }
  const user = `Culture: ${region}. Facet: ${hints[key]}. List 12 specific, authentic, visually compelling items suitable as graphic motifs for clothing design.`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, max_completion_tokens: MAX_TOKENS, messages: [
          { role: "system", content: SYSTEM }, { role: "user", content: user },
        ] }),
      });
      if (!res.ok) { if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; } throw new Error(`http_${res.status}`); }
      const json = await res.json();
      inTok += json.usage?.prompt_tokens ?? 0;
      outTok += json.usage?.completion_tokens ?? 0;
      const items = coerce(json.choices?.[0]?.message?.content ?? "");
      if (items) { existing[cacheKey] = items; done++; return; }
    } catch (e) { if (attempt === 2) { failed++; console.warn(`FAIL ${cacheKey}: ${e.message}`); return; } await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
  }
  failed++;
}

// Build the work list, run with a bounded concurrency pool.
const work = [];
for (const r of targetRegions) for (const k of themeKeys) work.push([r, k]);

let idx = 0;
async function worker() {
  while (idx < work.length) {
    const i = idx++;
    await fetchCombo(work[i][0], work[i][1]);
    if ((done + failed + skipped) % 25 === 0) console.log(`  progress ${done + failed + skipped}/${work.length} (ok=${done} fail=${failed} skip=${skipped})`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Stable key order for clean diffs.
const sorted = Object.fromEntries(Object.keys(existing).sort().map((k) => [k, existing[k]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 0) + "\n", "utf8");

// gpt-5.4-nano pricing (approx): $0.05 / 1M input, $0.40 / 1M output (USD). NT$ ~32/USD.
const usd = (inTok / 1e6) * 0.05 + (outTok / 1e6) * 0.4;
console.log(`\nDONE ok=${done} fail=${failed} skip=${skipped} | tokens in=${inTok} out=${outTok} | est ~$${usd.toFixed(4)} (NT$${(usd * 32).toFixed(2)}) | entries=${Object.keys(sorted).length} -> ${OUT}`);
