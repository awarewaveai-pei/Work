import { NextResponse } from "next/server";
import { extractJsonArray, generateCheapJsonText } from "../../../../../lib/ai/cheap-json";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
// Pre-baked curated items for ~all region×theme combos (generated once by
// scripts/generate-culture-curated.mjs). Served first → free + instant, no LLM call.
// The live LLM below is only the long-tail fallback for combos not in this file.
import CURATED_ITEMS from "../../../../../lib/studio/culture-curated.json";
import { toTraditional } from "../../../../../lib/ai/to-traditional";

export const runtime = "nodejs";
export const maxDuration = 30;

const CURATED = CURATED_ITEMS as Record<string, CultureItem[]>;

// Topic key → English fragment describing what specifics to surface. This is the RUNTIME
// SSOT (the generator parses these; the live LLM fallback uses them). Must have an entry for
// every ALL_TOPICS key in lib/studio/culture-presets.ts (27 keys; API validates body.lens here).
const LENS_HINTS: Record<string, string> = {
  garment: "traditional garments, dress, costume and clothing silhouettes",
  pattern: "traditional decorative patterns, motifs and ornamental designs",
  palette: "signature traditional color palettes and named color combinations",
  weave: "traditional textile techniques, weaving, dyeing and craft methods",
  symbol: "iconic cultural symbols, emblems and sacred signs",
  food: "iconic dishes, street food, desserts, drinks, local fruits and regional snacks",
  musteat: "must-try crowd-pleasing iconic dishes, drinks and desserts that foreign tourists love and recommend",
  weirdfood: "surprising, shocking or fascinating things foreign tourists find amazing about this culture — unusual foods, quirky local customs, bizarre sights, odd inventions and curious local oddities",
  music: "traditional musical instruments, genres and dances",
  art: "representative art forms, painting styles and visual mediums",
  architecture: "iconic architecture, building styles and structural motifs",
  landmark: "famous landmarks, natural wonders and iconic places",
  festival: "traditional festivals, ceremonies and celebrations",
  myth: "mythology, folklore creatures, gods and legends",
  people: "iconic figures, folk heroes and representative people including indigenous elders and leaders",
  nature: "signature landscapes, plants and natural elements",
  animal: "culturally iconic and symbolic animals",
  script: "traditional scripts, calligraphy styles and lettering",
  // 觀光/地圖向主題（兩模式皆可用）— keep keys+hints in sync with TOURIST_TOPICS/CORE_TOPICS in culture-presets.ts
  heritage: "historic heritage sites, monuments, ancient ruins, old temples and landmark heritage buildings",
  themepark: "famous amusement parks, theme parks, observation decks, zoos, aquariums and major tourist attractions",
  metro: "metro and subway lines with their colors, major interchange stations and rail transit hubs",
  roadsign: "distinctive road signs, traffic signals, pedestrian markers and transportation symbols characteristic of the country",
  craft: "traditional handicrafts, artisan products, local specialty goods and famous souvenirs",
  mustsee: "famous must-visit attractions, top sights and bucket-list places every tourist should see",
  hidden: "hidden gems, secret off-the-beaten-path spots and lesser-known places that locals love",
  mustbuy: "must-buy souvenirs, signature local products, famous gifts and shopping specialties tourists take home",
  photospot: "the most photogenic instagrammable photo spots, scenic viewpoints and iconic backdrops",
};

interface CultureItem {
  zh: string;
  en: string;
  desc: string;
}

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("ops.cheap-json", handlePost);

async function handlePost(req: Request) {
  const resolved = resolveOpsRole(req);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { region?: string; lens?: string; model?: string; force?: boolean; curatedOnly?: boolean };
  try {
    body = (await req.json()) as { region?: string; lens?: string; model?: string; force?: boolean; curatedOnly?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const region = (body.region ?? "").trim().slice(0, 60);
  const lensKey = body.lens && LENS_HINTS[body.lens] ? body.lens : "";
  if (!region || !lensKey) {
    return NextResponse.json({ ok: false, error: "missing_region_or_lens" }, { status: 400 });
  }

  // 🪙 Curated fast-path: serve pre-baked items for free + instantly. Only combos missing
  // from the dataset (the long tail) fall through to the live LLM below. `force` re-rolls a
  // curated combo via the AI; `curatedOnly` (used by the client's auto-load) NEVER calls the
  // LLM — it returns curated-or-empty so selecting a region can't silently spend tokens.
  const baked = CURATED[`${region}|${lensKey}`];
  if (baked && baked.length && !body.force) {
    return NextResponse.json({ ok: true, items: baked.slice(0, 12), model: "curated" });
  }
  if (body.curatedOnly) {
    return NextResponse.json({ ok: true, items: [], model: "none" });
  }

  const systemPrompt = `You are a cultural design researcher helping a designer create clothing graphics inspired by world cultures.
Given a culture and a facet, return ONLY a valid JSON array of 12 specific, authentic, visually distinctive items of that facet from that culture.
Each item is an object: {"zh": "<short Traditional Chinese label, 2-6 chars>", "en": "<English phrase, 2-6 words, vivid and visual for an image prompt>", "desc": "<short Traditional Chinese description, under 12 chars>"}.
Be culturally accurate and respectful - use real names of dishes, patterns, garments, landmarks, instruments, figures, etc. Avoid stereotypes and avoid sacred items that should not be commercialized.
No markdown, no explanation, no extra text - just the raw JSON array.`;

  const userPrompt = `Culture: ${region}. Facet: ${LENS_HINTS[lensKey]}. List 12 specific, authentic, visually compelling items suitable as graphic motifs for clothing design.`;

  try {
    const result = await generateCheapJsonText({
      route: "/api/tools/studio/culture",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 900,
      model: body.model,
      metadata: { region, lens: lensKey },
      tool: "studio",
    });

    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    const jsonArray = extractJsonArray(result.raw);
    if (!jsonArray) {
      return NextResponse.json(
        { ok: false, error: "Unexpected response format", raw: result.raw.slice(0, 300) },
        { status: 502 },
      );
    }

    let parsed: unknown[];
    try {
      parsed = JSON.parse(jsonArray) as unknown[];
    } catch {
      return NextResponse.json({ ok: false, error: "JSON parse failed", raw: jsonArray.slice(0, 300) }, { status: 502 });
    }

    if (!Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "Parsed value is not an array" }, { status: 502 });
    }

    // Live AI often returns Simplified despite the prompt → force Traditional (zh/desc only).
    const items: CultureItem[] = parsed
      .filter((it): it is Record<string, unknown> => typeof it === "object" && it !== null)
      .map((it) => ({
        zh: typeof it.zh === "string" ? toTraditional(it.zh.replace(/\s+/g, " ").trim().slice(0, 24)) : "",
        en: typeof it.en === "string" ? it.en.replace(/\s+/g, " ").trim().slice(0, 80) : "",
        desc: typeof it.desc === "string" ? toTraditional(it.desc.replace(/\s+/g, " ").trim().slice(0, 40)) : "",
      }))
      .filter((it) => it.zh && it.en)
      .slice(0, 12);

    return NextResponse.json({ ok: true, items, model: result.model });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
