import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";

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

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });
  }

  const systemPrompt = `You are a creative assistant helping designers find trending topics to illustrate on t-shirts, posters, and stickers.
Return ONLY a valid JSON array of 10 strings. Each string is 3–7 words, in English, vivid and visual, suitable as an image design subject.
Example format: ["Lionel Messi golden trophy lift", "Solar eclipse over Tokyo skyline"]
No markdown, no explanation, no extra text — just the raw JSON array.`;

  const userPrompt = `What are 10 trending topics in ${topic} right now? Make each one visually compelling for graphic design.`;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Perplexity ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";

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
