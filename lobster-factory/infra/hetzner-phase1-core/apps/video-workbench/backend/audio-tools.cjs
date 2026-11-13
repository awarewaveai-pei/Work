// 音軌分離 (separate) and 去配樂・重配音效 (sfx): the one list of ways each tool can run (shaped like speech.cjs). Pages draw
// the rows as buttons from /capabilities (audioTools.<tool>.engines); order and default = backend/providers.cjs (free
// first). settings.<tool>Engine names the row; none (older drafts, the generator's 抽音軌) = the default.
// These tools have no paid feature key: a row that would bill (its price above 0, i.e. ElevenLabs on a paid plan) is listed
// available:false and refused, so nothing runs that cannot be charged.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const providers = require("./providers.cjs");
const { elevenUsd } = require("./provider-cost.cjs");
const elevenlabs = require("./elevenlabs.cjs");

const at = (f) => { try { return f(); } catch { return null; } };
const TOOLS = Object.freeze({
  separate: Object.freeze([
    Object.freeze({ id: "local", vendor: "AwareWave 主機", label: "原音軌", price: () => ({ usd: 0, unit: "次" }), credential: () => true,
      note: "免費、本機處理：抽出整條原音（對白、配樂、音效都在）。" }),
    Object.freeze({ id: "elevenlabs", vendor: "ElevenLabs", label: "ElevenLabs 只留人聲", price: () => at(() => ({ usd: elevenUsd("audio-isolation", 60), unit: "分鐘" })), credential: elevenlabs.keyOf,
      note: "去掉配樂與環境聲，只留人聲；影片至少 4.6 秒；聲音送到 ElevenLabs。" }),
  ]),
  sfx: Object.freeze([
    Object.freeze({ id: "elevenlabs", vendor: "ElevenLabs", label: "ElevenLabs 人聲分離＋音效生成", credential: elevenlabs.keyOf,
      price: () => at(() => ({ usd: elevenUsd("audio-isolation", 60) + elevenUsd("sound-generation", elevenlabs.SOUND_MAX_SECONDS), unit: "分鐘", estimate: true })),
      note: "先只留對白（原配樂與音效一併去掉），再依你寫的描述生成一段音效、循環鋪滿全片；不看畫面，沒寫描述就只去配樂。影片至少 4.6 秒、最長 2 分鐘；聲音送到 ElevenLabs。" }),
  ]),
});
const MAX_SECONDS = { separate: 3600, sfx: 120 };
const KEY = { separate: "separateEngine", sfx: "sfxEngine" };

const rows = (tool, env) => TOOLS[tool].map((r) => {
  const price = r.price();
  return { r, id: r.id, free: price?.usd === 0, price, available: !!r.credential(env) && price?.usd === 0 };
});
const note = (r) => (r.vendor === "ElevenLabs" && elevenlabs.creditsNote() ? r.note + " " + elevenlabs.creditsNote() : r.note);
function capability(env) {
  return Object.fromEntries(Object.keys(TOOLS).map((tool) => {
    const list = rows(tool, env);
    return [tool, { defaultEngine: providers.choose(list)?.id, engines: providers.order(list).map(({ r, available, free, price }) => ({ id: r.id, vendor: r.vendor, label: r.label, note: note(r), available, free, price })) }];
  }));
}
// The row a job runs: its named row, else the default. Unknown = refused; a row that cannot run here = 503 before the job.
function pick(tool, id, env) {
  const list = rows(tool, env);
  const row = id === undefined || id === null || id === "" ? providers.choose(list) : list.find((x) => x.id === id);
  if (!row) throw Object.assign(Error("處理方式無效"), { status: 400 });
  if (!row.available) {
    if (row.r.credential(env)) throw Object.assign(Error("ElevenLabs 已不是免費方案，這個工具的付費計費尚未接上；請改選其他方式。"), { status: 503 });
    elevenlabs.key(env);
  }
  return row.r;
}
const handles = (input) => Object.hasOwn(TOOLS, input?.operation);
// Before the job is recorded: the row exists and can run.
const check = (input, env) => pick(input.operation, input.settings?.[KEY[input.operation]], env);
const runsLocally = (input, env) => input?.operation === "separate" && check(input, env).id === "local";

// An ElevenLabs run. Answers { type, url, ai: { model, provider, costUsd } } like media.cjs's results.
async function run(input, { file, output, signal, run: ffmpeg, inspect, env, fetchImpl = fetch }) {
  const tool = input.operation, row = check(input, env), apiKey = elevenlabs.key(env);
  const source = file(input.references?.src?.url);
  if (!source) throw Error("請先選擇來源影片");
  const info = await inspect(source, signal);
  const seconds = Number(info?.duration);
  if (!(seconds > 0)) throw Error("無法讀取素材長度");
  if (seconds > MAX_SECONDS[tool]) throw Error(`影片最長 ${MAX_SECONDS[tool] / 60} 分鐘`);
  const prompt = tool === "sfx" ? String(input.settings?.sfxPrompt || "").trim().slice(0, 200) : "";
  if (tool === "sfx" && !info.audio && !prompt) throw Error("影片沒有聲音；請寫下想要的音效");
  if (info.audio && seconds < elevenlabs.ISOLATE_MIN_SECONDS) throw Error("ElevenLabs 人聲分離需要至少 4.6 秒的聲音");
  if (tool === "separate" && !info.audio) throw Error("影片沒有聲音軌");
  const tmp = (ext) => path.join(path.dirname(output("tmp").file), "tmp-" + crypto.randomUUID() + "." + ext), made = [];
  const temp = (ext) => { const f = tmp(ext); made.push(f); return f; };
  try {
    let voice = null, usd = 0;
    if (info.audio) {
      const mixed = temp("mp3");
      await ffmpeg(["-y", "-hide_banner", "-i", source, "-vn", "-ac", "2", "-ar", "44100", "-b:a", "192k", mixed], signal);
      voice = temp("mp3");
      fs.writeFileSync(voice, await elevenlabs.isolate({ apiKey, buffer: fs.readFileSync(mixed), fetchImpl, signal }));
      usd += elevenUsd("audio-isolation", seconds);
    }
    if (tool === "separate") {
      const result = output("mp3");
      await ffmpeg(["-y", "-hide_banner", "-i", voice, "-ar", "48000", "-b:a", "192k", result.file], signal);
      return { type: "audio", url: result.url, ai: { model: "audio-isolation", provider: row.vendor, costUsd: usd } };
    }
    let effects = null;
    if (prompt) {
      const sound = await elevenlabs.soundEffect({ apiKey, prompt, seconds, fetchImpl, signal });
      effects = temp("mp3");
      fs.writeFileSync(effects, sound.audio);
      usd += elevenUsd("sound-generation", sound.seconds);
    }
    // The video stays as it is; the new sound = the voice + the effect looped under it for the whole length.
    const result = output("mp4"), inputs = ["-i", source], mix = [];
    if (voice) { inputs.push("-i", voice); mix.push(`[${mix.length + 1}:a]aresample=48000[a${mix.length}]`); }
    if (effects) { inputs.push("-stream_loop", "-1", "-i", effects); mix.push(`[${mix.length + 1}:a]volume=0.6,aresample=48000[a${mix.length}]`); }
    const labels = mix.map((_, i) => `[a${i}]`).join("");
    const graph = mix.join(";") + ";" + (mix.length > 1 ? `${labels}amix=inputs=${mix.length}:duration=longest:normalize=0[out]` : `${labels}anull[out]`);
    await ffmpeg(["-y", "-hide_banner", ...inputs, "-filter_complex", graph, "-map", "0:v:0", "-map", "[out]", "-t", String(seconds), "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", result.file], signal);
    return { type: "video", url: result.url, ai: { model: effects ? "sound-generation" : "audio-isolation", provider: row.vendor, costUsd: Math.round(usd * 1e6) / 1e6 } };
  } finally {
    for (const f of made) fs.rmSync(f, { force: true });
  }
}

module.exports = { TOOLS, KEY, MAX_SECONDS, capability, pick, check, handles, runsLocally, run };
