/**
 * job-store.ts — 影片生成的 job 暫存（**Supabase 持久化**，async 模式）。
 *
 * 為什麼持久化（2026-06-19，取代原 in-memory Map）：影片同步生成 >100s 會撞 CF orange 100s 上限
 * → async（/generate 立即回 jobId，背景跑，/status 輪詢）。原本 job 存 module-level Map，**容器重啟/
 * 部署即丟失 in-flight job → /status 回 job_not_found**（使用者實際踩到：redeploy 重啟容器撞上渲染中）。
 * 改存 Supabase `video_jobs` 表後：進度票跨重啟/部署存活、收尾（記 media_assets + 清 R2）可在任一容器
 * 完成、未來多實例亦正確（原 docstring 早指這條路）。
 *
 * 仍非影片本身：**持久產物是 R2 影片 + media_assets 列**（reconcile cron 每 ~15 分補孤兒當最後防線）。
 * 本表為短暫進度狀態（1h TTL，createJob 時順手清過期列）；存取僅經 service_role（getSupabaseWriteClient），
 * 瀏覽器端永不直連（RLS 開、無 policy）。Schema: packages/db/migrations/0047_video_jobs.sql。
 */
import { randomUUID } from "crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export type VideoJobStatus = "running" | "done" | "error";

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  step?: string;                 // 目前執行到哪個步驟（給 UI 顯示進度）
  video?: { outputs: Record<string, string>; out_dir: string };
  title?: string;
  error?: string;
  statusCode?: number;
  createdAt: number;
  // ── async 收尾用（prepare 後填；/status 輪詢 EU + 完成記錄）──
  euJobId?: string;              // EU video-service 的 render job id
  r2Keys?: string[];            // 本輪 Flux 暫存物件 key（render 完成後清）
  recordParams?: { title: string; sceneCount: number; organizationId: string };
  recorded?: boolean;           // media_assets 已記錄（只記一次）
}

const TABLE = "video_jobs";
const TTL_MS = 60 * 60 * 1000; // 1h

// DB 列（snake_case）→ VideoJob（camelCase）。
function rowToJob(r: any): VideoJob {
  return {
    id: r.id,
    status: r.status,
    step: r.step ?? undefined,
    video: r.video ?? undefined,
    title: r.title ?? undefined,
    error: r.error ?? undefined,
    statusCode: r.status_code ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    euJobId: r.eu_job_id ?? undefined,
    r2Keys: Array.isArray(r.r2_keys) ? r.r2_keys : undefined,
    recordParams: r.record_params ?? undefined,
    recorded: r.recorded ?? undefined,
  };
}

/** 建立一個 running job，回傳之（呼叫端拿 id）。id 在 node 端生成 → 不需 DB round-trip 取 id。 */
export async function createJob(): Promise<VideoJob> {
  const job: VideoJob = { id: randomUUID(), status: "running", createdAt: Date.now() };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return job; // 無 service-role（理論上不會發生於 prod）→ 降級為 ephemeral，呼叫端仍可運作
  const { error } = await supabase.from(TABLE).insert({ id: job.id, status: "running" });
  if (error) console.warn("[job-store] createJob insert failed:", error.message);
  // 順手清過期列（best-effort，不阻塞、不拋）。
  void supabase.from(TABLE).delete().lt("created_at", new Date(Date.now() - TTL_MS).toISOString());
  return job;
}

export async function getJob(id: string): Promise<VideoJob | undefined> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return undefined;
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) { console.warn("[job-store] getJob failed:", error.message); return undefined; }
  return data ? rowToJob(data) : undefined;
}

/** 更新進行中 job 的步驟描述（給 UI 顯示 "正在做什麼"）。best-effort。 */
export async function updateJobStep(id: string, step: string): Promise<void> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).update({ step }).eq("id", id);
  if (error) console.warn("[job-store] updateJobStep failed:", error.message);
}

/** 背景管線完成/失敗時更新 job（done 帶 video/title；error 帶 error/statusCode）。best-effort。 */
export async function finishJob(id: string, patch: Partial<VideoJob>): Promise<void> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return;
  const upd: Record<string, unknown> = {};
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.step !== undefined) upd.step = patch.step;
  if (patch.euJobId !== undefined) upd.eu_job_id = patch.euJobId;
  if (patch.video !== undefined) upd.video = patch.video;
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.error !== undefined) upd.error = patch.error;
  if (patch.statusCode !== undefined) upd.status_code = patch.statusCode;
  if (patch.r2Keys !== undefined) upd.r2_keys = patch.r2Keys;
  if (patch.recordParams !== undefined) upd.record_params = patch.recordParams;
  if (patch.recorded !== undefined) upd.recorded = patch.recorded;
  if (Object.keys(upd).length === 0) return;
  const { error } = await supabase.from(TABLE).update(upd).eq("id", id);
  if (error) console.warn("[job-store] finishJob failed:", error.message);
}
