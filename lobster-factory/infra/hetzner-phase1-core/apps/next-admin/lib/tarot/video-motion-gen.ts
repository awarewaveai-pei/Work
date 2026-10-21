/**
 * video-motion-gen.ts — image-to-video（把一張靜態圖變成有真實動態的短片）。
 *
 * 為什麼獨立一個檔案，不塞進 image-gen.ts：輸出型別不同（video buffer 非 base64 image），
 * 且生成時間量級不同（image-gen.ts 的 58s 逾時打底是給圖片用；影片生成常態 30s-3min，
 * 需要更長的逾時預算，硬塞同一個 GEN_TIMEOUT_MS 會誤殺正常在跑的影片工作）。
 *
 * 三個 vendor 皆走 Replicate（2026-09-12 直接查 API schema + 頁面定價確認，非猜測）：
 *   - Runway Gen-4 Turbo：input_image 欄位叫 "image"
 *   - Luma Ray 2 / Ray Flash 2：叫 "start_image"
 *   - Google Veo 3.1 / 3.1 Fast：叫 "image"（另有 generate_audio，關掉——旁白配音另外做，
 *     Veo 自己生的音軌用不到只會浪費且可能跟 TTS 對不上嘴形時間軸）
 */

import { fetchWithRetry429, REPLICATE_POLL_MS, isAllowedOutputUrl } from "./image-gen";
import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";

const GEN_TIMEOUT_MS = 280_000; // 留在 nginx app.aware-wave.com /api/ 的 proxy_read_timeout 300s 內
// 影片比圖片檔案大很多（5-8s 720p 常見 5-20MB）；20MB（image-gen.ts 的圖片上限）太緊，但box 本來就
// 記憶體有限，不能無上限緩衝——80MB 給足常見畫質餘裕，同時仍是硬上限（串流邊讀邊擋，不會整包超額才發現）。
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** 簡易併發限制器（不新增套件依賴）：把 tasks 依 limit 併發跑完，回傳依原順序的結果陣列。 */
async function runWithConcurrency<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

export type VideoMotionModel =
  | "runway-gen4-turbo"
  | "luma-ray-flash-2"
  | "luma-ray-2"
  | "veo-3-1-fast"
  | "veo-3-1";

export function isVideoMotionModel(v: unknown): v is VideoMotionModel {
  return v === "runway-gen4-turbo" || v === "luma-ray-flash-2" || v === "luma-ray-2" || v === "veo-3-1-fast" || v === "veo-3-1";
}

interface MotionConfig {
  slug: string;
  defaultDurationSec: number;
  buildInput: (opts: { imageUrl: string; prompt: string; aspectRatio: "16:9" | "9:16"; durationSec: number }) => Record<string, unknown>;
}

const MOTION_MODELS: Record<VideoMotionModel, MotionConfig> = {
  "runway-gen4-turbo": {
    slug: "runwayml/gen4-turbo",
    defaultDurationSec: 5,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec,
    }),
  },
  "luma-ray-flash-2": {
    slug: "luma/ray-flash-2-720p",
    defaultDurationSec: 5,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      start_image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec,
    }),
  },
  "luma-ray-2": {
    slug: "luma/ray-2-720p",
    defaultDurationSec: 5,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      start_image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec,
    }),
  },
  "veo-3-1-fast": {
    slug: "google/veo-3.1-fast",
    defaultDurationSec: 8,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec, generate_audio: false,
    }),
  },
  "veo-3-1": {
    slug: "google/veo-3.1",
    defaultDurationSec: 8,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec, generate_audio: false,
    }),
  },
};

export type VideoMotionOutcome =
  | { ok: true; buffer: Buffer; mime: string }
  | { ok: false; error: string };

/**
 * 把一張已存在的圖片（我們自己 R2 上的 URL）丟給 image-to-video 模型，換一段有真實動態的短片。
 * @param imageUrl     起始畫面（第一幀）。必須是模型可公開抓取的 URL（R2 public URL 符合）。
 * @param motionPrompt 動作/運鏡描述（英文，跟生圖 prompt 分開——生圖 prompt 描述畫面內容，
 *                     這裡描述「畫面接下來怎麼動」，兩者疊加效果比同一句話硬用兩次更好）。
 */
export async function generateVideoMotion(
  grant: Grant,
  model: VideoMotionModel,
  imageUrl: string,
  motionPrompt: string,
  aspectRatio: "16:9" | "9:16" = "16:9",
): Promise<VideoMotionOutcome> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { ok: false, error: "missing_replicate_api_token" };
  const config = MOTION_MODELS[model];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    const input = config.buildInput({ imageUrl, prompt: motionPrompt, aspectRatio, durationSec: config.defaultDurationSec });
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait" };
    const createRes = await fetchWithRetry429(providerUrl(grant, "replicate", `/v1/models/${config.slug}/predictions`), {
      method: "POST", headers, body: JSON.stringify({ input }), signal: controller.signal,
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => "");
      console.error(`[video-motion] ${config.slug} create failed`, createRes.status, detail.slice(0, 500));
      return { ok: false, error: `replicate_${createRes.status}` };
    }

    let prediction = (await createRes.json()) as { status: string; output?: string[] | string; error?: string; urls?: { get?: string } };
    while (prediction.status === "starting" || prediction.status === "processing") {
      if (!prediction.urls?.get) break;
      await new Promise((r) => setTimeout(r, REPLICATE_POLL_MS));
      const pollRes = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
      if (!pollRes.ok) return { ok: false, error: `replicate_poll_${pollRes.status}` };
      prediction = await pollRes.json();
    }

    if (prediction.status !== "succeeded") {
      console.error(`[video-motion] ${config.slug} not succeeded`, prediction.status, prediction.error ?? "");
      return { ok: false, error: `replicate_${prediction.status}` };
    }
    const outUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outUrl) return { ok: false, error: "replicate_empty_output" };
    // SSRF 防線同 image-gen.ts：只信 Replicate 自己的 delivery host（雖然 outUrl 來自 Replicate JSON
    // 回應非直接使用者輸入，仍照既有慣例守，不因「來源看起來安全」就跳過。
    if (!isAllowedOutputUrl(outUrl)) return { ok: false, error: "output_url_not_allowed" };

    const fileRes = await fetch(outUrl, { signal: controller.signal });
    if (!fileRes.ok) return { ok: false, error: `replicate_download_${fileRes.status}` };
    if (Number(fileRes.headers.get("content-length") ?? "0") > MAX_VIDEO_BYTES) return { ok: false, error: "output_too_large" };
    // 串流邊讀邊擋上限（image-gen.ts urlToDataUrl 同款理由）：content-length 在 chunked 回應可能缺，
    // 不能整包 buffer 完才檢查，box 記憶體有限。
    const reader = fileRes.body?.getReader();
    if (!reader) return { ok: false, error: "no_response_body" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_VIDEO_BYTES) { await reader.cancel(); return { ok: false, error: "output_too_large" }; }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    // 正規化 content-type（同 image-gen.ts 慣例）：後續 buildDesignKey 用精確字串比對 MIME_EXT，
    // "video/mp4; codecs=avc1" 這種帶參數的 content-type 沒正規化會查不到副檔名，白花這次生成費用。
    const mime = (fileRes.headers.get("content-type") || "video/mp4").split(";")[0].trim().toLowerCase();
    return { ok: true, buffer, mime };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, error: "video_motion_timeout" };
    return { ok: false, error: e instanceof Error ? e.message : "video_motion_failed" };
  } finally {
    clearTimeout(timer);
  }
}

export interface VideoMotionJob {
  imageUrl: string;
  motionPrompt: string;
  aspectRatio?: "16:9" | "9:16";
}

/**
 * 併發限制（固定 3）批次跑多個 generateVideoMotion——單一入口，呼叫端不准自己 Promise.all
 * 這個函式：影片模型的併發上限比圖片緊很多，帳號額度不足時 burst=1（image-gen.ts:380 註解），
 * 無上限 Promise.all 會讓多數場景 429 兩次後直接靜默降級回靜態圖，使用者付了心力設定動態卻大半
 * 沒生效。回傳陣列順序與輸入 jobs 相同，供呼叫端用索引對回各自的場景/格式。
 */
/** The caller asks for its own feature (video asks video.motion). */
export async function generateVideoMotionBatch(grant: Grant, model: VideoMotionModel, jobs: VideoMotionJob[]): Promise<VideoMotionOutcome[]> {
  const MOTION_CONCURRENCY = 3;
  return runWithConcurrency(MOTION_CONCURRENCY, jobs.map((job) => () =>
    generateVideoMotion(grant, model, job.imageUrl, job.motionPrompt, job.aspectRatio ?? "16:9"),
  ));
}
