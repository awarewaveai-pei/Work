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
export async function callRenderService(
  scenes: RenderScene[],
  assets: string[],
  outName: string,
  baseUrl?: string
): Promise<RenderResult> {
  const base = baseUrl ?? process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732";
  const url = `${base}/render`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes, assets, out_name: outName }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 503, error: `無法連線到 video-service（${base}）：${msg}` };
  }

  // 嘗試解析回應 JSON（成功或錯誤都是 JSON）
  let body: { outputs?: RenderOutputs; out_dir?: string; error?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: `video-service 回傳非 JSON（HTTP ${res.status}）`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body.error ?? `video-service 回傳 HTTP ${res.status}`,
    };
  }

  if (!body.outputs || typeof body.out_dir !== "string") {
    return {
      ok: false,
      status: 502,
      error: "video-service 回傳缺少 outputs 或 out_dir 欄位",
    };
  }

  return { ok: true, outputs: body.outputs, out_dir: body.out_dir };
}
