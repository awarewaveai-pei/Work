/**
 * Runs render jobs one at a time, each in a forked render-worker process.
 * Invariant: every job taken in ends "done" or "error" with a reason; nothing a render does
 * can end this (the HTTP) process. One at a time because the container (1 GiB) holds one
 * Chromium + ffmpeg at most.
 */
import { fork } from "child_process";
import fs from "fs";
import type { JobStore } from "./job-store";

export interface RenderSpec {
  compositionId: string;
  inputProps: Record<string, unknown>;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  maxFrames: number;
  isDataDriven: boolean;
  /** One JPEG frame (renderStill) instead of an mp4 (app.ts STILL_TEMPLATES). */
  still?: boolean;
}

/** What a job produces: the file extension (outFile, the R2 key) and its content type follow from it. */
export type OutputKind = "mp4" | "jpg";
export const outputKind = (spec: Pick<RenderSpec, "still">): OutputKind => (spec.still ? "jpg" : "mp4");

export interface WorkerRequest extends RenderSpec {
  serveUrl: string;
  outFile: string;
  encoderThreads: number | null;
  allowParallelEncoding: boolean | undefined;
}

export type WorkerMessage =
  | { type: "progress"; progress: number }
  | { type: "done" }
  | { type: "error"; message: string };

export interface RunnerDeps {
  store: JobStore;
  workerPath: string;
  getServeUrl: () => Promise<string>;
  /** Uploads the finished file, returns its public URL. */
  upload: (outFile: string, jobId: string, kind: OutputKind) => Promise<string>;
  outFile: (jobId: string, kind: OutputKind) => string;
  timeoutMs: number;
  /** After a cancel at the time limit, how long the worker gets to close Chromium before SIGKILL. */
  cancelGraceMs: number;
  encoderThreads: number | null;
  allowParallelEncoding: (width: number, height: number) => boolean | undefined;
}

interface WorkerResult {
  ok: boolean;
  message?: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

const MAX_REASON = 200;

/** Strips data: URIs and URL query strings (signed links) and keeps the first line. */
function sanitize(message: string): string {
  const line = message.split("\n").find((l) => l.trim()) ?? "";
  return line
    .replace(/data:[^\s"'`)]+/g, "data:…")
    .replace(/(https?:\/\/[^\s?"'`)]+)\?[^\s"'`)]*/g, "$1?…")
    .trim()
    .slice(0, MAX_REASON);
}

/** The reason a caller sees. Every branch names what happened in words an operator can act on. */
export function describeFailure(r: WorkerResult, timeoutMs: number): string {
  if (r.timedOut) return `渲染失敗：超過 ${Math.round(timeoutMs / 60000)} 分鐘仍未完成，已中止`;
  const msg = r.message ?? "";
  // ffmpeg killed from outside (no exit code) -- in a memory-capped container that is the OOM killer.
  if (/FFmpeg already quit/.test(msg)) return "渲染失敗：影片編碼程序被系統終止（記憶體不足），請改用較低解析度或聯絡管理員";
  const ff = /FFmpeg quit with code (-?\d+)/.exec(msg);
  if (ff) return `渲染失敗：影片編碼程序異常結束（代碼 ${ff[1]}）`;
  if (r.signal === "SIGKILL") return "渲染失敗：渲染程序被系統強制終止（多半是記憶體不足）";
  if (msg) return `渲染失敗：${sanitize(msg)}`;
  if (r.signal) return `渲染失敗：渲染程序被訊號 ${r.signal} 終止`;
  return `渲染失敗：渲染程序異常結束（代碼 ${r.code ?? "未知"}）`;
}

export class RenderRunner {
  private readonly queue: Array<{ jobId: string; spec: RenderSpec }> = [];
  private running = false;

  constructor(private readonly deps: RunnerDeps) {}

  enqueue(jobId: string, spec: RenderSpec): void {
    this.queue.push({ jobId, spec });
    void this.drain();
  }

  /** Jobs waiting behind the one rendering. Each holds its props (up to 4 MB), so callers cap it. */
  get waiting(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) {
        await this.runOne(next.jobId, next.spec);
      }
    } finally {
      this.running = false;
    }
  }

  private async runOne(jobId: string, spec: RenderSpec): Promise<void> {
    const { store } = this.deps;
    const kind = outputKind(spec);
    const outFile = this.deps.outFile(jobId, kind);
    try {
      store.update(jobId, { status: "rendering", progress: 0 });
      const serveUrl = await this.deps.getServeUrl();
      const result = await this.runWorker(jobId, {
        ...spec,
        serveUrl,
        outFile,
        encoderThreads: this.deps.encoderThreads,
        allowParallelEncoding: this.deps.allowParallelEncoding(spec.width, spec.height),
      });
      if (!result.ok) {
        console.error(`[remotion] job ${jobId} failed:`, result);
        store.update(jobId, { status: "error", error: describeFailure(result, this.deps.timeoutMs) });
        return;
      }
      const url = await this.deps.upload(outFile, jobId, kind);
      store.update(jobId, { status: "done", progress: 100, url });
      console.log(`[remotion] job ${jobId} done → ${url}`);
    } catch (err) {
      console.error(`[remotion] job ${jobId} error:`, err);
      const message = err instanceof Error ? err.message : String(err);
      store.update(jobId, { status: "error", error: `渲染失敗：${sanitize(message) || "未知錯誤"}` });
    } finally {
      try { fs.unlinkSync(outFile); } catch { /* not created */ }
    }
  }

  private runWorker(jobId: string, req: WorkerRequest): Promise<WorkerResult> {
    return new Promise((resolve) => {
      // Own process group on Linux so Chromium/ffmpeg grandchildren die with the worker.
      const group = process.platform !== "win32";
      const child = fork(this.deps.workerPath, [], { detached: group, stdio: "inherit" });
      let message: string | undefined;
      let done = false;
      let timedOut = false;
      let settled = false;
      const killTree = () => {
        try {
          if (group && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* already gone */ }
      };
      let graceTimer: NodeJS.Timeout | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        try { child.send({ type: "cancel" }); } catch { /* channel closed */ }
        graceTimer = setTimeout(killTree, this.deps.cancelGraceMs);
      }, this.deps.timeoutMs);
      const finish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (graceTimer) clearTimeout(graceTimer);
        killTree(); // reap any orphaned Chromium/ffmpeg left in the group
        resolve({ ok: done && code === 0 && !timedOut, message, code, signal, timedOut });
      };
      child.on("message", (m: WorkerMessage) => {
        if (m.type === "progress") this.deps.store.setProgress(jobId, m.progress);
        else if (m.type === "done") done = true;
        else if (m.type === "error") message = m.message;
      });
      child.on("error", (err) => {
        message = message ?? err.message;
        finish(null, null);
      });
      child.on("exit", (code, signal) => finish(code, signal));
      child.send(req);
    });
  }
}
