import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { DRAFT_VOICES, VIDEO_PIPELINE_STEPS, computeVideoCost } from "@/lib/content/video/video-cost";
import { optionalRendererAuthHeaders } from "@/lib/content/video/renderer-auth";
import { IMAGE_RATES, OPENAI_TOKEN_PRICED_IMAGE_MODELS } from "@/lib/ai/cost-model";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { forgeRunUpperTwd } from "@/lib/script-forge/run-budget";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { listAccounts } from "@/lib/social/store";
import { writerKeysFor } from "@/lib/social/write-posts";
import { renderSiteVoice, siteLanguage, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { draftQuoteUsd } from "@/lib/content/video/auto-run-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan U5 快速輸出 dialog: the voices the render service speaks with and what the chosen ratios cost, priced here by
 * computeVideoCost (the workbench never prices). Bearer = VW_INTERNAL_TOKEN; unset = every call 401.
 * POST {organizationId, scenes, ttsChars, ratios, tts?:{provider, voice}} -> {voices, lines (one ratio), perRatioUsd,
 * totalUsd}; the workbench shows US$ as NT$ at its capabilities rate, like every price it shows. Each ratio is its own
 * render, so a paid voice speaks (and bills) once per ratio.
 * Plan U5.3 一鍵成片 (§13 C4: the whole run is priced here, never summed in the browser): fill?:{mode: ai|stock-video|
 * stock-photo, pictures, imageModel?} adds the missing pictures (AI = the workbench's image model at its cost-model
 * price; Pexels = NT$0) -> fill {pictures, perPictureUsd, perPictureTwd, usd, twd}; totalUsd/totalTwd = fill + every ratio's render.
 * Bookends (title cards, templates) render on our own services: no line, NT$0. sites = this org's active WordPress
 * sites, for 「同時建一篇網站草稿文章並嵌入」.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATIOS = new Set(["16x9", "9x16", "4x5"]);
const MAX_SCENES = 30, MAX_CHARS = 30 * 2000; // = the quick-render route's scene limits
const STEPS = VIDEO_PIPELINE_STEPS.filter((s) => s.id === "tts" || s.id === "render"); // the pictures already exist
const FILL = new Set(["ai", "stock-video", "stock-photo"]);
// One picture's price before it is made: a token-billed OpenAI model has no usage yet, so its highest per-image
// estimate (the workbench prices its own button the same way, backend/provider-cost.cjs imageUsd); any other model its
// IMAGE_RATES row; a model with neither has no price and is refused.
function pictureUsd(model: string): number | null {
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (OPENAI_TOKEN_PRICED_IMAGE_MODELS.includes(base)) return IMAGE_RATES["openai-high"].usd;
  return IMAGE_RATES[model]?.usd ?? null;
}

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

  let fill = { pictures: 0, perPictureUsd: 0, perPictureTwd: 0, usd: 0, twd: 0, byShotTwd: {} as Record<string, number> };
  if (b.fill !== undefined) {
    const f = (b.fill && typeof b.fill === "object" ? b.fill : {}) as Record<string, unknown>, pictures = Number(f.pictures);
    if (typeof f.mode !== "string" || !FILL.has(f.mode) || !Number.isInteger(pictures) || pictures < 0 || pictures > MAX_SCENES) return fail(400, "invalid fill");
    const models = Array.isArray(f.shots) ? f.shots as { id: string; imageModel: string }[] : null;
    if (models && (models.length !== pictures || models.some((s) => typeof s?.id !== "string" || typeof s.imageModel !== "string"))) return fail(400, "invalid fill shots");
    const prices = (models || Array.from({ length: pictures }, (_, id) => ({ id: String(id), imageModel: typeof f.imageModel === "string" ? f.imageModel : "" })))
      .map((s) => ({ id: s.id, usd: f.mode === "ai" ? pictureUsd(s.imageModel) : 0 }));
    if (prices.some((s) => s.usd === null)) return fail(400, "image model has no price");
    const unit = prices.length ? Math.max(...prices.map((s) => s.usd!)) : 0;
    if (unit === null) return fail(400, "image model has no price");
    const usd = prices.reduce((sum, s) => sum + s.usd!, 0);
    fill = { pictures, perPictureUsd: unit, perPictureTwd: usdToNtd(unit), usd, twd: usdToNtd(usd), byShotTwd: Object.fromEntries(prices.map((s) => [s.id, usdToNtd(s.usd!)])) };
  }
  const db = getSupabaseWriteClient();
  const sites = db ? ((await db.from("wp_sites").select("id, name").eq("organization_id", b.organizationId).eq("active", true).order("name")).data ?? []) : [];
  let draftsUsd = 0;
  if (b.until === "drafts") {
    if (!db || typeof b.scriptText !== "string" || b.scriptText.length > MAX_CHARS) return fail(400, "draft quote requires scriptText");
    const accounts = (await listAccounts(b.organizationId, { hydrateProfile: false })).filter((a) => a.status === "connected");
    const { data: site } = await db.from("wp_sites").select("content_defaults").eq("organization_id", b.organizationId).eq("active", true).limit(1).maybeSingle();
    const defaults = site?.content_defaults as SiteContentDefaults | undefined;
    draftsUsd = draftQuoteUsd({ article: b.scriptText, mediaType: "video", keys: writerKeysFor(accounts.map((a) => a.platform)), voice: renderSiteVoice(defaults), siteLanguage: siteLanguage(defaults) });
  }

  const cost = computeVideoCost({
    totalScenes: scenes, customScenes: 0, brollScenes: 0, includeScriptCost: false,
    ttsProvider: voice.provider, ttsVoice: voice.voice, ttsChars,
  }, STEPS);
  let scriptUpperTwd = 0;
  if (b.scriptPlan !== undefined) {
    const plan = b.scriptPlan as { model?: string; fields?: Record<string, unknown>; siteId?: string; lang?: string; sceneCount?: number; customScenes?: number };
    if (!plan || typeof plan !== "object" || !Number.isInteger(plan.sceneCount) || plan.sceneCount! < 1 || plan.sceneCount! > 20 || !plan.fields || typeof plan.fields !== "object") return fail(400, "invalid script plan");
    let brand = null;
    if (plan.siteId) {
      if (!db) return fail(503, "db_unavailable");
      const site = await db.from("wp_sites").select("name, content_defaults").eq("organization_id", b.organizationId).eq("id", plan.siteId).maybeSingle();
      if (site.error || !site.data) return fail(404, "script site not found");
      const defaults = site.data.content_defaults as SiteContentDefaults;
      brand = { voice: renderSiteVoice(defaults) || site.data.name, forbidden: defaults?.marketing?.forbiddenClaims || "" };
    }
    scriptUpperTwd = forgeRunUpperTwd(plan, { lang: plan.lang || "繁體中文", sceneCount: plan.sceneCount!, customScenes: Math.max(0, Math.min(plan.sceneCount!, Number(plan.customScenes) || 0)), brand });
  }
  const scriptUsd = scriptUpperTwd / TWD_RATE;
  return NextResponse.json({
    ok: true,
    voices,
    lines: cost.lines.map((l) => ({ label: l.label, tool: l.tool, usd: l.totalUsd })),
    perRatioUsd: cost.totalUsd,
    perRatioTwd: usdToNtd(cost.totalUsd),
    fill,
    draftsUsd,
    ...(b.scriptPlan !== undefined ? { scriptUpperTwd } : {}),
    totalUsd: fill.usd + cost.totalUsd * ratios.length + draftsUsd + scriptUsd,
    totalTwd: usdToNtd(fill.usd + cost.totalUsd * ratios.length + draftsUsd + scriptUsd),
    sites: sites.map((s) => ({ id: String(s.id), name: String(s.name) })),
  });
}
