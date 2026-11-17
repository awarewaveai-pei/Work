import { NextResponse } from "next/server";
import { runForOrg } from "@/lib/entitlements/grant";
import { EntitlementRequired } from "@/lib/entitlements/can";
import { imageCostUsd } from "@/lib/ai/cost-calculator";
import { workbenchAuthorized } from "@/lib/content/video/workbench-internal";
import { VIDEO_SCENE_MODELS } from "@/public/editor-shared/image-models.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Card U4.4: a workbench shot's picture drawn by one of the video scene models (image-models.js VIDEO_SCENE_MODELS: FLUX,
 * Ideogram, Google, OpenAI), run by the staff draft's own code (lib/content/blocks/video-pipeline.ts buildSceneAsset).
 * Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * POST {organizationId, prompt, imageModel, ratio: 16x9|9x16|4x5, userId?} -> 200 {url, origin, costUsd}.
 * The picture's paid ask (video.image, buildSceneAsset grantFor) runs inside runForOrg for that org, as the staff route
 * regenerate-image's withFeature scopes it. origin is made here from the model that ran, never taken from the caller;
 * buildSceneAsset swaps an unknown model for flux-schnell, so a result naming another model is refused, not returned.
 * No reference pictures: buildSceneAsset takes one Story Bible portrait only (the workbench says so on the card).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATIOS = new Set(["16x9", "9x16", "4x5"]);
const MODELS = new Set<string>(Object.values(VIDEO_SCENE_MODELS).flat());
const MAX_PROMPT = 4000;
type Body = Record<string, unknown>;
const obj = (v: unknown): Body | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Body : null);
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

type Parsed = { organizationId: string; prompt: string; imageModel: string; ratio: string; actor: string };
function parse(b: Body | null): Parsed | string {
  if (!b) return "invalid_json";
  const organizationId = typeof b.organizationId === "string" ? b.organizationId : "";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const imageModel = typeof b.imageModel === "string" ? b.imageModel : "";
  const ratio = typeof b.ratio === "string" ? b.ratio : "";
  if (!UUID.test(organizationId)) return "organizationId required";
  if (!prompt || prompt.length > MAX_PROMPT) return `prompt must be 1-${MAX_PROMPT} characters`;
  if (!MODELS.has(imageModel)) return "imageModel is not a video scene model";
  if (!RATIOS.has(ratio)) return "ratio must be 16x9, 9x16 or 4x5";
  if (b.userId !== undefined && (typeof b.userId !== "string" || !UUID.test(b.userId))) return "invalid userId";
  return { organizationId, prompt, imageModel, ratio, actor: "video:" + (b.userId ?? "workbench") };
}

export async function POST(req: Request): Promise<Response> {
  if (!workbenchAuthorized(req)) return fail(401, "unauthorized");
  const p = parse(obj(await req.json().catch(() => null)));
  if (typeof p === "string") return fail(400, p);
  const { buildSceneAsset, FORMAT_SPEC } = await import("@/lib/content/blocks/video-pipeline");
  const spec = FORMAT_SPEC[p.ratio];
  let r;
  try {
    // Invariant: the paid picture bills the org the workbench named; outside runForOrg it would bill the internal account.
    r = await runForOrg(p.organizationId, p.actor, () => buildSceneAsset(
      { id: 0, image_prompt: p.prompt, broll_keyword: "", visual: "custom" },
      { imageModel: p.imageModel, aspectRatio: spec.aspectRatio, orientation: spec.orientation, framing: spec.framing },
    ));
  } catch (e) {
    if (e instanceof EntitlementRequired) return fail(403, e.code);
    if (e instanceof Error && e.message === "subject_not_found") return fail(404, "organization not found"); // lib/entitlements/subject.ts
    throw e;
  }
  if (r.ok === false) return fail(r.status, r.error);
  if (r.origin?.kind !== "ai_generated" || r.origin.model !== p.imageModel || !/^https:\/\//.test(r.asset)) return fail(502, "scene image did not come from the asked model");
  return NextResponse.json({ ok: true, url: r.asset, origin: r.origin, costUsd: imageCostUsd(r.origin.model) });
}
