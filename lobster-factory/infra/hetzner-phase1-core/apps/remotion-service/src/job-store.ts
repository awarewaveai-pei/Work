/**
 * Render job table, mirrored to one JSON file so a job outlives the process that ran it.
 * Invariant: a job a caller was given always ends "done" or "error" with a reason. A job found
 * pending/rendering at load time was cut off by a restart and is closed with INTERRUPTED_ERROR.
 */
import fs from "fs";
import path from "path";

export type JobStatus = "pending" | "rendering" | "done" | "error";

export interface RenderJob {
  status: JobStatus;
  progress: number;
  url?: string;
  error?: string;
  createdAt: number;
}

export const INTERRUPTED_ERROR = "渲染失敗：渲染服務在處理途中重新啟動，此任務已中斷，請重新送出";

export class JobStore {
  private readonly jobs = new Map<string, RenderJob>();

  /** file = null keeps the table in memory only. */
  constructor(private readonly file: string | null) {}

  /** Reads the file and closes jobs a restart cut off. Returns how many were closed. */
  load(): number {
    if (!this.file || !fs.existsSync(this.file)) return 0;
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (err) {
      // Keep the unreadable file for inspection; start empty rather than refuse to boot.
      console.error("[remotion] job table unreadable, starting empty:", err);
      try { fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch { /* ignore */ }
      return 0;
    }
    let interrupted = 0;
    if (raw && typeof raw === "object") {
      for (const [id, value] of Object.entries(raw as Record<string, RenderJob>)) {
        if (!value || typeof value !== "object" || typeof value.status !== "string") continue;
        const job: RenderJob = { ...value };
        if (job.status === "pending" || job.status === "rendering") {
          job.status = "error";
          job.error = INTERRUPTED_ERROR;
          interrupted++;
        }
        this.jobs.set(id, job);
      }
    }
    if (interrupted) this.persist();
    return interrupted;
  }

  get(id: string): RenderJob | undefined {
    return this.jobs.get(id);
  }

  create(id: string): RenderJob {
    const job: RenderJob = { status: "pending", progress: 0, createdAt: Date.now() };
    this.jobs.set(id, job);
    this.persist();
    return job;
  }

  /** Progress lives in memory only: after a restart the job is closed anyway. */
  setProgress(id: string, progress: number): void {
    const job = this.jobs.get(id);
    if (job && job.status === "rendering") job.progress = progress;
  }

  update(id: string, patch: Partial<Omit<RenderJob, "createdAt">>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    this.persist();
  }

  /** Drops finished jobs older than maxAgeMs. Unfinished ones stay until they finish. */
  prune(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    let changed = false;
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < cutoff && (job.status === "done" || job.status === "error")) {
        this.jobs.delete(id);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private persist(): void {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.jobs)));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // A full disk must not fail the render itself; the job just loses restart survival.
      console.error("[remotion] job table write failed:", err);
    }
  }
}
