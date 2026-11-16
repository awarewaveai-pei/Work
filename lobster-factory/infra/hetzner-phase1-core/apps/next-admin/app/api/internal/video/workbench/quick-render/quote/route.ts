import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { DRAFT_VOICES, VIDEO_PIPELINE_STEPS, computeVideoCost } from "@/lib/content/video/video-cost";
import { optionalRendererAuthHeaders } from "@/lib/content/video/renderer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan U5 快速輸出 dialog: the voices the render service speaks with and what the chosen ratios cost, priced here by
 * computeVideoCost (the workbench never prices). Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * POST {organizationId, scenes, ttsChars, ratios, tts?:{provider, voice}} -> {voices, lines (one ratio), perRatioUsd,
 * totalUsd}; the workbench shows US$ as NT$ at its capabilities rate, like every price it shows. Each ratio is its own
 * render, so a paid voice speaks (and bills) once per ratio.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATIOS = new Set(["16x9", "9x16", "4x5"]);
const MAX_SCENES = 30, MAX_CHARS = 30 * 2000; // = the quick-render route's scene limits
const STEPS = VIDEO_PIPELINE_STEPS.filter((s) => s.id === "tts" || s.id === "render"); // the pictures already exist

function authorized(req: Request): boolean {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return !!expected && !!bearer && timingSafeEqual(bearer, expected);
}
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });
// The render service's own answer (/health capabilities.openai_tts, as /api/video/capabilities reads it); unreachable = no.
async function openAiTts(): Promise<boolean> {
  try {
    const r = await fetch(`${process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732"}/health`, { headers: optionalRendererAuthHeaders("quick"), cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const body = await r.json().catch(() => ({})) as { capabilities?: { openai_tts?: boolean } };
    return r.ok && body.capabilities?.openai_tts === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail(401, "unauthorized");
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return fail(400, "invalid_json");
  if (typeof b.organizationId !== "string" || !UUID.test(b.organizationId)) return fail(400, "organizationId required");
  const scenes = Number(b.scenes), ttsChars = Number(b.ttsChars);
  if (!Number.isInteger(scenes) || scenes < 1 || scenes > MAX_SCENES) return fail(400, `scenes must be 1-${MAX_SCENES}`);
  if (!Number.isInteger(ttsChars) || ttsChars < 0 || ttsChars > MAX_CHARS) return fail(400, "invalid ttsChars");
  const ratios = Array.isArray(b.ratios) ? [...new Set(b.ratios)] : [];
  if (!ratios.length || !ratios.every((r) => typeof r === "string" && RATIOS.has(r))) return fail(400, "ratios must be 16x9, 9x16 or 4x5");
  const t = (b.tts ?? DRAFT_VOICES[0]) as Record<string, unknown>;
  const voice = DRAFT_VOICES.find((v) => v.provider === t?.provider && v.voice === t?.voice);
  if (!voice) return fail(400, "invalid tts");
  // Without an OpenAI key the render service speaks Edge instead (video-service pipeline.py fallback): those voices
  // are offered as unavailable, never priced as if they would speak.
  const openai = await openAiTts();
  const voices = DRAFT_VOICES.map((v) => ({ ...v, available: v.provider !== "openai" || openai }));
  if (voice.provider === "openai" && !openai) return fail(400, "openai voices unavailable on the render service");

  const cost = computeVideoCost({
    totalScenes: scenes, customScenes: 0, brollScenes: 0, includeScriptCost: false,
    ttsProvider: voice.provider, ttsVoice: voice.voice, ttsChars,
  }, STEPS);
  return NextResponse.json({
    ok: true,
    voices,
    lines: cost.lines.map((l) => ({ label: l.label, tool: l.tool, usd: l.totalUsd })),
    perRatioUsd: cost.totalUsd,
    totalUsd: cost.totalUsd * ratios.length,
  });
}
