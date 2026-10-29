import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import {
  isTarotModel,
  isAspectRatio,
  type TarotModel,
  type AspectRatio,
} from "@/lib/tarot/image-gen";
import { makeContentImage } from "@/lib/content/image/make-image";
import { imageCostUsd } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Content Studio image route — now DELEGATES to the shared image-gen toolkit (lib/tarot/image-gen.ts,
// the same 15-model combo-pack the Tarot tool uses) instead of hardcoding flux-schnell. This lets the
// Media Hub pick a model, apply a style preset, send a reference image (img2img) and pin a seed.
// The toolkit returns a `data:image/png;base64,…` URL; we persist that to R2 and hand back a stable
// public https URL as `imageUrl` (the 3 client consumers embed it into markdown / the hero slot and WP
// sideloads it at publish). Falls back to the data URL when R2 is unconfigured. HTTP 200 + ok:false on
// a generation failure so the client surfaces a friendly message instead of a network error.

// Platform presets carry only the human-readable label/size for the manual "社群圖片生成" panel and
// supply the DEFAULT aspect when an explicit one isn't passed. All `aspect` values below are members of
// the toolkit AspectRatio union, so they validate cleanly via isAspectRatio.
const PLATFORM_IMAGE_SPECS: Record<string, { label: string; width: number; height: number; aspect: AspectRatio; note: string }> = {
  instagram_square:    { label: "Instagram 方形貼文",   width: 1080, height: 1080, aspect: "1:1",  note: "1:1 通用貼文" },
  instagram_portrait:  { label: "Instagram 直式貼文",   width: 1080, height: 1350, aspect: "4:5",  note: "4:5 最大面積" },
  instagram_story:     { label: "Instagram 限時/Reels", width: 1080, height: 1920, aspect: "9:16", note: "9:16 全螢幕" },
  facebook_link:       { label: "Facebook 連結預覽",    width: 1200, height: 675,  aspect: "16:9", note: "16:9 連結縮圖" },
  facebook_square:     { label: "Facebook 方形貼文",    width: 1080, height: 1080, aspect: "1:1",  note: "1:1" },
  facebook_story:      { label: "Facebook 限時動態",    width: 1080, height: 1920, aspect: "9:16", note: "9:16" },
  twitter_post:        { label: "X/Twitter 貼文",       width: 1200, height: 675,  aspect: "16:9", note: "16:9 嵌入圖" },
  threads_square:      { label: "Threads 方形",         width: 1080, height: 1080, aspect: "1:1",  note: "1:1" },
  threads_portrait:    { label: "Threads 直式",         width: 1080, height: 1350, aspect: "4:5",  note: "4:5" },
  linkedin_post:       { label: "LinkedIn 貼文",        width: 1200, height: 675,  aspect: "16:9", note: "16:9" },
  pinterest_pin:       { label: "Pinterest Pin",        width: 1000, height: 1500, aspect: "2:3",  note: "2:3 直式最佳" },
  whatsapp_square:     { label: "WhatsApp 分享圖",      width: 1080, height: 1080, aspect: "1:1",  note: "1:1" },
  reddit_post:         { label: "Reddit 貼文縮圖",      width: 1200, height: 675,  aspect: "16:9", note: "16:9" },
  tiktok_thumbnail:    { label: "TikTok 封面",          width: 1080, height: 1920, aspect: "9:16", note: "9:16 封面圖" },
  youtube_thumbnail:   { label: "YouTube 縮圖",         width: 1280, height: 720,  aspect: "16:9", note: "16:9" },
};

const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_IMAGE_SPECS));

// Default model when none is supplied (legacy callers + the "replicate"/"none" sentinel) — keeps the
// previous behaviour (flux-schnell) byte-for-byte for any request that doesn't opt into a model.
const DEFAULT_MODEL: TarotModel = "flux-schnell";

// Reference-image (img2img) guards — mirror app/api/tools/tarot/generate/route.ts.
const MAX_REF_IMAGES = 5;
const MAX_REF_CHARS = 12_000_000; // ~9 MB decoded; one big reference photo
const REF_DATA_RE = /^data:image\/(?:png|jpe?g|webp);base64,/;

function friendlyError(code: string): string {
  switch (code) {
    case "missing_replicate_api_token": return "圖片服務未設定 Replicate 金鑰，請聯絡管理員";
    case "missing_openai_api_token":    return "OpenAI 圖片服務未設定金鑰，請改用其他模型";
    case "character_reference_required":return "此模型需要至少一張參考圖（img2img）";
    case "generation_timeout":          return "圖片生成逾時，請重試或改用較快的模型";
    case "output_too_large":            return "生成的圖片過大，請重試";
    case "output_url_not_allowed":      return "圖片來源不被允許（安全防護）";
    case "unknown_model":               return "未知的圖片模型";
    default:                            return `圖片生成失敗：${code}`;
  }
}

export const POST = withFeature("content.image", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const prompt = (typeof body.prompt === "string" ? body.prompt : "").trim();
  if (!prompt) return new NextResponse("prompt required", { status: 400 });

  const platform = typeof body.platform === "string" ? body.platform : "instagram_square";
  const spec = VALID_PLATFORMS.has(platform)
    ? PLATFORM_IMAGE_SPECS[platform]
    : PLATFORM_IMAGE_SPECS.instagram_square;

  // Model: explicit > legacy "replicate"/"none"/absent → flux-schnell. An unknown but non-empty model
  // string is a client bug → 400 so it surfaces instead of silently falling back.
  const rawModel = typeof body.model === "string" ? body.model : "";
  let model: TarotModel;
  if (rawModel === "" || rawModel === "replicate" || rawModel === "none") {
    model = DEFAULT_MODEL;
  } else if (isTarotModel(rawModel)) {
    model = rawModel;
  } else {
    return NextResponse.json({ ok: false, error: "invalid_model" }, { status: 400 });
  }

  // Aspect ratio: explicit valid > platform default (already an AspectRatio) > 16:9.
  const aspectRatio: AspectRatio = isAspectRatio(body.aspectRatio)
    ? body.aspectRatio
    : (isAspectRatio(spec.aspect) ? spec.aspect : "16:9");

  // Seed (reproducible / fixed style) — non-negative integer only; otherwise random (null).
  const seed = Number.isInteger(body.seed) && (body.seed as number) >= 0 ? (body.seed as number) : null;

  // Reference images (img2img). Optional; only validate when present.
  let referenceImages: string[] | undefined;
  if (Array.isArray(body.referenceImages) && body.referenceImages.length > 0) {
    const refs = body.referenceImages.filter((r): r is string => typeof r === "string");
    if (refs.length > MAX_REF_IMAGES) {
      return NextResponse.json({ ok: false, error: `最多 ${MAX_REF_IMAGES} 張參考圖` }, { status: 400 });
    }
    for (const r of refs) {
      if (!REF_DATA_RE.test(r)) {
        return NextResponse.json({ ok: false, error: "參考圖格式須為 png/jpg/webp 的 data URL" }, { status: 400 });
      }
      if (r.length > MAX_REF_CHARS) {
        return NextResponse.json({ ok: false, error: "參考圖過大（上限約 9MB）" }, { status: 413 });
      }
    }
    if (refs.length > 0) referenceImages = refs;
  }

  const result = await makeContentImage({
    model, prompt, aspectRatio, seed, referenceImages,
    imageStyle: typeof body.imageStyle === "string" ? body.imageStyle : "",
    titleText: typeof body.titleText === "string" ? body.titleText.trim() : "",
    featuredImageFont: typeof body.featuredImageFont === "string" ? body.featuredImageFont.trim() : "sans",
    featuredImageTitlePosition: typeof body.featuredImageTitlePosition === "string" ? body.featuredImageTitlePosition.trim() : "bottom",
    costLog: { route: "content/image", tool: "content", jobId: typeof body._jobId === "string" ? body._jobId : null },
  }, grant);
  if (!result.ok) {
    const code = (result as { ok: false; code: string }).code;
    return NextResponse.json({ ok: false, error: friendlyError(code), code }, { status: 200 });
  }
  const imageUrl = result.imageUrl;

  const costUsd = imageCostUsd(model);

  return NextResponse.json({
    ok: true,
    imageUrl,
    model,
    platform,
    aspectRatio,
    seed: result.seed,
    spec: { label: spec.label, width: spec.width, height: spec.height, aspect: aspectRatio, note: spec.note },
    cost_usd: costUsd,
  });
}

// GET: return platform specs reference (no auth needed for spec list)
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, platforms: PLATFORM_IMAGE_SPECS });
}
