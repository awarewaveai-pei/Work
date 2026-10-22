import { NextResponse } from "next/server";
import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { needsEnglish, TRANSLATE_MAX_CHARS } from "@/lib/tarot/translate";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { logAiCall } from "../../../../../lib/ai/log-ai-call";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `Translate the user's text into natural English for an image-generation prompt.
Keep every visual detail (colors, species, clothing, art terms). Output ONLY the English text: no preamble, no quotes, no notes.`;

// Same billing key as suggest-prompt: both are one small text call that prepares the deck's prompt.
export const POST = withFeature("tarot.prompt", handlePost);
async function handlePost(request: Request, grant: Grant) {
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
  if (text.length > TRANSLATE_MAX_CHARS) {
    return NextResponse.json({ ok: false, error: `text_too_long (max ${TRANSLATE_MAX_CHARS})` }, { status: 400 });
  }
  // Already English (Latin letters only): no AI call, no cost.
  if (!needsEnglish(text)) return NextResponse.json({ ok: true, english: text, translated: false });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "missing_anthropic_api_key" }, { status: 500 });

  try {
    const Anthropic = await loadAnthropic(grant);
    const msg = await new Anthropic({ apiKey }).messages.create({
      // Haiku 5.5 thinks by default; a one-line translation needs none, so turn it off.
      ...claudeParams(CLAUDE_FAST_MODEL, 400, "medium", { thinking: "off" }),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    void logAiCall({ route: "/api/tools/tarot/translate", response: msg, actorRole: resolved.role });
    const english = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();
    if (!english) return NextResponse.json({ ok: false, error: "empty_response" }, { status: 500 });
    return NextResponse.json({ ok: true, english, translated: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tarot/translate] error", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
