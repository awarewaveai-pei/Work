// One-off maintainer tool: makes the pictures for examples/*.json (our own, copyright ours) with OpenAI gpt-image-2.
//   PowerShell:  . D:\Work\mcp\user-env.ps1 ; node scripts/generate-examples.cjs [--only=<id>[,<id>]] [--force=<id>[,<id>]]
// Skips every id whose examples/<id>.webp exists (a rerun costs nothing); stops once the running cost passes MAX_USD.
// Cost = usage tokens x the next-admin published token rates (lib/ai/cost-model.ts OPENAI_IMAGE_TOKEN_RATES). Never prints the key.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), { spawnSync } = require("node:child_process");
const dir = path.join(__dirname, "..", "examples");
const RATES = { textInPerM: 5, imageInPerM: 8, imageOutPerM: 30 };
// PER_CALL_MAX_USD: the most one medium picture costs (1536x1024 ~ $0.065); reserved before each call so MAX_USD is never passed.
const MAX_USD = 4, PER_CALL_MAX_USD = 0.1, MAX_BYTES = 60 * 1024, NO_TEXT = " No text, no letters, no captions, no watermarks, no logos.";
const arg = (name) => (process.argv.find((a) => a.startsWith("--" + name + "=")) || "").split("=")[1]?.split(",").filter(Boolean) || [];
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

function items() {
  const out = [];
  for (const c of read("storyboards.json").cards) out.push({ id: c.id, prompt: c.imagePrompt, size: c.type === "6-Grid" ? "1536x1024" : "1024x1024", width: c.type === "6-Grid" ? 960 : 800 });
  for (const t of read("templates.json").templates) {
    const portrait = t.ratio === "9:16", wide = t.ratio === "16:9";
    out.push({ id: t.id, prompt: t.imagePrompt, size: portrait ? "1024x1536" : wide ? "1536x1024" : "1024x1024", width: portrait ? 540 : wide ? 800 : 640 });
  }
  const styles = read("styles.json");
  for (const s of [...styles.home, ...styles.project]) out.push({ id: s.id, prompt: s.imagePrompt, size: "1024x1024", width: 480 });
  return out;
}

const cost = (usage = {}) => {
  const d = usage.input_tokens_details || {}, image = d.image_tokens || 0, text = d.text_tokens ?? Math.max(0, (usage.input_tokens || 0) - image);
  return (text * RATES.textInPerM + image * RATES.imageInPerM + (usage.output_tokens || 0) * RATES.imageOutPerM) / 1e6;
};

// Smallest loss that fits MAX_BYTES: quality steps first, then a narrower picture.
function toWebp(png, file, width) {
  const ffmpeg = require("ffmpeg-static"), tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vw-ex-")), "in.png");
  fs.writeFileSync(tmp, png);
  try {
    for (let w = width; w >= 240; w = Math.round(w * 0.85))
      for (const q of [80, 70, 60, 50, 40, 30]) {
        const out = path.join(path.dirname(tmp), "out.webp");
        const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-vf", `scale=${w}:-2`, "-c:v", "libwebp", "-quality", String(q), out]);
        if (r.status !== 0) throw Error("ffmpeg failed: " + String(r.stderr || "").slice(0, 300));
        const size = fs.statSync(out).size;
        if (size <= MAX_BYTES) { fs.copyFileSync(out, file); return size; }
      }
  } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
  throw Error("cannot get " + file + " under " + MAX_BYTES + " bytes");
}

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Error("OPENAI_API_KEY is not set (PowerShell: . D:\\Work\\mcp\\user-env.ps1)");
  const only = arg("only"), force = arg("force");
  let total = 0, made = 0, skipped = 0;
  for (const item of items()) {
    const file = path.join(dir, item.id + ".webp");
    if (only.length && !only.includes(item.id)) continue;
    if (fs.existsSync(file) && !force.includes(item.id)) { skipped++; continue; }
    if (total + PER_CALL_MAX_USD > MAX_USD) { console.log(`STOP: spent $${total.toFixed(3)} >= $${MAX_USD}`); break; }
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-2", prompt: item.prompt + NO_TEXT, size: item.size, quality: "medium", n: 1 }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.data?.[0]?.b64_json) { console.log(`FAIL ${item.id}: ${r.status} ${String(body.error?.message || "no image").slice(0, 200)}`); continue; }
    const usd = cost(body.usage);
    total += usd; made++;
    const bytes = toWebp(Buffer.from(body.data[0].b64_json, "base64"), file, item.width);
    console.log(`OK ${item.id} ${item.size} ${bytes}B $${usd.toFixed(4)} total $${total.toFixed(4)}`);
  }
  console.log(`made ${made}, skipped ${skipped}, cost $${total.toFixed(4)}`);
})().catch((e) => { console.error(String(e.message || e)); process.exitCode = 1; });
