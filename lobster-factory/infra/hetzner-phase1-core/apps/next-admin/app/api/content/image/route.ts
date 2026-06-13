import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Platform presets for social media images
const PLATFORM_IMAGE_SPECS: Record<string, { label: string; width: number; height: number; note: string }> = {
  instagram_square:    { label: "Instagram 方形貼文",   width: 1080, height: 1080, note: "1:1 通用貼文" },
  instagram_portrait:  { label: "Instagram 直式貼文",   width: 1080, height: 1350, note: "4:5 最大面積" },
  instagram_story:     { label: "Instagram 限時/Reels", width: 1080, height: 1920, note: "9:16 全螢幕" },
  facebook_link:       { label: "Facebook 連結預覽",    width: 1200, height: 630,  note: "1.91:1 連結縮圖" },
  facebook_square:     { label: "Facebook 方形貼文",    width: 1080, height: 1080, note: "1:1" },
  facebook_story:      { label: "Facebook 限時動態",    width: 1080, height: 1920, note: "9:16" },
  twitter_post:        { label: "X/Twitter 貼文",       width: 1200, height: 675,  note: "16:9 嵌入圖" },
  threads_square:      { label: "Threads 方形",         width: 1080, height: 1080, note: "1:1" },
  threads_portrait:    { label: "Threads 直式",         width: 1080, height: 1350, note: "4:5" },
  linkedin_post:       { label: "LinkedIn 貼文",        width: 1200, height: 627,  note: "1.91:1" },
  pinterest_pin:       { label: "Pinterest Pin",        width: 1000, height: 1500, note: "2:3 直式最佳" },
  whatsapp_square:     { label: "WhatsApp 分享圖",      width: 1080, height: 1080, note: "1:1" },
  reddit_post:         { label: "Reddit 貼文縮圖",      width: 1200, height: 628,  note: "1.91:1" },
  tiktok_thumbnail:    { label: "TikTok 封面",          width: 1080, height: 1920, note: "9:16 封面圖" },
  youtube_thumbnail:   { label: "YouTube 縮圖",         width: 1280, height: 720,  note: "16:9" },
};

const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_IMAGE_SPECS));

// Replicate Flux Schnell — fast, cheap, good for social graphics
const REPLICATE_MODEL = "black-forest-labs/flux-schnell";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string[];
  error?: string;
}

async function waitForPrediction(
  id: string,
  token: string,
  maxWaitMs = 90_000,
): Promise<ReplicatePrediction> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as ReplicatePrediction;
    if (data.status === "succeeded" || data.status === "failed" || data.status === "canceled") {
      return data;
    }
  }
  throw new Error("Replicate prediction timed out");
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const replicateToken = process.env.REPLICATE_API_TOKEN;
  if (!replicateToken) return new NextResponse("REPLICATE_API_TOKEN not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const prompt = (typeof body.prompt === "string" ? body.prompt : "").trim();
  if (!prompt) return new NextResponse("prompt required", { status: 400 });

  const platform = typeof body.platform === "string" ? body.platform : "instagram_square";
  const spec = VALID_PLATFORMS.has(platform)
    ? PLATFORM_IMAGE_SPECS[platform]
    : PLATFORM_IMAGE_SPECS.instagram_square;

  // Enhance prompt for social media context
  const enhancedPrompt = `${prompt}, professional social media graphic, high quality, clean composition, no text overlay`;

  // Start Replicate prediction
  const createRes = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replicateToken}`,
      "Content-Type": "application/json",
      "Prefer": "wait",
    },
    body: JSON.stringify({
      input: {
        prompt: enhancedPrompt,
        width: spec.width,
        height: spec.height,
        num_outputs: 1,
        num_inference_steps: 4,
        output_format: "webp",
        output_quality: 90,
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return NextResponse.json({ ok: false, error: `Replicate error: ${err.slice(0, 200)}` }, { status: 502 });
  }

  let prediction = await createRes.json() as ReplicatePrediction;

  // If not immediately done (Prefer: wait), poll
  if (prediction.status !== "succeeded" && prediction.status !== "failed") {
    prediction = await waitForPrediction(prediction.id, replicateToken);
  }

  if (prediction.status !== "succeeded" || !prediction.output?.[0]) {
    return NextResponse.json({ ok: false, error: prediction.error ?? "Image generation failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imageUrl: prediction.output[0],
    platform,
    spec: { label: spec.label, width: spec.width, height: spec.height, note: spec.note },
  });
}

// GET: return platform specs reference (no auth needed for spec list)
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, platforms: PLATFORM_IMAGE_SPECS });
}
