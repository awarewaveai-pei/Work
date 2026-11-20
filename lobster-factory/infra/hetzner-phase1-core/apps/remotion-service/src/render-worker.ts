/**
 * One render in its own process (forked by render-runner.ts). Anything that goes wrong in here,
 * including errors Remotion throws from callbacks it never awaits (render-media.js:336
 * onFrameBuffer -> unhandled rejection), ends this process only; the parent turns the exit into
 * a failed job with a reason.
 */
import type { WorkerRequest, WorkerMessage } from "./render-runner";
import { runRenderJob } from "./render-job";

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
  const { makeCancelSignal } = await import("@remotion/renderer");
  // The parent asks for a cancel at its time limit; the job then closes its Chromium (render-job.ts owns the browser,
  // which puppeteer starts in a separate process group the parent cannot kill as a tree).
  const { cancelSignal, cancel } = makeCancelSignal();
  process.on("message", (m: { type?: string }) => {
    if (m && m.type === "cancel") cancel();
  });
  // render-job.ts: one browser for the whole job, the steps profile-opener.mjs times
  const timings = await runRenderJob(req, { cancelSignal, onProgress: (progress) => void send({ type: "progress", progress }) });
  console.log("[remotion-worker] timings", JSON.stringify(timings));
}

process.once("message", (msg: WorkerRequest) => {
  render(msg)
    .then(async () => {
      await send({ type: "done" });
      process.exit(0);
    })
    .catch((err) => fail(err));
});
