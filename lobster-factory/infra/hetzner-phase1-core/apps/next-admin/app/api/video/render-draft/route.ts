/**
 * POST /api/video/render-draft
 *
 * 接收使用者編輯後的草稿 scenes + 原始 imageUrls，提交 EU 渲染。
 * 立即回 202 + jobId；前端輪詢 POST /api/video/status?jobId= 取進度。
 *
 * Body: {
 *   scenes: { id: number; narration: string }[];
 *   imageUrls: string[];
 *   r2Keys: string[];
 *   title: string;
 *   ttsProvider?: string;
 *   ttsVoice?: string;
 *   introTitle?: string;
 *   introDuration?: number;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import type { VideoServiceCapability } from "@/lib/content/video/render-client";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { thenRun, withFeature } from "@/lib/entitlements/grant";

interface RenderDraftBody {
  scenes?: { id: number; narration: string }[];
  /** 舊單組（向後相容）：每場景一張圖。 */
  imageUrls?: string[];
  /** 多格式：每格式一組原生圖 URL（與 scenes 等長）。提供時取代 imageUrls。 */
  formatImageUrls?: Record<string, string[]>;
  /** 多格式：要輸出的格式（formatImageUrls 的鍵集）。 */
  formats?: string[];
  r2Keys?: string[];
  title?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
  /** VideoPipeline wizard 帶入的租戶（② 選租戶那步）。未帶時退回既有預設租戶解析，行為不變。 */
  organizationId?: string;
  /** 影片專案（V1.5）：必須屬於上面解析出的租戶，否則 403。 */
  projectId?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: RenderDraftBody;
  try {
    body = (await req.json()) as RenderDraftBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { scenes, imageUrls, formatImageUrls, formats: bodyFormats, r2Keys: clientR2Keys = [], title = "影片", organizationId: requestedOrganizationId } = body;

  // 租戶身分走 app 既有唯一解析器（同 generate route 與 designs/presets），非全域預設值。
  // 放在提交 EU 之前：無合法歸屬要在花掉渲染算力前擋下。
  // VideoPipeline wizard（② 選租戶）可明確帶 organizationId 覆蓋這個預設——2026-09-11 修：之前完全
  // 沒有這條路徑，wizard 選的租戶跟實際渲染落地的租戶對不上，導致⑦字幕/⑧QA/⑨Release 都找不到剛
  // 渲染好的素材（找的是 wizard 選的租戶，渲染卻落在預設租戶）。client 帳號仍被 effectiveOrgId 內部
  // 擋下、不能注入別人的租戶，只有 staff/operator/owner 才可能用 wizard 帶的值覆蓋預設。
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestedOrgId = typeof requestedOrganizationId === "string" && UUID_RE.test(requestedOrganizationId)
    ? requestedOrganizationId
    : undefined;
  const { resolveOrgId: resolveDefaultOrgId } = await import("@/lib/content/blocks/video-pipeline");
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, requestedOrgId ?? resolveDefaultOrgId()); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ ok: false, error: "scenes 為必填非空陣列" }, { status: 400 });
  }
  const projectId = body.projectId === undefined ? undefined : String(body.projectId);
  if (projectId !== undefined) {
    const { projectBelongsTo } = await import("@/lib/content/video/projects");
    if (!orgId || !(await projectBelongsTo(projectId, orgId))) return NextResponse.json({ ok: false, error: "project_not_in_organization" }, { status: 403 });
  }

  // 多格式（formatImageUrls + formats）vs 舊單組（imageUrls）。urlGroups 統一後續驗證/重導/傳遞。
  const useMulti =
    !!formatImageUrls && typeof formatImageUrls === "object" &&
    Array.isArray(bodyFormats) && bodyFormats.length > 0;
  const urlGroups: Record<string, string[]> = {};
  if (useMulti) {
    for (const f of bodyFormats!) {
      const arr = formatImageUrls![f];
      if (!Array.isArray(arr) || arr.length !== scenes.length) {
        return NextResponse.json({ ok: false, error: `formatImageUrls[${f}] 長度必須與 scenes 相同` }, { status: 400 });
      }
      urlGroups[f] = arr;
    }
  } else {
    if (!Array.isArray(imageUrls) || imageUrls.length !== scenes.length) {
      return NextResponse.json({ ok: false, error: "imageUrls 長度必須與 scenes 相同" }, { status: 400 });
    }
    urlGroups._single = imageUrls;
  }
  const allUrls = Object.values(urlGroups).flat();

  // Validate scene shape (prevent empty/garbage narration reaching TTS)
  for (const s of scenes) {
    if (typeof s.id !== "number" || typeof s.narration !== "string" || !s.narration.trim()) {
      return NextResponse.json({ ok: false, error: "scenes 每項須含 id(number) 和非空 narration(string)" }, { status: 400 });
    }
  }

  // Major: validate all asset URLs to our known origins — prevents using EU box as open fetch-proxy.
  // Assets come from: R2 designs bucket public base OR Pexels CDN. 多格式時驗每格式每張。
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const r2PublicBase = getDesignsPublicBase();
  const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const ALLOWED_HOSTS = new Set<string>([
    new URL(r2PublicBase).hostname,
    ...(R2_VIDEO_PUBLIC_BASE ? [new URL(R2_VIDEO_PUBLIC_BASE).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
    "player.vimeo.com",  // Pexels API 舊影片 host（Vimeo-sourced clips）
  ]);
  for (const url of allUrls) {
    try {
      const h = new URL(url).hostname;
      if (!ALLOWED_HOSTS.has(h)) {
        return NextResponse.json({ ok: false, error: `imageUrl 非允許的素材來源：${h}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: `imageUrl 格式無效：${url}` }, { status: 400 });
    }
  }

  // Major: don't trust client r2Keys for deletion — re-derive from all R2 imageUrls.
  // Only paths matching buildDesignKey format (designs/YYYY-MM/<uuid>.<ext>) should be deleted.
  const DESIGN_KEY_RE = /^designs\/\d{4}-\d{2}\/[0-9a-f-]+\.\w+$/i;
  const r2Keys: string[] = [];
  for (const url of allUrls) {
    try {
      const path = new URL(url).pathname.replace(/^\//, "");
      if (DESIGN_KEY_RE.test(path) && !r2Keys.includes(path)) r2Keys.push(path);
    } catch { /* skip */ }
  }
  // Also include any client keys that passed the design-key format check (belt-and-suspenders)
  for (const key of clientR2Keys) {
    if (DESIGN_KEY_RE.test(key) && !r2Keys.includes(key)) r2Keys.push(key);
  }

  const submit = async (): Promise<Response> => {
    const { createJob, finishJob } = await import("@/lib/content/video/job-store");

    // 收斂到 video/render 積木（D 接線）：本 route 仍負責素材 host 白名單 + r2Keys 重導（安全閘），
    // 僅把「提交 EU 渲染」這步委派給積木（submitRender 的單一入口）。
    await import("@/lib/content/blocks/register-all");
    const { byId } = await import("@/lib/content/blocks/registry");
    const render = byId("video/render");
    if (!render) {
      return NextResponse.json({ ok: false, error: "video/render 積木未註冊" }, { status: 500 });
    }
    const sub = (await render.run({
      scenes: scenes.map((s) => ({ id: s.id, narration: s.narration })),
      // 多格式 → 傳 formatAssets+formats（EU 原生多格式）；否則舊單組 assets。
      ...(useMulti ? { formatAssets: urlGroups, formats: bodyFormats } : { assets: imageUrls }),
      title,
      organizationId: orgId,   // 積木用來組帶租戶身分的 out_name
      ttsProvider: body.ttsProvider,
      ttsVoice: body.ttsVoice,
      introTitle: body.introTitle,
      introDuration: body.introDuration,
    })) as
      | { ok: true; jobId: string; serviceCapability?: VideoServiceCapability }
      | { ok: false; status: number; error: string };

    if (!sub.ok) {
      const err = sub as { ok: false; status: number; error: string };
      return NextResponse.json({ ok: false, error: err.error }, { status: err.status });
    }

    // orgId 已在提交 EU 之前解析（見上方 effectiveOrgId 區塊），此處寫進列 → /api/video/status
    // 的租戶閘有東西可讀（同 generate route；不可改用稍後的 recordParams，理由見 job-store.ts）。
    let job: Awaited<ReturnType<typeof createJob>>;
    try {
      job = await createJob(orgId);
    } catch (e: unknown) {
      // EU 渲染已於上方 render.run() 提交，這裡失敗＝「算力已花但沒有進度票」。刻意不試圖取消 EU：
      // 影片仍會落到 R2。**後盾只在 orgId 非 null 時成立** —— 那時 out_name 帶 org 前綴
      // （:147 傳入），對帳 sweep 反解得出擁有者並補記（reconcile.ts:95-98）；orgId 為 null 時
      // out_name 走 `noorg_` 分支，sweep 一律 fail-closed 跳過，影片會成為永久孤兒。
      // 另：本輪 r2Keys 也不會被 /status 清理（無 job 可掛），留給既有的 age-based 清理。
      // 回 500 讓失敗可見，不假裝成功。
      console.error("[video/render-draft] createJob failed (EU render already submitted):", e);
      return NextResponse.json(
        { ok: false, error: "無法建立影片工作（job 儲存失敗）；渲染仍在進行，稍後可於歷史紀錄查看" },
        { status: 500 },
      );
    }
    await finishJob(job.id, {
      status: "running",
      euJobId: sub.jobId,
      r2Keys,
      recordParams: orgId
        ? {
            title,
            sceneCount: scenes.length,
            organizationId: orgId,
            formats: useMulti ? bodyFormats : undefined,
            source: "draft",
            serviceCapability: sub.serviceCapability,
            ...(projectId ? { projectId } : {}),
          }
        : undefined,
    });

    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
  };
  // Paid narration is billed to the video's org (ADR 017 §0 代操), the one render-client meters; other voices ask nothing.
  return body.ttsProvider === "openai" ? withFeature("video.tts", thenRun, { org: () => orgId })(req, submit) : submit();
}
