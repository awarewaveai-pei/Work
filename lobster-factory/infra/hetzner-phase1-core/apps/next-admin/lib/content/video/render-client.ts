/**
 * render-client.ts — 呼叫 Python video-service 的 /render 端點。
 *
 * 本模組只做 HTTP 包裝，不做任何渲染邏輯。
 * video-service 負責 TTS + ffmpeg 合成；本模組只傳資料、接結果。
 */
import { optionalRendererAuthHeaders, resolveRendererAuth } from "./renderer-auth";

/** /render POST body 的場景格式（最小需求；duration 由服務端計算）。 */
interface RenderScene {
  id: number;
  narration: string;
}

/** /render 成功回應的 outputs 結構（各平台輸出路徑）。 */
export type RenderOutputs = Record<string, string>;
export type RenderOutputMeta = Record<string, {
  width: number;
  height: number;
  expected_width?: number;
  expected_height?: number;
}>;

export interface VideoServiceCapability {
  native_multiformat: boolean;
  format_assets: boolean;
  output_dimensions: boolean;
  openai_tts?: boolean;
  formats: string[];
}

export type RenderResult =
  | { ok: true; outputs: RenderOutputs; out_dir: string }
  | { ok: false; status: number; error: string };

/**
 * POST scenes + assets 到 video-service /render，等待完成後回傳輸出路徑。
 *
 * @param scenes  腳本場景陣列（id + narration）
 * @param assets  視覺素材路徑/URL 陣列（必須與 scenes 等長）
 * @param outName 輸出檔名前綴（例：影片標題）
 * @param baseUrl 服務基礎 URL，預設 VIDEO_SERVICE_URL 環境變數或 http://127.0.0.1:8732
 */
function svcHeaders(json: boolean): Record<string, string> {
  const h: Record<string, string> = { ...optionalRendererAuthHeaders("quick") };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const svcBase = (baseUrl?: string) => baseUrl ?? process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732";

async function assertNativeMultiformat(base: string, formats: string[]): Promise<{ ok: true; capability: VideoServiceCapability } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${base}/health`, {
      headers: svcHeaders(false),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      capabilities?: { native_multiformat?: boolean; format_assets?: boolean; output_dimensions?: boolean; openai_tts?: boolean };
      formats?: string[];
    };
    const serviceFormats = new Set(body.formats ?? []);
    const supportsFormats = formats.every((fmt) => serviceFormats.has(fmt));
    if (
      r.ok &&
      body.ok &&
      body.capabilities?.native_multiformat &&
      body.capabilities?.format_assets &&
      body.capabilities?.output_dimensions &&
      supportsFormats
    ) {
      return {
        ok: true,
        capability: {
          native_multiformat: true,
          format_assets: true,
          output_dimensions: true,
          formats: body.formats ?? [],
        },
      };
    }
  } catch {
    // Return the same actionable error below; render would fail or silently fall back on old services.
  }
  return {
    ok: false,
    error: "video-service 尚未部署原生多比例版本（需 /health 回報 native_multiformat + format_assets + output_dimensions）。請先更新 EU video-service 後再輸出多比例。",
  };
}

/**
 * 提交渲染給 EU video-service（一次短請求，不等渲染）。回 EU 端 jobId。
 * 渲染在 EU 自己的背景 thread 跑（持久），由 /status 輪詢 — next-admin 不做任何背景工作。
 */
export interface RenderOpts {
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
  /**
   * 多格式原生輸出：每格式一組素材 URL（每組長度須與 scenes 等長）。
   * 提供（且 formats 非空）時 body 送 `format_assets` + `formats`，EU 走 render_video_multiformat
   * （每格式各自原生 compose、無 pad）；此時位置參數 `assets` 被忽略。
   * 省略 → 舊單組 `assets` 路徑（EU base+pad export，向後相容）。
   */
  formatAssets?: Record<string, string[]>;
  /** 要輸出的格式（如 ["16x9","9x16","4x5"]）；formatAssets 的鍵集。 */
  formats?: string[];
}

export async function submitRender(
  scenes: RenderScene[],
  assets: string[],
  outName: string,
  baseUrl?: string,
  opts?: RenderOpts,
): Promise<{ ok: true; jobId: string; serviceCapability?: VideoServiceCapability } | { ok: false; status: number; error: string }> {
  const base = svcBase(baseUrl);
  const auth = resolveRendererAuth("quick");
  if (auth.ok === false) {
    return { ok: false, status: 503, error: "renderer authentication is not configured" };
  }
  // 多格式：formatAssets + 非空 formats → 送 format_assets（EU 原生多格式）；否則送舊單組 assets。
  const useMulti = !!opts?.formatAssets && Array.isArray(opts?.formats) && opts.formats.length > 0;
  let serviceCapability: VideoServiceCapability | undefined;
  if (useMulti) {
    const capability = await assertNativeMultiformat(base, opts!.formats!);
    if (capability.ok === false) return { ok: false, status: 503, error: capability.error };
    serviceCapability = capability.capability;
  }
  try {
    const res = await fetch(`${base}/render`, {
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        scenes, out_name: outName,
        ...(useMulti
          ? {
              format_assets: opts!.formatAssets,
              formats: opts!.formats,
              require_native_multiformat: true,
            }
          : { assets }),
        ...(opts?.ttsProvider && { tts_provider: opts.ttsProvider }),
        ...(opts?.ttsVoice && { tts_voice: opts.ttsVoice }),
        ...(opts?.introTitle && { intro_title: opts.introTitle }),
        ...(opts?.introDuration && { intro_duration: opts.introDuration }),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!res.ok || !body.jobId) {
      return { ok: false, status: res.status || 502, error: body.error ?? `提交渲染失敗（HTTP ${res.status}）` };
    }
    return { ok: true, jobId: body.jobId, serviceCapability };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, error: `無法連線到 video-service（${base}）：${msg}` };
  }
}

/** /render-footage POST body 的素材片段（確切 in/out 時間，非 TTS 驅動）。 */
export interface FootageClip {
  source_url: string;
  source_start_ms: number;
  duration_ms: number;
}
/** 選填的整段時間軸音軌，提供時取代各 clip 自帶的音軌。 */
export interface FootageAudio {
  source_url: string;
  source_start_ms: number;
  duration_ms: number;
}
/** 選填的絕對時間字幕 cue。 */
export interface FootageCaption {
  start_ms: number;
  end_ms: number;
  text: string;
}
export interface FootageRenderOpts {
  audio?: FootageAudio;
  captions?: FootageCaption[];
}

async function assertFootageRenderCapability(base: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${base}/health`, {
      headers: svcHeaders(false),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      capabilities?: { footage_render?: boolean };
    };
    if (r.ok && body.ok && body.capabilities?.footage_render) return { ok: true };
  } catch {
    // Return the same actionable error below; render would fail or 404 on old services.
  }
  return {
    ok: false,
    error: "video-service 尚未部署實拍剪輯能力（需 /health 回報 footage_render）。請先更新 EU video-service 後再送實拍渲染。",
  };
}

/**
 * 提交實拍素材剪輯渲染給 EU video-service（trim+concat，非 TTS 驅動；一次短請求，不等渲染）。
 * 回 EU 端 jobId，輪詢沿用 pollRenderJob（同一組 /job 端點與 job 結構）。
 */
export async function submitFootageRender(
  clips: FootageClip[],
  formats: string[],
  outName: string,
  baseUrl?: string,
  opts?: FootageRenderOpts,
): Promise<{ ok: true; jobId: string } | { ok: false; status: number; error: string }> {
  const base = svcBase(baseUrl);
  const auth = resolveRendererAuth("quick");
  if (auth.ok === false) {
    return { ok: false, status: 503, error: "renderer authentication is not configured" };
  }
  const capability = await assertFootageRenderCapability(base);
  if (capability.ok === false) return { ok: false, status: 503, error: capability.error };
  try {
    const res = await fetch(`${base}/render-footage`, {
      method: "POST",
      headers: { ...auth.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        clips, formats, out_name: outName,
        ...(opts?.audio && { audio: opts.audio }),
        ...(opts?.captions && opts.captions.length > 0 && { captions: opts.captions }),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!res.ok || !body.jobId) {
      return { ok: false, status: res.status || 502, error: body.error ?? `提交實拍渲染失敗（HTTP ${res.status}）` };
    }
    return { ok: true, jobId: body.jobId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, error: `無法連線到 video-service（${base}）：${msg}` };
  }
}

export type RenderPoll =
  | { status: "running" }
  | { status: "done"; outputs: RenderOutputs; out_dir: string; outputMeta?: RenderOutputMeta; storage?: string }
  | { status: "error"; error: string };

/** 查一次 EU /job 狀態（單一短請求，給 /status 每輪呼叫；不阻塞、不輪詢）。 */
export async function pollRenderJob(jobId: string, baseUrl?: string): Promise<RenderPoll> {
  const base = svcBase(baseUrl);
  const auth = resolveRendererAuth("quick");
  if (auth.ok === false) return { status: "error", error: "renderer authentication is not configured" };
  try {
    const r = await fetch(`${base}/job?jobId=${encodeURIComponent(jobId)}`, {
      headers: auth.headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status === 404) return { status: "error", error: "render job 不存在（服務可能重啟）" };
    const job = (await r.json().catch(() => ({}))) as {
      status?: string;
      outputs?: RenderOutputs;
      out_dir?: string;
      output_meta?: RenderOutputMeta;
      storage?: string;
      error?: string;
    };
    if (job.status === "done") {
      if (!job.outputs || typeof job.out_dir !== "string") return { status: "error", error: "render done 但缺 outputs/out_dir" };
      return { status: "done", outputs: job.outputs, out_dir: job.out_dir, outputMeta: job.output_meta, storage: job.storage };
    }
    if (job.status === "error") return { status: "error", error: job.error ?? "render 失敗" };
    return { status: "running" };
  } catch {
    return { status: "running" }; // 暫時性網路錯 → 視為仍進行，下輪再查
  }
}
