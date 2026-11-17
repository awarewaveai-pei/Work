/**
 * Sending a draft (scenes + one image or clip per scene) to our render service: the one code path behind the staff
 * route /api/video/render-draft and the workbench's 快速輸出 (/api/internal/video/workbench/quick-render, plan U5).
 * The caller authorizes the org, validates the scenes and decides which input objects may be deleted afterwards;
 * this module checks the asset hosts and submits. Finishing is /api/video/status -> finalize.ts (job-store row).
 */
import type { RenderBookends, VideoServiceCapability } from "./render-client";
import type { RightsSource } from "./asset-origin";

/**
 * Asset urls the render service may fetch: our R2 designs and video buckets, Pexels. Anything else would make the
 * render box an open fetch proxy. Returns the refusal message, or null when every url passes.
 */
export async function renderAssetHostError(urls: string[]): Promise<string | null> {
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const videoBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const allowed = new Set<string>([
    new URL(getDesignsPublicBase()).hostname,
    ...(videoBase ? [new URL(videoBase).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
    "player.vimeo.com", // Pexels API 舊影片 host（Vimeo-sourced clips）
  ]);
  for (const url of urls) {
    let host: string;
    try { host = new URL(url).hostname; } catch { return `imageUrl 格式無效：${url}`; }
    if (!allowed.has(host)) return `imageUrl 非允許的素材來源：${host}`;
  }
  return null;
}

export interface DraftRender {
  organizationId: string | null;
  scenes: { id: number; narration: string }[];
  /** One asset per scene (single set), or one set per format with `formats` (native multi-ratio render). */
  assets?: string[];
  formatAssets?: Record<string, string[]>;
  formats?: string[];
  title: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
  /** Plan U5.4: intro / outro / transition joined by the service (multi-format only); asset urls already host-checked. */
  bookends?: RenderBookends;
  /** Input objects deleted once the render finished (finalize.ts); [] = delete nothing. */
  r2Keys: string[];
  rightsSources: RightsSource[];
  /** media_production_projects.id, already checked to belong to organizationId. */
  projectId?: string;
  autoRunId?: string;
}

/** Submits the render and records its job row (running, with the record payload). 202-style answer: the job id. */
export async function submitDraftRender(p: DraftRender): Promise<{ ok: true; jobId: string } | { ok: false; status: number; error: string }> {
  const { createJob, finishJob } = await import("./job-store");
  const multi = !!p.formatAssets && Array.isArray(p.formats) && p.formats.length > 0;

  // 收斂到 video/render 積木（D 接線）：提交 EU 渲染委派給積木（submitRender 的單一入口）。
  await import("@/lib/content/blocks/register-all");
  const { byId } = await import("@/lib/content/blocks/registry");
  const render = byId("video/render");
  if (!render) return { ok: false, status: 500, error: "video/render 積木未註冊" };
  const sub = (await render.run({
    scenes: p.scenes.map((s) => ({ id: s.id, narration: s.narration })),
    // 多格式 → 傳 formatAssets+formats（EU 原生多格式）；否則舊單組 assets。
    ...(multi ? { formatAssets: p.formatAssets, formats: p.formats } : { assets: p.assets }),
    title: p.title,
    organizationId: p.organizationId,   // 積木用來組帶租戶身分的 out_name
    ttsProvider: p.ttsProvider,
    ttsVoice: p.ttsVoice,
    introTitle: p.introTitle,
    introDuration: p.introDuration,
    ...(p.bookends ? { bookends: p.bookends } : {}),
  })) as
    | { ok: true; jobId: string; serviceCapability?: VideoServiceCapability }
    | { ok: false; status: number; error: string };
  if (sub.ok === false) return { ok: false, status: sub.status, error: sub.error };

  // organizationId 寫進列 → /api/video/status 的租戶閘有東西可讀（不可改用稍後的 recordParams，理由見 job-store.ts）。
  let job: Awaited<ReturnType<typeof createJob>>;
  try {
    job = await createJob(p.organizationId);
  } catch (e: unknown) {
    // EU 渲染已提交，這裡失敗＝「算力已花但沒有進度票」。刻意不試圖取消 EU：影片仍會落到 R2。
    // 後盾只在 organizationId 非 null 時成立 —— out_name 帶 org 前綴，對帳 sweep 反解得出擁有者並補記
    // （reconcile.ts）；null 時 out_name 走 `noorg_` 分支，sweep 一律 fail-closed 跳過，影片會成為永久孤兒。
    // 本輪 r2Keys 也不會被清理（無 job 可掛），留給既有的 age-based 清理。回 500 讓失敗可見，不假裝成功。
    console.error("[video/draft-render] createJob failed (EU render already submitted):", e);
    return { ok: false, status: 500, error: "無法建立影片工作（job 儲存失敗）；渲染仍在進行，稍後可於歷史紀錄查看" };
  }
  await finishJob(job.id, {
    status: "running",
    euJobId: sub.jobId,
    r2Keys: p.r2Keys,
    recordParams: p.organizationId
      ? {
          title: p.title,
          sceneCount: p.scenes.length,
          rightsSources: p.rightsSources,
          script: p.scenes.map((s) => s.narration).join("\n"),
          organizationId: p.organizationId,
          formats: multi ? p.formats : undefined,
          source: "draft",
          serviceCapability: sub.serviceCapability,
          ...(p.projectId ? { projectId: p.projectId } : {}),
          ...(p.autoRunId ? { autoRunId: p.autoRunId } : {}),
        }
      : undefined,
  });
  return { ok: true, jobId: job.id };
}
