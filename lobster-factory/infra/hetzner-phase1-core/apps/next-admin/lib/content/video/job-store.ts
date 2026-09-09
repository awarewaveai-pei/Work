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
import type { RenderOutputMeta, VideoServiceCapability } from "./render-client";

export type VideoJobStatus = "running" | "done" | "error";

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  /**
   * 擁有此 job 的租戶。**在 createJob 建立列的當下寫定**，與 recordParams 是否齊備無關 ——
   * 這是 /api/video/status 租戶閘的唯一依據。
   *
   * 為何不能用 `recordParams.organizationId` 當授權來源：那包東西要等 prepare 成功才寫入
   * （generate/route.ts:148-164），失敗路徑（:142、:168）完全不寫。拿它當閘 = client 對
   * 自己失敗的 render 永遠 403，連錯誤訊息都看不到。所有權與 record payload 是兩件事。
   */
  organizationId?: string;
  step?: string;                 // 目前執行到哪個步驟（給 UI 顯示進度）
  video?: { outputs: Record<string, string>; out_dir: string; outputMeta?: RenderOutputMeta };
  title?: string;
  error?: string;
  statusCode?: number;
  createdAt: number;
  // ── async 收尾用（prepare 後填；/status 輪詢 EU + 完成記錄）──
  euJobId?: string;              // EU video-service 的 render job id
  r2Keys?: string[];            // 本輪 Flux 暫存物件 key（render 完成後清）
  recordParams?: {
    title: string;
    sceneCount: number;
    organizationId: string;
    formats?: string[];
    visualBreakdown?: { custom: number; broll: number };
    imageModel?: string;
    source?: "generate" | "draft" | "footage";
    rendererKind?: "ffmpeg" | "remotion" | "footage";
    timelineId?: string;
    outputProfile?: string;
    captionCues?: Array<{ startMs: number; endMs: number; text: string }>;
    serviceCapability?: VideoServiceCapability;
  };
  recorded?: boolean;           // media_assets 已記錄（只記一次）
}

const TABLE = "video_jobs";
const TTL_MS = 60 * 60 * 1000; // 1h

// DB 列（snake_case）→ VideoJob（camelCase）。
function rowToJob(r: any): VideoJob {
  return {
    id: r.id,
    status: r.status,
    organizationId: r.organization_id ?? undefined,
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

/**
 * 建立一個 running job，回傳之（呼叫端拿 id）。id 在 node 端生成 → 不需 DB round-trip 取 id。
 *
 * `organizationId` 是**必填參數**（值可為 null）而非選填：它是 /api/video/status 的授權依據，
 * 漏傳會讓那道閘退化成裝飾。做成必填 → TypeScript 在編譯期強制每個呼叫端交代租戶身分，
 * 未來新增第三條建 job 的路徑時不可能「忘記」。
 *
 * @throws insert 失敗時拋出。**刻意不再靜默降級**（2026-08-26）：job 列不存在時 finishJob
 *   會更新 0 列、之後每一次 /status 都回 `job_not_found` —— 使用者看到「影片不見了」，而
 *   log 裡只有一行 console.warn。真實失敗來源有二：① migration 0060 未先於本程式碼套用
 *   （PostgREST 回 PGRST204，欄位不在 schema cache）② organizationId 不是合法 uuid。
 *   後者刻意讓**欄位型別**當驗證，不在此處複製第三份 uuid regex（既有兩份在
 *   video-pipeline.ts resolveOrgId 與 tools/designs isUuid）。兩種都必須大聲失敗。
 *
 *   `!supabase` 的 dev 降級保留 —— 那是「沒設定 service-role」而不是「寫入失敗」，語意不同。
 */
export async function createJob(organizationId: string | null): Promise<VideoJob> {
  const job: VideoJob = {
    id: randomUUID(),
    status: "running",
    organizationId: organizationId ?? undefined,
    createdAt: Date.now(),
  };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return job; // 無 service-role（理論上不會發生於 prod）→ 降級為 ephemeral，呼叫端仍可運作
  const { error } = await supabase
    .from(TABLE)
    .insert({ id: job.id, status: "running", organization_id: organizationId });
  if (error) throw new Error(`[job-store] createJob insert failed: ${error.message}`);
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

/**
 * 背景管線完成/失敗時更新 job（done 帶 video/title；error 帶 error/statusCode）。best-effort。
 *
 * **所有權不可變，且由型別強制**：`patch` 型別把 `organizationId` 排除在外。所有權在 createJob
 * 當下寫定；若這裡也能改 owner，「這個 job 屬於誰」就會有兩個寫入點，租戶閘讀到的答案取決於時序。
 * 用 `Omit<>` 而不是只寫註解 —— 註解擋不住下一個人「順手補上」，編譯器可以。
 */
export async function finishJob(
  id: string,
  patch: Omit<Partial<VideoJob>, "organizationId">,
): Promise<void> {
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
