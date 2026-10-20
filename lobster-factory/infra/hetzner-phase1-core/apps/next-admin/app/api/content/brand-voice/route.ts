import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface BrandVoiceProfile {
  name: string;
  tone: string;
  vocabulary: string;
  sentenceStyle: string;
  personality: string[];
  preferWords: string[];
  avoidWords: string[];
  promptInjection: string;
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 5000);
  } catch { return ""; }
}

export const POST = withFeature("content.brand-voice", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const name = (typeof body.name === "string" ? body.name : "我的品牌").trim();
  let sampleText = (typeof body.text === "string" ? body.text : "").trim();

  // Fetch URL if provided
  const url = (typeof body.url === "string" ? body.url : "").trim();
  if (!sampleText && url && /^https?:\/\//.test(url)) {
    sampleText = await fetchUrlText(url);
  }

  if (!sampleText || sampleText.length < 50) {
    return NextResponse.json({ ok: false, error: "需要至少 50 字的範例文字" }, { status: 400 });
  }

  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: `Analyze this writing sample and extract the brand voice profile. Return ONLY a valid JSON object.

SAMPLE TEXT:
${sampleText.slice(0, 3000)}

Return this exact JSON structure:
{
  "tone": "one of: formal/professional/conversational/friendly/inspirational/authoritative/playful",
  "vocabulary": "one of: technical/simple/mixed/academic/everyday",
  "sentenceStyle": "short and punchy / medium flowing / long complex / varied",
  "personality": ["3-5 one-word personality traits, e.g. empathetic, confident, practical"],
  "preferWords": ["5-8 words or phrases commonly used in this writing style"],
  "avoidWords": ["3-5 words or phrases that clash with this brand voice"],
  "promptInjection": "A 2-3 sentence instruction to give a writer to match this style, written as a direct prompt command starting with 'Write in a...'"
}

Output ONLY the JSON, no markdown, no explanation.`,
    }],
  });

  void logAiCall({ route: "/api/content/brand-voice", response: msg, actorRole: role });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as Record<string, unknown>;

    const profile: BrandVoiceProfile = {
      name,
      tone: typeof parsed.tone === "string" ? parsed.tone : "conversational",
      vocabulary: typeof parsed.vocabulary === "string" ? parsed.vocabulary : "mixed",
      sentenceStyle: typeof parsed.sentenceStyle === "string" ? parsed.sentenceStyle : "varied",
      personality: Array.isArray(parsed.personality) ? parsed.personality.filter((x): x is string => typeof x === "string") : [],
      preferWords: Array.isArray(parsed.preferWords) ? parsed.preferWords.filter((x): x is string => typeof x === "string") : [],
      avoidWords: Array.isArray(parsed.avoidWords) ? parsed.avoidWords.filter((x): x is string => typeof x === "string") : [],
      promptInjection: typeof parsed.promptInjection === "string" ? parsed.promptInjection : "",
    };

    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json({ ok: false, error: "解析品牌聲音失敗，請重試" }, { status: 500 });
  }
}
