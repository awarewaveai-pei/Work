// Card VD.4 (docs/video-deliverable-pack-spec-20261114.md): a paid AI cover for a finished video. The best free cover's
// frame (backend/cover.cjs candidate 0) is taken again WITHOUT its title, one image-edit row (backend/image-edit.cjs,
// next-admin image-models.js fill rows; price on the button) redraws the whole frame -- a fully transparent mask = edit
// everywhere, in each vendor's own mask form -- and the title is drawn by ffmpeg afterwards (a model never writes text).
// The result is one more cover of the SAME export job (kind "ai", its cost), registered like the free ones (VD.2).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const cover = require("./cover.cjs");

// English: every fill row takes it (catalog zh "no" rows refuse Chinese instructions).
const PROMPT = "Redesign this video frame as an eye-catching video thumbnail. Keep the main subject recognisable and in the same place, " +
  "make the lighting and colour bolder, simplify the background and give it one strong focal point. Do not add any text, letters, numbers, logos or watermarks.";

/** The job a cover-ai job is for: a finished video of this workbench that already has its free covers. Only a deliverable
 *  render gets free covers (api.cjs addCovers), so having them is the test -- no operation list to fall out of step. */
function exportFor(jobs, forJob) {
  const job = jobs.find((j) => j.id === forJob);
  if (!job || job.status !== "succeeded" || !job.result?.url || !job.result?.covers?.length)
    throw Object.assign(Error("找不到可以做封面的成片（成片要先完成並有自動封面）"), { status: 400 });
  return job;
}

/**
 * makeAiCover({ exportJob, model, size, env, fetchImpl, signal, onPrediction, onVendorDone, dir, videoFile }, { imageEdit, run, regionMasks, fontDir })
 * onVendorDone(costUsd) = the paid vendor run has completed (the caller records it so a later local failure is still charged).
 * -> { file, costUsd }: a JPEG cover (the video's size, <= 2 MB, title drawn) written into `dir`; the caller stores it.
 */
async function makeAiCover({ exportJob, model, size, env, fetchImpl, signal, onPrediction, onVendorDone, dir, videoFile }, { imageEdit, run, regionMasks, fontDir }) {
  const { width, height } = exportJob.result;
  if (!(width > 0 && height > 0)) throw Error("成片沒有尺寸，無法做封面");
  const id = crypto.randomUUID(), tmp = (k) => path.join(dir, `cover-ai-${id}-${k}`);
  try {
    const frame = await cover.framePng({ file: videoFile, seek: exportJob.result.covers[0].at ?? 1, width, height, out: tmp("frame.png"), signal }, { run });
    await run(["-y", "-hide_banner", "-f", "lavfi", "-i", `color=c=black@0.0:s=${frame.width}x${frame.height},format=rgba`, "-frames:v", "1", tmp("mask.png")], signal);
    const masks = await regionMasks(fs.readFileSync(tmp("mask.png")), signal);
    const edited = await imageEdit.run(model, { prompt: PROMPT, image: fs.readFileSync(tmp("frame.png")), masks, ratio: frame.width / frame.height, size, env, fetchImpl, signal, onPrediction });
    onVendorDone?.(edited.costUsd);
    fs.writeFileSync(tmp("edited"), edited.image);
    const out = tmp("cover.jpg");
    if (!(await cover.stillJpeg({ input: tmp("edited"), width, height, title: exportJob.input?.settings?.project?.title ?? exportJob.input?.settings?.title ?? "", out, assFile: tmp("title.ass"), signal }, { run, fontDir })))
      throw Error("AI 封面超過 2 MB，無法使用");
    return { file: out, costUsd: edited.costUsd };
  } catch (error) {
    fs.rmSync(tmp("cover.jpg"), { force: true }); // a run stopped mid-write leaves no JPEG behind
    throw error;
  } finally {
    for (const k of ["frame.png", "mask.png", "edited", "title.ass"]) fs.rmSync(tmp(k), { force: true });
  }
}

module.exports = { exportFor, makeAiCover, PROMPT };
