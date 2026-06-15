import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
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
- SENTIMENT: convey clear positive/negative emotion (好奇 / 急迫 / 安心 / 興奮).
- LENGTH: 14–30 characters.
- YMYL safety: for health/wellness topics NEVER use overclaim words like 保證 / 治癒 / 根治.`
    : `RANKMATH TITLE RULES (follow all — these mirror the RankMath Title Readability tests):
- KEYWORD POSITION: place the primary keyword "${keyword}" within the FIRST 50% of the title.
- POWER WORD (mandatory): include ONE of: ultimate / proven / essential / expert / complete / effective / simple / step-by-step / critical / best / definitive / surprising.
- NUMBER (mandatory): include an Arabic digit (7, 5, 10, 2026) — never spelled out. Required for list/how-to titles; for other types include one unless it genuinely distorts the topic.
- SENTIMENT: convey clear positive or negative sentiment (curiosity, urgency, relief, excitement).
- LENGTH: 50–60 characters; descriptive, not clickbait.
- YMYL safety: for health/wellness topics never use overclaim words like cure / guaranteed / heal.`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Generate 5 compelling SEO/GEO-optimized article titles for the keyword: "${keyword}"
Language: ${language}
Article type: ${articleType}

${rankMathRules}

Every one of the 5 titles must satisfy ALL the rules above (keyword position + power word + number + sentiment + length). Vary the angle across the 5 (e.g. how-to, list, benefit, comparison, guide) but never drop a required element.

Return ONLY a valid JSON array of 5 title strings, nothing else.
Example: ["Title One Here", "Title Two Here", "Title Three Here", "Title Four Here", "Title Five Here"]`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const titles = JSON.parse(match?.[0] ?? "[]") as unknown[];
    const valid = titles.filter((t): t is string => typeof t === "string").slice(0, 5);
    return NextResponse.json({ ok: true, titles: valid });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse title suggestions" }, { status: 500 });
  }
}
