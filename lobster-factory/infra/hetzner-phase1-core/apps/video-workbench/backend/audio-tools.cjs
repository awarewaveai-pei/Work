// 音軌分離 (separate) and 去配樂・重配音效 (sfx): the one list of ways each tool can run (shaped like speech.cjs). Pages draw
// the rows as buttons from /capabilities (audioTools.<tool>.engines); order and default = backend/providers.cjs (free
// first). settings.<tool>Engine names the row; none (older drafts, the generator's 抽音軌) = the default.
// Billing: every row with paid:true is the paid feature video.audio-tools (main-system.cjs paidFeature: permit before the
// job, the run's real cost charged on success by api.cjs settle). A row runs only when refusal(env) is null:
// - an ElevenLabs row needs the account's plan known and not free (the free plan's terms forbid commercial use);
// - every vendor key it calls is set (no fallback to another vendor);
// - its rates are in next-admin cost-model.ts (usd() throws otherwise: no price = not offered).
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const providers = require("./providers.cjs");
const { elevenListUsd } = require("./provider-cost.cjs");
const elevenlabs = require("./elevenlabs.cjs");
const videoDescribe = require("./video-describe.cjs");
const { KEPT_HERE } = require("./transcribe.cjs");

const at = (f) => { try { return f(); } catch { return null; } };
const round = (usd) => Math.round(usd * 1e6) / 1e6;
const elevenRefusal = (env) => (!elevenlabs.keyOf(env) ? "此電腦尚未設定 ELEVENLABS_API_KEY；請先設定服務。"
  : !elevenlabs.known() ? "讀不到 ElevenLabs 帳號方案，暫停使用；請稍後再試。"
  : elevenlabs.freePlan() ? "ElevenLabs 免費方案不可商用，升級後可用。" : null);
// sends = where the row's sound / picture goes (backend/audio-policy.cjs outbound reports it); none = the vendor.
const TOOLS = Object.freeze({
  separate: Object.freeze([
    Object.freeze({ id: "local", vendor: "AwareWave 主機", label: "原音軌", paid: false, unit: "次", usd: () => 0, refusal: () => null,
      note: "免費、本機處理：抽出整條原音（對白、配樂、音效都在）。" }),
    Object.freeze({ id: "elevenlabs", vendor: "ElevenLabs", label: "ElevenLabs 只留人聲", paid: true, unit: "分鐘", usd: (s) => elevenListUsd("audio-isolation", s), refusal: elevenRefusal,
      note: "去掉配樂與環境聲，只留人聲；影片至少 4.6 秒；聲音送到 ElevenLabs。" }),
  ]),
  sfx: Object.freeze([
    // Way B (operator 2026-11-25): Gemini looks, ElevenLabs makes the sounds. id kept from the row it replaces (old drafts).
    Object.freeze({ id: "elevenlabs", vendor: "ElevenLabs", label: "Gemini 看畫面＋ElevenLabs 生成", paid: true, unit: "分鐘", estimate: true,
      sends: "Google（畫面，不含聲音）與 ElevenLabs（聲音）",
      usd: (s) => elevenListUsd("audio-isolation", s) + elevenListUsd("sound-generation", s) + videoDescribe.estimateUsd(s),
      refusal: (env) => elevenRefusal(env) || (videoDescribe.keyOf(env) ? null : "此電腦尚未設定 GEMINI_API_KEY；請先設定服務。"),
      note: "Gemini 每秒看一格畫面、寫出各段該有的音效，ElevenLabs 生成後放到對應時間；對白保留，原配樂與音效去掉，畫面不變。音效對時到秒，快動作可能對不準。有聲音的影片至少 4.6 秒、最長 2 分鐘；畫面（不含聲音）送到 Google，聲音送到 ElevenLabs。" }),
  ]),
});
const MAX_SECONDS = { separate: 3600, sfx: 120 };
const KEY = { separate: "separateEngine", sfx: "sfxEngine" };

const rows = (tool, env) => TOOLS[tool].map((r) => {
  const price = at(() => ({ usd: round(r.usd(60)), unit: r.unit, ...(r.estimate ? { estimate: true } : {}) }));
  const refusal = r.refusal(env) || (price ? null : "此方式尚無價目，暫停使用。");
  return { r, id: r.id, free: !r.paid, price, refusal, available: !refusal };
});
// soundOut false (plan U7, backend/audio-policy.cjs: this client keeps its sound here) = only the local row can run.
function capability(env, { soundOut = true } = {}) {
  return Object.fromEntries(Object.keys(TOOLS).map((tool) => {
    const list = rows(tool, env).map((x) => (soundOut || x.id === "local" ? x : { ...x, available: false, kept: true }));
    return [tool, { defaultEngine: providers.choose(list)?.id, engines: providers.order(list).map(({ r, available, free, price, kept, refusal }) => ({ id: r.id, vendor: r.vendor, label: r.label, note: (refusal ? refusal + " " : "") + r.note + (kept ? " " + KEPT_HERE : ""), available, free, price })) }];
  }));
}
// The row a job runs: its named row, else the default. Unknown = refused; a row that cannot run here = 503 before the job.
function pick(tool, id, env) {
  const list = rows(tool, env);
  const row = id === undefined || id === null || id === "" ? providers.choose(list) : list.find((x) => x.id === id);
  if (!row) throw Object.assign(Error("處理方式無效"), { status: 400 });
  if (!row.available) throw Object.assign(Error(row.refusal), { status: 503 });
  return row.r;
}
const handles = (input) => Object.hasOwn(TOOLS, input?.operation);
// The row a job names, else the default -- without asking whether it can run now (backend/audio-policy.cjs: where the
// sound would go must not depend on an account cache). Unknown name = null (pick refuses it).
const rowOf = (input, env) => {
  const id = input.settings?.[KEY[input.operation]];
  return id === undefined || id === null || id === "" ? providers.choose(rows(input.operation, env))?.r : TOOLS[input.operation].find((r) => r.id === id) || null;
};
// Whether a job is paid work (main-system.cjs paidFeature, which has no env). A named row: its own flag (an unknown name
// counts as paid; pick refuses it anyway). No name = the default, which providers.choose makes the first free row that
// can run -- the only free rows (local) always can -- so the default is paid only in a tool without a free row.
const paid = (input) => {
  if (!handles(input)) return false;
  const id = input.settings?.[KEY[input.operation]];
  if (id === undefined || id === null || id === "") return !TOOLS[input.operation].some((r) => !r.paid);
  return TOOLS[input.operation].find((r) => r.id === id)?.paid ?? true;
};
// Before the job is recorded: the row exists and can run.
const check = (input, env) => pick(input.operation, input.settings?.[KEY[input.operation]], env);
const runsLocally = (input, env) => input?.operation === "separate" && check(input, env).id === "local";
// provider-cost.cjs priceOf("audio-tools", "<tool>:<id>") and the quote: the row's price for that many source seconds;
// throws when a rate it reads is missing.
const rateKey = (input, env) => input.operation + ":" + rowOf(input, env)?.id;
function usdOf(key, seconds) {
  const [tool, id] = String(key).split(":"), row = Object.hasOwn(TOOLS, tool) && TOOLS[tool].find((r) => r.id === id);
  if (!row) throw Object.assign(Error("此模型尚無價目，暫停付費功能：" + key), { status: 503 });
  return round(row.usd(seconds));
}
// capabilities.prices["video.audio-tools"]: the cheapest paid row's minute.
const displayPrice = () => ({ usd: Math.min(...Object.entries(TOOLS).flatMap(([tool, list]) => list.filter((r) => r.paid).map((r) => usdOf(tool + ":" + r.id, 60)))), unit: "分鐘起", estimate: true });

// Way B of 去配樂・重配音效: cues from Gemini (first: the cheapest step, so a refusal spends the least), the voice from
// ElevenLabs, one ElevenLabs sound per cue (a cue over 30 s in 30-second pieces), mixed at the cue times.
async function lookAndGenerate({ source, seconds, info, input, env, fetchImpl, signal, ffmpeg, temp }) {
  const apiKey = elevenlabs.key(env);
  const look = await videoDescribe.describe({ file: source, seconds, extra: input.settings?.sfxPrompt, env, fetchImpl, signal, run: ffmpeg, tmp: temp });
  let usd = look.usd, voice = null;
  if (info.audio) voice = await isolateVoice({ source, apiKey, fetchImpl, signal, ffmpeg, temp });
  if (voice) usd += elevenListUsd("audio-isolation", seconds);
  const effects = [];
  for (const cue of look.cues) {
    for (let start = cue.start; cue.end - start > 0.05; start += elevenlabs.SOUND_MAX_SECONDS) {
      const length = Math.min(elevenlabs.SOUND_MAX_SECONDS, cue.end - start);
      const sound = await elevenlabs.soundEffect({ apiKey, prompt: cue.prompt, seconds: length, fetchImpl, signal });
      const f = temp("mp3");
      fs.writeFileSync(f, sound.audio);
      usd += elevenListUsd("sound-generation", sound.seconds);
      effects.push({ file: f, start, length });
    }
  }
  const note = "Gemini 配了 " + look.cues.length + " 段音效：" + look.cues.map((c) => `${c.start}–${c.end} 秒 ${c.prompt}`).join("；");
  return { voice, effects, usd, note: note.length > 300 ? note.slice(0, 299) + "…" : note };
}
async function isolateVoice({ source, apiKey, fetchImpl, signal, ffmpeg, temp }) {
  const mixed = temp("mp3"), voice = temp("mp3");
  await ffmpeg(["-y", "-hide_banner", "-i", source, "-vn", "-ac", "2", "-ar", "44100", "-b:a", "192k", mixed], signal);
  fs.writeFileSync(voice, await elevenlabs.isolate({ apiKey, buffer: fs.readFileSync(mixed), fetchImpl, signal }));
  return voice;
}
// The picture as it is (-c:v copy); the new sound = the voice + each effect delayed to its time, padded to the full length.
async function mixInto({ source, seconds, voice, effects, output, ffmpeg, signal }) {
  const result = output("mp4"), inputs = ["-i", source], parts = [], labels = [];
  if (voice) { inputs.push("-i", voice); parts.push(`[1:a]aresample=48000[v]`); labels.push("[v]"); }
  effects.forEach((e, i) => {
    inputs.push("-i", e.file);
    const ms = Math.round(e.start * 1000);
    parts.push(`[${inputs.length / 2 - 1}:a]aresample=48000,atrim=0:${e.length.toFixed(3)},volume=0.8,adelay=${ms}:all=1[e${i}]`);
    labels.push(`[e${i}]`);
  });
  const graph = parts.join(";") + ";" + labels.join("") + (labels.length > 1 ? `amix=inputs=${labels.length}:duration=longest:normalize=0,apad[out]` : "apad[out]");
  await ffmpeg(["-y", "-hide_banner", ...inputs, "-filter_complex", graph, "-map", "0:v:0", "-map", "[out]", "-t", String(seconds), "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", result.file], signal);
  return result;
}

// A vendor run. Answers { type, url, ai: { model, provider, costUsd }, note? } like media.cjs's results; costUsd = what the
// vendors billed for this run (list prices of what was called), charged only when the job succeeds.
async function run(input, { file, output, signal, run: ffmpeg, inspect, env, fetchImpl = fetch }) {
  const tool = input.operation, row = check(input, env);
  const source = file(input.references?.src?.url);
  if (!source) throw Error("請先選擇來源影片");
  const info = await inspect(source, signal);
  const seconds = Number(info?.duration);
  if (!(seconds > 0)) throw Error("無法讀取素材長度");
  if (seconds > MAX_SECONDS[tool]) throw Error(`影片最長 ${MAX_SECONDS[tool] / 60} 分鐘`);
  if (tool === "separate" && !info.audio) throw Error("影片沒有聲音軌");
  if (info.audio && seconds < elevenlabs.ISOLATE_MIN_SECONDS) throw Error("ElevenLabs 人聲分離需要至少 4.6 秒的聲音");
  const made = [], temp = (ext) => {
    const f = path.join(path.dirname(output("tmp").file), "tmp-" + crypto.randomUUID() + "." + ext);
    made.push(f);
    return f;
  };
  try {
    if (tool === "separate") {
      const voice = await isolateVoice({ source, apiKey: elevenlabs.key(env), fetchImpl, signal, ffmpeg, temp });
      const result = output("mp3");
      await ffmpeg(["-y", "-hide_banner", "-i", voice, "-ar", "48000", "-b:a", "192k", result.file], signal);
      return { type: "audio", url: result.url, ai: { model: "audio-isolation", provider: row.vendor, costUsd: elevenListUsd("audio-isolation", seconds) } };
    }
    const sound = await lookAndGenerate({ source, seconds, info, input, env, fetchImpl, signal, ffmpeg, temp });
    const result = await mixInto({ source, seconds, voice: sound.voice, effects: sound.effects, output, ffmpeg, signal });
    return { type: "video", url: result.url, note: sound.note, ai: { model: elevenlabs.SOUND_MODEL, provider: row.vendor, costUsd: round(sound.usd) } };
  } finally {
    for (const f of made) fs.rmSync(f, { force: true });
  }
}

module.exports = { TOOLS, KEY, MAX_SECONDS, capability, pick, check, handles, rowOf, paid, runsLocally, rateKey, usdOf, displayPrice, run };
