// Every paid action shows its US$ price before the click (operator 2026-11-10). Deploy gate: pure node, no browser.
// 1. The paid features are the "video.*" keys of backend/main-system.cjs (PAID_ROUTES + paidFeature): each must get a
//    US$ text from shared/paid-price.js out of the real /capabilities (prices read from next-admin cost-model.ts).
// 2. Paid call sites in the frontend (a PAID_ROUTES path literal, generations.create, generations.retry) per feature
//    never outnumber the buttons that declare that feature (a "video.x" literal, as in data-paid="video.x"). A create
//    whose type/operation are not literals declares its features in a `// paid: video.x | none` line just above it.
// 3. No US$ amount written into frontend source.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
const mainSystem = require("../backend/main-system.cjs");

const msSource = fs.readFileSync(path.join(root, "backend/main-system.cjs"), "utf8");
const paidBody = msSource.slice(msSource.indexOf("function paidFeature"), msSource.indexOf("function ledgerKind"));
const FEATURES = [...new Set([...Object.values(mainSystem.PAID_ROUTES), ...paidBody.match(/"video\.[a-z0-9-]+"/g).map((s) => s.slice(1, -1))])];
assert(FEATURES.length >= 7, "paid features not found in main-system.cjs: " + FEATURES);

// Frontend sources: what the browser loads (vendor bundles and the price module itself excluded).
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(dir + "/" + e.name) : /\.(js|mjs|html)$/.test(e.name) ? [dir + "/" + e.name] : []);
const files = ["index.html", "config.js", ...walk("pages"), ...walk("scripts"), ...walk("shared")].filter((f) => f !== "shared/paid-price.js");
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
const lineOf = (text, i) => text.slice(0, i).split("\n").length;

// The argument text of a call starting at "(" (string-aware paren match).
function callArg(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === "/" && text[i + 1] === "/") { i = text.indexOf("\n", i); if (i < 0) break; continue; } // a comment's ' is no quote
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") { if (--depth === 0) return text.slice(open + 1, i); }
  }
  return "";
}
// Top-level `key: "literal"` of an object literal argument; undefined = absent, null = present but not a literal.
function topProp(arg, key) {
  const body = arg.trim();
  if (!body.startsWith("{")) return null;
  let depth = 0, quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === "/" && body[i + 1] === "/") { i = body.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) depth--;
    else if (depth === 1 && body.startsWith(key, i) && !/[\w$.]/.test(body[i - 1])) {
      const m = /^(\w+)\s*(:|,|\n|\r)/.exec(body.slice(i));
      if (!m || m[1] !== key) continue;
      if (m[2] !== ":") return null; // shorthand { type }
      const v = /^\s*("([^"\\]*)"|'([^'\\]*)')\s*[,}\n\r]/.exec(body.slice(i + m[0].length));
      return v ? (v[2] ?? v[3]) : null;
    }
  }
  return undefined;
}

const sites = [], problems = [];
const site = (feature, f, line, how) => sites.push({ feature, where: `${f}:${line}`, how });
for (const [f, text] of Object.entries(src)) {
  for (const [route, feature] of Object.entries(mainSystem.PAID_ROUTES))
    for (const m of text.matchAll(new RegExp(`["'\`]${route.replace(/[/.]/g, "\\$&")}["'\`]`, "g"))) site(feature, f, lineOf(text, m.index), route);
  for (const m of text.matchAll(/generations\s*\.create\(/g)) {
    const line = lineOf(text, m.index), arg = callArg(text, m.index + m[0].length - 1);
    const declared = text.split("\n").slice(Math.max(0, line - 4), line - 1).join("\n").match(/\/\/ paid: ([^\n]+)/);
    if (declared) {
      // `// paid: video.a video.b (why)` or `// paid: none (why)`: the leading keys; the rest is a note.
      const words = declared[1].trim().split(/\s+/), named = words[0] === "none" ? [] : words.slice(0, (words.findIndex((w) => !/^video\./.test(w)) + 1 || words.length + 1) - 1);
      if (!named.length && words[0] !== "none") problems.push(`${f}:${line} // paid: names no feature (or none)`);
      for (const x of named) if (!FEATURES.includes(x)) problems.push(`${f}:${line} // paid: names an unknown feature ${x}`);
      named.forEach((x) => site(x, f, line, "generations.create (declared)"));
      continue;
    }
    const type = topProp(arg, "type"), op = topProp(arg, "operation");
    if (type === null || type === undefined || op === null) { problems.push(`${f}:${line} generations.create with a non-literal type/operation needs a "// paid: <features> | none" line above it`); continue; }
    const feature = mainSystem.paidFeature({ operation: op, settings: {} }, type);
    if (feature) site(feature, f, line, `generations.create ${type}${op ? "/" + op : ""}`);
  }
  for (const m of text.matchAll(/generations\s*\.retry\(/g)) {
    const line = lineOf(text, m.index), declared = text.split("\n").slice(Math.max(0, line - 4), line - 1).join("\n").match(/\/\/ paid: ([^\n]+)/);
    if (declared?.[1].trim().split(/\s+/)[0] === "none") continue;
    // A rerun is priced from the job's own paidFeature (backend/api.cjs start()).
    if (!/data-paid="\$\{[^}]*paidFeature/.test(text)) problems.push(`${f}:${line} generations.retry reruns a paid job: its button needs data-paid="\${…paidFeature…}"`);
  }
}
// Declarations: string literals made only of paid feature keys.
const declared = Object.fromEntries(FEATURES.map((x) => [x, 0]));
for (const text of Object.values(src))
  for (const m of text.matchAll(/["'`]([a-z0-9.\- ]+)["'`]/g)) {
    const keys = m[1].trim().split(/\s+/);
    if (keys.length && keys.every((k) => FEATURES.includes(k))) keys.forEach((k) => declared[k]++);
  }
for (const feature of FEATURES) {
  const at = sites.filter((s) => s.feature === feature);
  if (at.length > declared[feature])
    problems.push(`${feature}: ${at.length} paid call site(s) but ${declared[feature]} priced button declaration(s) -- ${at.map((s) => s.where + " " + s.how).join("; ")}`);
}
for (const [f, text] of Object.entries(src))
  for (const m of text.matchAll(/US\$\s*\d/g)) problems.push(`${f}:${lineOf(text, m.index)} US$ amount written into the source; read it from /capabilities`);

(async () => {
  const { createServer } = require("../server.cjs");
  const server = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "vw-paid-price-")), env: {}, fetchImpl: async () => { throw Error("provider calls forbidden"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const caps = await (await fetch(`http://127.0.0.1:${server.address().port}/api/vw/capabilities`)).json();
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "shared/models.js"), "utf8") + "\n" + fs.readFileSync(path.join(root, "shared/paid-price.js"), "utf8"), { window, crypto: globalThis.crypto });
    for (const feature of FEATURES) if (!/US\$\d/.test(window.VideoWorkbenchPrices.text(feature, caps))) problems.push(`${feature}: no US$ price from /capabilities`);
    // The shown numbers are next-admin's rates (not a copy): spot checks against cost-model.ts.
    const rates = require(path.join(require("../backend/appearance.cjs").resolveSource(root, process.env), "lib/ai/cost-model.ts"));
    assert.equal(caps.prices["video.transcribe"].usd, rates.TRANSCRIBE_RATES["whisper-1"].usdPerMin);
    assert.equal(caps.prices["video.tts"].usd, rates.OPENAI_TTS_RATES[caps.models.audio].usdPerMChars / 1000);
    assert.equal(caps.prices["video.image"].usd, rates.IMAGE_RATES["openai-high"].usd);
    assert.match(window.VideoWorkbenchPrices.text("video.transcribe video.script", caps), /^US\$[\d.]+／分鐘 \+ 約 US\$[\d.]+／次$/);
  } finally {
    server.close();
  }
  if (problems.length) { console.error("paid actions without a price:\n- " + problems.join("\n- ")); process.exit(1); }
  console.log(`paid-price ok: ${FEATURES.length} features, ${sites.length} paid call sites priced`);
})().catch((e) => { console.error(e); process.exit(1); });
