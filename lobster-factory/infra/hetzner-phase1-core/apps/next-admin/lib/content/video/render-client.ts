/**
 * render-client.ts — 呼叫 Python video-service 的 /render 端點。
 *
 * 本模組只做 HTTP 包裝，不做任何渲染邏輯。
 * video-service 負責 TTS + ffmpeg 合成；本模組只傳資料、接結果。
 */

/** /render POST body 的場景格式（最小需求；duration 由服務端計算）。 */
interface RenderScene {
  id: number;
  narration: string;
}

/** /render 成功回應的 outputs 結構（各平台輸出路徑）。 */
export type RenderOutputs = Record<string, string>;

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
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const token = process.env.VIDEO_SERVICE_SECRET;
  if (token) h["X-Render-Token"] = token;
  return h;
}

const svcBase = (baseUrl?: string) => baseUrl ?? process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732";

/**
 * 提交渲染給 EU video-service（一次短請求，不等渲染）。回 EU 端 jobId。
 * 渲染在 EU 自己的背景 thread 跑（持久），由 /status 輪詢 — next-admin 不做任何背景工作。
 */
export interface RenderOpts {
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
}

export async function submitRender(
  scenes: RenderScene[],
  assets: string[],
  outName: string,
  baseUrl?: string,
  opts?: RenderOpts,
): Promise<{ ok: true; jobId: string } | { ok: false; status: number; error: string }> {
  const base = svcBase(baseUrl);
  try {
    const res = await fetch(`${base}/render`, {
      method: "POST",
      headers: svcHeaders(true),
      body: JSON.stringify({
        scenes, assets, out_name: outName,
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
    return { ok: true, jobId: body.jobId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, error: `無法連線到 video-service（${base}）：${msg}` };
  }
}

export type RenderPoll =
  | { status: "running" }
  | { status: "done"; outputs: RenderOutputs; out_dir: string }
  | { status: "error"; error: string };

/** 查一次 EU /job 狀態（單一短請求，給 /status 每輪呼叫；不阻塞、不輪詢）。 */
export async function pollRenderJob(jobId: string, baseUrl?: string): Promise<RenderPoll> {
  const base = svcBase(baseUrl);
  try {
    const r = await fetch(`${base}/job?jobId=${encodeURIComponent(jobId)}`, {
      headers: svcHeaders(false),
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status === 404) return { status: "error", error: "render job 不存在（服務可能重啟）" };
    const job = (await r.json().catch(() => ({}))) as { status?: string; outputs?: RenderOutputs; out_dir?: string; error?: string };
    if (job.status === "done") {
      if (!job.outputs || typeof job.out_dir !== "string") return { status: "error", error: "render done 但缺 outputs/out_dir" };
      return { status: "done", outputs: job.outputs, out_dir: job.out_dir };
    }
    if (job.status === "error") return { status: "error", error: job.error ?? "render 失敗" };
    return { status: "running" };
  } catch {
    return { status: "running" }; // 暫時性網路錯 → 視為仍進行，下輪再查
  }
}
