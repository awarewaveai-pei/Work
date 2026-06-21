import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORY_PROMPTS: Record<string, string> = {
  "international-news": "international breaking news and major world events",
  "politics": "politics and government affairs worldwide",
  "finance-economy": "finance, economy, stocks, crypto, and business",
  "sports": "sports events, athletes, competitions, and championships",
  "entertainment": "movies, music, celebrities, TV shows, and pop culture",
  "lifestyle-culture": "lifestyle trends, fashion, food, travel, and culture",
  "health-wellness": "health, wellness, fitness, and medical breakthroughs",
  "gaming-tech": "video games, consumer tech, gadgets, and smartphones",
  "artificial-intelligence": "AI models, AI companies, AI tools, and machine learning",
};

export async function POST(req: Request) {
  const resolved = resolveOpsRole(req);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: { category?: string };
  try {
    body = (await req.json()) as { category?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const cat = (body.category && CATEGORY_PROMPTS[body.category]) ? body.category : "international-news";
  const topic = CATEGORY_PROMPTS[cat]!;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const systemPrompt = `You are a creative assistant helping designers find trending topics to illustrate on t-shirts, posters, and stickers.
Return ONLY a valid JSON array of 10 strings. Each string is 3–7 words, in English, vivid and visual, suitable as an image design subject.
Example format: ["Lionel Messi golden trophy lift", "Solar eclipse over Tokyo skyline"]
No markdown, no explanation, no extra text — just the raw JSON array.`;

  const userPrompt = `What are 10 trending topics in ${topic} right now? Make each one visually compelling for graphic design.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";

    // Extract JSON array robustly — model may wrap in backticks or prose
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ ok: false, error: "Unexpected response format", raw: raw.slice(0, 300) }, { status: 502 });
    }

    let topics: unknown[];
    try {
      topics = JSON.parse(match[0]) as unknown[];
    } catch {
      return NextResponse.json({ ok: false, error: "JSON parse failed", raw: match[0].slice(0, 300) }, { status: 502 });
    }

    if (!Array.isArray(topics)) {
      return NextResponse.json({ ok: false, error: "Parsed value is not an array" }, { status: 502 });
    }

    // Guarantee only strings reach the client
    const safe = topics.filter((t): t is string => typeof t === "string").slice(0, 10);

    return NextResponse.json({ ok: true, topics: safe });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
