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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 提交渲染給 video-service（async），短輪詢 /job 直到完成。
 * 為何不一次 POST 等到底：跨機長連線（數分鐘）回應易遺失。改「提交→即回 jobId→短輪詢」，
 * 每次呼叫都短（<30s），不持長連線。輪詢上限 ~12 分鐘。
 *
 * @param scenes  腳本場景陣列（id + narration）
 * @param assets  視覺素材路徑/URL 陣列（必須與 scenes 等長）
 * @param outName 輸出檔名前綴
 * @param baseUrl 服務基礎 URL，預設 VIDEO_SERVICE_URL 或 http://127.0.0.1:8732
 */
export async function callRenderService(
  scenes: RenderScene[],
  assets: string[],
  outName: string,
  baseUrl?: string
): Promise<RenderResult> {
  const base = baseUrl ?? process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.VIDEO_SERVICE_SECRET;
  if (token) headers["X-Render-Token"] = token;

  // 1) 提交 → 即回 jobId（202）
  let jobId: string;
  try {
    const res = await fetch(`${base}/render`, {
      method: "POST",
      headers,
      body: JSON.stringify({ scenes, assets, out_name: outName }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
    if (!res.ok || !body.jobId) {
      return { ok: false, status: res.status || 502, error: body.error ?? `提交渲染失敗（HTTP ${res.status}）` };
    }
    jobId = body.jobId;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, error: `無法連線到 video-service（${base}）：${msg}` };
  }

  // 2) 短輪詢 GET /job?jobId=（每 8s，上限 ~12 分鐘）
  const pollHeaders = token ? { "X-Render-Token": token } : undefined;
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(8_000);
    let job: { status?: string; outputs?: RenderOutputs; out_dir?: string; error?: string };
    try {
      const r = await fetch(`${base}/job?jobId=${encodeURIComponent(jobId)}`, {
        headers: pollHeaders,
        signal: AbortSignal.timeout(30_000),
      });
      job = (await r.json().catch(() => ({}))) as typeof job;
      if (r.status === 404) return { ok: false, status: 404, error: "render job 不存在（服務可能重啟）" };
    } catch {
      continue; // 暫時性網路錯 → 下一輪
    }
    if (job.status === "running") continue;
    if (job.status === "done") {
      if (!job.outputs || typeof job.out_dir !== "string") {
        return { ok: false, status: 502, error: "render done 但缺 outputs/out_dir" };
      }
      return { ok: true, outputs: job.outputs, out_dir: job.out_dir };
    }
    return { ok: false, status: 502, error: job.error ?? "render 失敗" };
  }
  return { ok: false, status: 504, error: "render 輪詢逾時（>12 分鐘）" };
}
