/**
 * One render in its own process (forked by render-runner.ts). Anything that goes wrong in here,
 * including errors Remotion throws from callbacks it never awaits (render-media.js:336
 * onFrameBuffer -> unhandled rejection), ends this process only; the parent turns the exit into
 * a failed job with a reason.
 */
import type { WorkerRequest, WorkerMessage } from "./render-runner";
import { withEncoderThreads } from "./resource-limits";

function send(msg: WorkerMessage): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) return resolve();
    process.send(msg, undefined, {}, () => resolve());
  });
}

let failing = false;
async function fail(err: unknown): Promise<never> {
  if (!failing) {
    failing = true;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[remotion-worker] render failed:", err);
    await send({ type: "error", message });
  }
  process.exit(1);
}

process.on("uncaughtException", (err) => void fail(err));
process.on("unhandledRejection", (err) => void fail(err));
// Parent gone: nobody will read the result.
process.on("disconnect", () => process.exit(1));

async function render(req: WorkerRequest): Promise<void> {
  const { selectComposition, renderMedia, renderStill, makeCancelSignal } = await import("@remotion/renderer");
  // The parent asks for a cancel at its time limit; Remotion then closes its own Chromium
  // (puppeteer starts it in a separate process group the parent cannot kill as a tree).
  const { cancelSignal, cancel } = makeCancelSignal();
  process.on("message", (m: { type?: string }) => {
    if (m && m.type === "cancel") cancel();
  });
  const browserExecutable = process.env.REMOTION_CHROME_EXECUTABLE_PATH;
  const composition = await selectComposition({
    serveUrl: req.serveUrl,
    id: req.compositionId,
    inputProps: req.inputProps,
    browserExecutable,
  });
  // A still (the cover): one frame as JPEG, no ffmpeg encode (U8.4: the 1 GiB container), so no thread limits to pass.
  if (req.still) {
    await renderStill({
      composition: { ...composition, durationInFrames: 1, fps: req.fps, width: req.width, height: req.height },
      serveUrl: req.serveUrl,
      output: req.outFile,
      inputProps: req.inputProps,
      frame: 0,
      imageFormat: "jpeg",
      jpegQuality: 92,
      overwrite: true,
      browserExecutable,
      cancelSignal,
      chromiumOptions: { headless: true, gl: "swangle" },
    });
    void send({ type: "progress", progress: 100 });
    return;
  }
  // Data-driven templates take their length from calculateMetadata (scenes[] sum); MAX_FRAMES
  // stays the backstop either way.
  const renderFrames = Math.min(req.isDataDriven ? composition.durationInFrames : req.totalFrames, req.maxFrames);
  await renderMedia({
    composition: { ...composition, durationInFrames: renderFrames, fps: req.fps, width: req.width, height: req.height },
    serveUrl: req.serveUrl,
    codec: "h264",
    outputLocation: req.outFile,
    inputProps: req.inputProps,
    browserExecutable,
    concurrency: 1,
    cancelSignal,
    disallowParallelEncoding: req.allowParallelEncoding === false ? true : undefined,
    ffmpegOverride: ({ args }) => withEncoderThreads(args, req.encoderThreads),
    chromiumOptions: { headless: true, gl: "swangle" },
    onProgress: ({ progress }) => {
      void send({ type: "progress", progress: Math.round(progress * 100) });
    },
  });
}

process.once("message", (msg: WorkerRequest) => {
  render(msg)
    .then(async () => {
      await send({ type: "done" });
      process.exit(0);
    })
    .catch((err) => fail(err));
});
