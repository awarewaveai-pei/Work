import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_HOOK_TYPES = [
  "Question",
  "Statistical or Fact",
  "Quotation",
  "Anecdotal or Story",
  "Personal or Emotional",
] as const;

type HookType = typeof VALID_HOOK_TYPES[number];

export const POST = withFeature("content.hook-brief", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword     = (typeof body.keyword     === "string" ? body.keyword     : "").trim();
  const language    = typeof body.language     === "string" ? body.language     : "English";
  const articleType = typeof body.articleType  === "string" ? body.articleType  : "Pillar Article";

  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  // Validate requested hook types
  const rawTypes = Array.isArray(body.hookTypes) ? body.hookTypes : [body.hookTypes].filter(Boolean);
  const hookTypes: HookType[] = rawTypes
    .filter((t): t is string => typeof t === "string")
    .filter((t): t is HookType => (VALID_HOOK_TYPES as readonly string[]).includes(t))
    .slice(0, 5);

  if (hookTypes.length === 0) return new NextResponse("hookTypes required", { status: 400 });

  const isCJK = /chinese|mandarin|cantonese|japanese|korean|zh-tw|zh-cn|zh-hk|zh-mo|ja-jp|ko-kr|中文|繁體|繁体|简体|簡體|漢語|汉语|粵語|廣東話|國語|国语|台語|台语|日本|日語|日语|한국|韓國|韩国|국어/i.test(language);

  const hookDescriptions: Record<HookType, string> = {
    "Question":              "A provocative open question that challenges a common assumption or makes the reader doubt something they thought they knew. E.g. 「你有沒有想過，為什麼大多數人學了X卻沒有改變？」",
    "Statistical or Fact":  "A surprising, specific statistic or counterintuitive fact with source and year. E.g. 「根據 2024 APA 研究，8 成焦慮者從未嘗試表達性藝術…」",
    "Quotation":             "A memorable quote from a recognized expert, researcher, or notable figure — with full attribution. E.g. 「'The creative adult is the child who survived' — Ursula K. Le Guin」",
    "Anecdotal or Story":    "A short, vivid micro-story (1-2 sentences) from a real or representative client/situation that drops the reader into a scene. E.g. 「3 年前，一位來訪者拿著一張全黑的畫走進工作室…」",
    "Personal or Emotional": "A candid, first-person moment or emotionally resonant confession that builds immediate connection. E.g. 「我第一次走進工作坊時，完全不知道自己在哭什麼。」",
  };

  const typeSections = hookTypes.map(t =>
    `### ${t}\n${hookDescriptions[t]}\nWrite a single, compelling hook brief (1-3 sentences) in ${language} for the article about "${keyword}" (${articleType}).`
  ).join("\n\n");

  const prompt = `You are an expert content strategist writing hook brief DIRECTIONS for a writer, not the actual article intro.

For each hook type below, write a BRIEF DIRECTION (not the full hook itself) — 1-3 concrete sentences that tell the writer:
- What specific angle/direction to take
- A concrete example starter or seed phrase to inspire them
- What emotional effect to aim for

Language: ${language}${isCJK ? " — write all output in this language" : ""}
Keyword/Topic: "${keyword}"
Article Type: ${articleType}

${typeSections}

Return ONLY a valid JSON object where each key is the hook type name and the value is the brief direction string.
Example: {"Question": "...", "Statistical or Fact": "..."}`;

  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    ...claudeParams(CLAUDE_FAST_MODEL, 800, "medium", { thinking: "off" }),
    messages: [{ role: "user", content: prompt }],
  });

  void logAiCall({ route: "/api/content/hook-brief", response: msg, actorRole: role, grant });

  const text         = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  const { rate }     = resolveTextRate(msg.model);
  const usd          = textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens });

  try {
    const match  = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as Record<string, unknown>;
    const briefs: Record<string, string> = {};
    for (const t of hookTypes) {
      if (typeof parsed[t] === "string") briefs[t] = parsed[t] as string;
    }
    return NextResponse.json({ ok: true, briefs, _cost: { usd, model: msg.model, vendor: rate.vendor } });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse hook brief suggestions" }, { status: 500 });
  }
}
