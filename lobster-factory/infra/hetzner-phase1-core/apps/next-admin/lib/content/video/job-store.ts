/**
 * job-store.ts — 影片生成的記憶體 job 暫存（async 模式）。
 *
 * 為什麼記憶體：影片同步生成 >100s 會撞 app.aware-wave.com 的 CF orange 100s 上限 →
 * 改 async（/generate 立即回 jobId，背景跑，/status 輪詢）。next-admin 是單一常駐
 * Node 容器（next start，非 serverless、無 clustering），故 module-level Map 在
 * /generate 與 /status 之間共享。job 為短暫狀態；**持久產物是 R2 影片 + media_assets 列**，
 * 故容器重啟丟失 in-flight job 可接受（重生即可）。1 小時自動過期清理避免無限長大。
 *
 * ⚠️ 若未來把 next-admin 擴成多實例，需改為 Supabase/Redis 共享 job store（記憶體會跨實例失準）。
 */
import { randomUUID } from "crypto";

export type VideoJobStatus = "running" | "done" | "error";

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  video?: { outputs: Record<string, string>; out_dir: string };
  title?: string;
  error?: string;
  statusCode?: number;
  createdAt: number;
}

const JOBS = new Map<string, VideoJob>();
const TTL_MS = 60 * 60 * 1000; // 1h

function prune(): void {
  const now = Date.now();
  for (const [id, job] of JOBS) {
    if (now - job.createdAt > TTL_MS) JOBS.delete(id);
  }
}

/** 建立一個 running job，回傳之（呼叫端拿 id）。 */
export function createJob(): VideoJob {
  prune();
  const job: VideoJob = { id: randomUUID(), status: "running", createdAt: Date.now() };
  JOBS.set(job.id, job);
  return job;
}

export function getJob(id: string): VideoJob | undefined {
  return JOBS.get(id);
}

/** 背景管線完成/失敗時更新 job（done 帶 video/title；error 帶 error/statusCode）。 */
export function finishJob(id: string, patch: Partial<VideoJob>): void {
  const job = JOBS.get(id);
  if (job) Object.assign(job, patch);
}
