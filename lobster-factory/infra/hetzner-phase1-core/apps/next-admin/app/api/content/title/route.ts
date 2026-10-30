import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withFeature("content.title", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword = (typeof body.keyword === "string" ? body.keyword : "").trim();
  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const language = typeof body.language === "string" ? body.language : "English";
  const articleType = typeof body.articleType === "string" ? body.articleType : "Pillar Article";

  // RankMath title-readability compliance — RankMath cannot tokenize CJK, so its English
  // power-word / sentiment lists and length window misfire. Emit a language-aware rule block
  // that mirrors the article-generator H1 rules (generate/route.ts:28-33 + CJK block :254-255)
  // so suggested titles satisfy the same 4 RankMath tests the generated H1 does.
  const isCJK = /chinese|mandarin|cantonese|japanese|korean|zh-tw|zh-cn|zh-hk|zh-mo|ja-jp|ko-kr|中文|繁體|繁体|简体|簡體|漢語|汉语|粵語|廣東話|國語|国语|台語|台语|日本|日語|日语|한국|韓國|韩国|국어/i.test(language);

  const rankMathRules = isCJK
    ? `RANKMATH TITLE RULES (this language is CJK — RankMath's English lists will not match, follow these exactly):
- KEYWORD POSITION: place the primary keyword "${keyword}" in the FIRST HALF of the title.
- POWER WORD (mandatory): include ONE of these localized power words — 終極 / 必備 / 實證 / 專家 / 完整 / 有效 / 簡單 / 關鍵 / 最佳 / 免費 / 立即 / 秘訣 / 揭密 / 一次搞懂 / 高效 / 避免 / 不可不知 / 獨家 / 快速 / 突破. CRITICAL: RankMath finds the power word by splitting on SPACES, so it MUST stand alone as its own space-separated token with a half-width space on BOTH sides — write 「藝術治療 完整 指南」(✓ 完整 is its own token), NOT 「完整指南」(✗ glued, won't register).
- NUMBER (mandatory): include an Arabic digit — 例「7 個」「5 步驟」「2026 年」. NEVER use CJK numerals（七、五、十）; RankMath only detects 0-9.
- SENTIMENT (mandatory): include a localized emotion word as its OWN space-separated token — positive: 驚人 / 必看 / 有效 / 實用 / 簡單 / 安心；negative: 避免 / 別再 / 小心 / 錯誤 / 後悔. Note: RankMath's built-in sentiment list is English and cannot tokenize Chinese, so this test may still warn unless the site has a CJK sentiment list registered — convey the emotion regardless.
- LENGTH: 14–30 characters.
- YMYL safety: for health/wellness topics NEVER use overclaim words like 保證 / 治癒 / 根治.`
    : `RANKMATH TITLE RULES (follow all — these mirror the RankMath Title Readability tests):
- KEYWORD POSITION: place the primary keyword "${keyword}" within the FIRST 50% of the title.
- POWER WORD (mandatory): include ONE of: ultimate / proven / essential / expert / complete / effective / simple / step-by-step / critical / best / definitive / surprising.
- NUMBER (mandatory): include an Arabic digit (7, 5, 10, 2026) — never spelled out as words. A title is short, so a number almost never distorts the topic; include one in every title.
- SENTIMENT (mandatory, separate from the power word): the title must LITERALLY contain at least one word RankMath scores as sentiment — positive: best / amazing / essential / proven / surprising / effective / powerful / remarkable / important; or negative: avoid / mistake / warning / stop / worst. RankMath matches a fixed wordlist, not the overall vibe, so an actual listed word must appear (one word may satisfy both power-word and sentiment).
- LENGTH: 50–60 characters; descriptive, not clickbait.
- YMYL safety: for health/wellness topics never use overclaim words like cure / guaranteed / heal.`;

  // When keyword contains commas (e.g. "ASD, ART Therapy"), treat as a TOPIC PHRASE, not a
  // literal string to insert verbatim. Derive the actual topic and write natural, human-sounding titles.
  const isMultiKeyword = keyword.includes(",");
  const keywordInstruction = isMultiKeyword
    ? `The input "${keyword}" is a list of related terms describing ONE topic. Your job is to:
1. Understand what topic these terms collectively describe (e.g. "ASD, ART" = Art Therapy for Autism Spectrum Disorder)
2. Write natural titles about THAT TOPIC — NEVER insert the raw comma-separated string into the title
3. Use the most important term naturally within the title, as a real writer would`
    : `Primary keyword to place in titles: "${keyword}"`;

  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    ...claudeParams(CLAUDE_FAST_MODEL, 500, "medium", { thinking: "off" }),
    messages: [{
      role: "user",
      content: `Generate 5 compelling SEO/GEO-optimized article titles.
Language: ${language}
Article type: ${articleType}
${keywordInstruction}

${rankMathRules}

Every one of the 5 titles must satisfy ALL the rules above (keyword position + power word + number + sentiment + length).

ENGAGEMENT RULES (these are AS important as the RankMath rules — a title that passes RankMath but nobody clicks is worthless):
- Each title must use a DIFFERENT headline pattern from the list below. Assign one pattern per title:
  1. CURIOSITY GAP — hint at something surprising or counterintuitive: "Why Most People Get X Wrong", "The Hidden Truth About X", "What Nobody Tells You About X"
  2. NUMBERED LIST WITH HOOK — specific number + compelling modifier: "7 Proven X Techniques That Actually Work (Even for Beginners)", "5 Essential X Secrets Experts Don't Share"
  3. HOW-TO WITH OUTCOME — specific result + timeframe or condition: "How to X in 30 Days (Without Y)", "How to Finally X — Even If Z"
  4. QUESTION THAT CREATES URGENCY — makes reader feel behind or uncertain: "Is X Worth It? 5 Essential Facts Before You Decide", "Are You Making These X Mistakes?"
  5. CONTRARIAN / MYTH-BUSTING — challenges conventional wisdom: "The X Myth That's Holding You Back", "Stop Doing X: Here's What Actually Works"
- NEVER produce generic, interchangeable titles like "The Complete Guide to X" or "Everything You Need to Know About X" — these get zero clicks.
- CJK titles: apply the same 5 patterns in the target language. Use emotionally resonant phrasing like 「你可能不知道的...」「為什麼大多數人...」「...的 7 個關鍵秘密」.

Return ONLY a valid JSON array of 5 title strings, nothing else.
Example: ["Title One Here", "Title Two Here", "Title Three Here", "Title Four Here", "Title Five Here"]`,
    }],
  });

  void logAiCall({ route: "/api/content/title", response: msg, actorRole: role, grant });
  const { rate } = resolveTextRate(msg.model);
  const _cost = { usd: textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens }), model: msg.model, vendor: rate.vendor };

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const titles = JSON.parse(match?.[0] ?? "[]") as unknown[];
    const valid = titles.filter((t): t is string => typeof t === "string").slice(0, 5);
    return NextResponse.json({ ok: true, titles: valid, _cost });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse title suggestions" }, { status: 500 });
  }
}
