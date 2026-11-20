/**
 * One render, as the worker runs it (render-worker.ts) and as scripts/profile-opener.mjs times it -- one code path, so a
 * measurement is of production's own calls.
 * Card R5: one browser per job. selectComposition and renderMedia/renderStill each opened (and closed) their own
 * Chromium; on the production host a cold Chromium start is seconds, so the second one is gone. The browser is the
 * image's (REMOTION_CHROME_EXECUTABLE_PATH; unset = Remotion's own headless shell). Chromium options are Remotion's
 * defaults (multi-process on Linux) plus RENDER_GL. The job owns the browser: a cancel closes it too.
 */
import type { WorkerRequest } from "./render-runner";
import { withEncoderThreads } from "./resource-limits";

/**
 * The GL renderer every render uses (covers, openers, templates) -- one value; the laptop scripts import it too.
 * Measured on ks-aw-01 (2026-11-20, R5 build, docker --cpus=2 --memory=1g, production Chromium wrapper, 1080p 30 fps 2 s):
 *   swangle  still-opener 53-55 s, cover-opener 69-70 s   (concurrency 2: 125 s; 4 CPU: 25 / 34 s)
 *   angle    still-opener 17 s,    cover-opener 17-18 s
 *   egl      still-opener 16-17 s, cover-opener 17-18 s
 *   frames at 0.3 s and 1.0 s, angle/egl vs swangle: PSNR 49-57 dB (the same picture). Remotion's own headless shell with
 *   swangle: 51 / 64 s, so the browser was not the cause. Swangle = SwiftShader through ANGLE; "angle" lets ANGLE pick
 *   its backend: on ks-aw-01 (no GPU) its software path, on a laptop the real GPU -- so a laptop check is not the
 *   production pixel path. Measured on the two openers only; long renders' memory under angle in 1 GiB is not measured.
 */
export const RENDER_GL = "angle" as const;

export interface RenderTimings { openBrowserMs: number; selectMs: number; firstFrameMs: number | null; framesMs: number | null; renderMs: number }

export async function runRenderJob(
  req: WorkerRequest,
  { onProgress = () => {}, cancelSignal, env = process.env }: { onProgress?: (percent: number) => void; cancelSignal?: import("@remotion/renderer").CancelSignal; env?: NodeJS.ProcessEnv } = {},
): Promise<RenderTimings> {
  const { openBrowser, selectComposition, renderMedia, renderStill } = await import("@remotion/renderer");
  const browserExecutable = env.REMOTION_CHROME_EXECUTABLE_PATH || null;
  const chromiumOptions = { headless: true, gl: RENDER_GL };
  let t = Date.now();
  const browser = await openBrowser("chrome", { browserExecutable, chromiumOptions });
  const openBrowserMs = Date.now() - t;
  cancelSignal?.(() => void browser.close({ silent: true }).catch(() => {}));
  try {
    t = Date.now();
    const composition = await selectComposition({ serveUrl: req.serveUrl, id: req.compositionId, inputProps: req.inputProps, browserExecutable, puppeteerInstance: browser, chromiumOptions });
    const selectMs = Date.now() - t;
    t = Date.now();
    // A still (the cover): one frame as JPEG, no ffmpeg encode (U8.4: the 1 GiB container), so no thread limits to pass.
    if (req.still) {
      await renderStill({
        composition: { ...composition, durationInFrames: 1, fps: req.fps, width: req.width, height: req.height },
        serveUrl: req.serveUrl, output: req.outFile, inputProps: req.inputProps, frame: 0, imageFormat: "jpeg", jpegQuality: 92,
        overwrite: true, browserExecutable, puppeteerInstance: browser, cancelSignal, chromiumOptions,
      });
      onProgress(100);
      return { openBrowserMs, selectMs, firstFrameMs: null, framesMs: null, renderMs: Date.now() - t };
    }
    // Data-driven templates take their length from calculateMetadata (scenes[] sum); MAX_FRAMES stays the backstop.
    const renderFrames = Math.min(req.isDataDriven ? composition.durationInFrames : req.totalFrames, req.maxFrames);
    let firstFrameMs: number | null = null, framesMs: number | null = null;
    await renderMedia({
      composition: { ...composition, durationInFrames: renderFrames, fps: req.fps, width: req.width, height: req.height },
      serveUrl: req.serveUrl, codec: "h264", outputLocation: req.outFile, inputProps: req.inputProps, browserExecutable,
      puppeteerInstance: browser, concurrency: 1, cancelSignal,
      disallowParallelEncoding: req.allowParallelEncoding === false ? true : undefined,
      ffmpegOverride: ({ args }) => withEncoderThreads(args, req.encoderThreads),
      chromiumOptions,
      onProgress: ({ progress, renderedFrames }) => {
        if (renderedFrames >= 1 && firstFrameMs === null) firstFrameMs = Date.now() - t;
        if (renderedFrames >= renderFrames && framesMs === null) framesMs = Date.now() - t;
        onProgress(Math.round(progress * 100));
      },
    });
    return { openBrowserMs, selectMs, firstFrameMs, framesMs, renderMs: Date.now() - t };
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}
