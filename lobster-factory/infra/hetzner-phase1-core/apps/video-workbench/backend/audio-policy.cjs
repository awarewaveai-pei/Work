// Plan U7 invariant 11: a client's sound never leaves our servers when the client's setting says so; a setting that cannot
// be read = refused. The one list of work that sends sound out is outbound() below (grep of every vendor call that
// carries a file with sound, 2026-11-16):
//   editor-transcribe (整片／單檔辨識 job)  transcribe.cjs recognize -> ElevenLabs / Google / OpenAI (not the host worker)
//   POST /transcriptions (sync, one file)    same recognize call                     -> transcribeOut()
//   separate / sfx (音軌分離、去配樂)         audio-tools.cjs run -> the row's `sends` (else its vendor): ElevenLabs
//                                            audio-isolation; sfx way B also sends the picture, without sound, to Google;
//                                            sfx way A sends the video with its sound to Mirelo (the local row stays here)
//   enhance AI 大模型增強                     video-enhance.cjs upscale -> Replicate gets the whole file, its sound included
// Everything else sends text (speech, music, translation, agent) or pictures (image/video models, remove-bg, 3D) only.
// A new vendor call that carries sound = one row here, or it is unguarded.
// The setting lives in the main system (next-admin GET /api/internal/video/workbench/audio-policy, client_config
// .audioExternalAiAllowed); asked fresh before every such job, never cached, so a change applies to the next job. Local
// mode (no client org) has no setting: nothing is asked.
const transcribe = require("./transcribe.cjs"),
  audioTools = require("./audio-tools.cjs"),
  videoEnhance = require("./video-enhance.cjs");

const fail = (message, status) => Object.assign(Error(message), { status });

// What leaves for a speech-to-text engine: the vendor's name, or null for our own host worker.
const transcribeOut = (engine) => (engine.id === "host" ? null : engine.provider);
// The vendor a job's sound goes to, or null when the job keeps sound here (or sends none). Decided from the row the job
// names (else the default), never from whether that row can run right now: an unknown name is refused by the job's own
// check (transcribe.pick / audioTools.pick answer 400 for it, whenever asked).
function outbound(input, env) {
  const op = input?.operation;
  if (op === "editor-transcribe") {
    const id = input.settings?.engine;
    const engine = id === undefined || id === null || id === "" ? transcribe.defaultEngine(env) : transcribe.ENGINES.find((e) => e.id === id);
    return engine ? transcribeOut(engine) : null;
  }
  if (audioTools.handles(input)) {
    const row = audioTools.rowOf(input, env);
    return row && row.id !== "local" ? row.sends || row.vendor : null;
  }
  if (videoEnhance.isAi(input)) return "Replicate";
  return null;
}

// main = backend/main-system.cjs createMainSystem (null when VW_INTERNAL_* are unset); orgId = the client this server
// works for (null = local mode: no client, nothing to ask). A client without a main system = setting unreadable = refused.
function createAudioPolicy({ main, orgId }) {
  // true = may send; false = the client keeps sound here, or the setting could not be read (both refuse).
  async function allowed() {
    if (!main) return !orgId;
    try {
      const { ok, value } = await main.call("/api/internal/video/workbench/audio-policy?organizationId=" + encodeURIComponent(main.organizationId()), { timeoutMs: 10000 });
      return ok && value.ok === true && value.externalAudioAllowed === true;
    } catch {
      return false;
    }
  }
  // Before the work is recorded or anything is sent. vendor = outbound() / transcribeOut(); null = nothing to ask.
  async function check(vendor) {
    if (!vendor || (await allowed())) return;
    throw fail("這個客戶設定聲音不可送出主機（或目前查不到這項設定），已擋下送往 " + vendor + " 的工作；請改用自家主機的方式。", 403);
  }
  return { allowed, check };
}

module.exports = { outbound, transcribeOut, createAudioPolicy };
