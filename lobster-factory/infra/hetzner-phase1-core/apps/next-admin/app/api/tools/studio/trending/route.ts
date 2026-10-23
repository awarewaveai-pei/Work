import { NextResponse } from "next/server";
import { extractJsonArray, generateCheapJsonText } from "../../../../../lib/ai/cheap-json";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import { toTraditional } from "../../../../../lib/ai/to-traditional";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORY_PROMPTS: Record<string, string> = {
  "international-news": "international breaking news and major world events",
  politics: "politics and government affairs worldwide",
  "finance-economy": "finance, economy, stocks, crypto, and business",
  sports: "sports events, athletes, competitions, and championships",
  entertainment: "movies, music, celebrities, TV shows, and pop culture",
  "lifestyle-culture": "lifestyle trends, fashion, food, travel, and culture",
  "health-wellness": "health, wellness, fitness, and medical breakthroughs",
  "gaming-tech": "video games, consumer tech, gadgets, and smartphones",
  "artificial-intelligence": "AI models, AI companies, AI tools, and machine learning",
};

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("ops.cheap-json", handlePost);

async function handlePost(req: Request) {
  const resolved = resolveOpsRole(req);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { category?: string; model?: string };
  try {
    body = (await req.json()) as { category?: string; model?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const cat = body.category && CATEGORY_PROMPTS[body.category] ? body.category : "international-news";
  const topic = CATEGORY_PROMPTS[cat]!;

  const systemPrompt = `You are a creative assistant helping designers find trending topics to illustrate on t-shirts, posters, and stickers.
Return ONLY a valid JSON array of 10 strings. Each string is 3-8 words, in English, vivid and visual, suitable as an image design subject.
Example format: ["Lionel Messi golden trophy lift", "Solar eclipse over Tokyo skyline"]
No markdown, no explanation, no extra text - just the raw JSON array.`;

  const userPrompt = `What are 10 trending topics in ${topic} right now? Make each one visually compelling for graphic design.`;

  try {
    const result = await generateCheapJsonText({
      route: "/api/tools/studio/trending",
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 400,
      model: body.model,
      metadata: { category: cat },
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

    let topics: unknown[];
    try {
      topics = JSON.parse(jsonArray) as unknown[];
    } catch {
      return NextResponse.json({ ok: false, error: "JSON parse failed", raw: jsonArray.slice(0, 300) }, { status: 502 });
    }

    if (!Array.isArray(topics)) {
      return NextResponse.json({ ok: false, error: "Parsed value is not an array" }, { status: 502 });
    }

    const safe = topics.filter((t): t is string => typeof t === "string").map((t) => toTraditional(t)).slice(0, 10);
    return NextResponse.json({ ok: true, topics: safe, model: result.model });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
