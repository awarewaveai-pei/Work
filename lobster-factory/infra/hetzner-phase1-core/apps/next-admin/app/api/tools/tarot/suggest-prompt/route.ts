import { NextResponse } from "next/server";
import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { logAiCall } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an expert art director specializing in tarot card illustration. Your job is to write concise, powerful English style prompts for image generation models.

Given a user's brief description (which may be in Chinese or English), output a single English art-direction prompt following this structure:
[material+brushwork] + [composition+light] + [color palette] + [mood/atmosphere]

Rules:
- Output ONLY the prompt text — no preamble, no explanation, no quotes
- 40–80 words maximum
- Describe artistic STYLE and ATMOSPHERE only — never name what is depicted (no figures, no tarot card names, no objects)
- No negative prompts
- Be specific: name real art movements, materials, techniques, lighting conditions
- The prompt will be combined with a tarot card scene description, so focus purely on visual style`;

interface SuggestBody {
  hint?: string;
  subject?: string;
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }

  let body: SuggestBody;
  try {
    body = (await request.json()) as SuggestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const hint = (body.hint ?? "").trim();
  if (!hint) {
    return NextResponse.json({ ok: false, error: "hint is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "missing_anthropic_api_key" }, { status: 500 });

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });

  const userMessage = body.subject
    ? `Style idea: "${hint}"\nCharacter: "${body.subject}"\n\nWrite an art-direction prompt for this tarot card illustration style.`
    : `Style idea: "${hint}"\n\nWrite an art-direction prompt for this tarot card illustration style.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    void logAiCall({ route: "/api/tools/tarot/suggest-prompt", response: msg, actorRole: resolved.role });

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!text) return NextResponse.json({ ok: false, error: "empty_response" }, { status: 500 });

    return NextResponse.json({ ok: true, prompt: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tarot/suggest-prompt] error", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
