import { NextResponse } from "next/server";
import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import { logAiCall, openaiUsageTokens, type OpenAiUsageLike } from "@/lib/ai/log-ai-call";
import type { Grant } from "@/lib/entitlements/can";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { normalizeAiTextModel, isOpenAiTextModel, type AiTextModel } from "@/lib/ai/text-model-options";
import { claudeFallback, claudeParams } from "@/lib/ai/gateway";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canAccessOrg } from "@/lib/tenant-guard";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { renderSiteVoice } from "@/lib/content/brand-voice";
import { forgePrompt, type ForgeCtx } from "@/lib/script-forge/modules";
import { FORGE_MAX_PROMPT_CHARS, FORGE_MAX_TOKENS, forgeCallUpperTwd } from "@/lib/script-forge/run-budget";
import { parseAutoBudget } from "@/lib/content/video/auto-run-budget";
import { autoRunResultValid } from "@/lib/script-forge/auto-run-result";
import { textCallCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { createHash } from "node:crypto";
import { reserveScriptRun, finishScriptRun, SCRIPT_STREAM_LIMIT_MS } from "@/lib/script-forge/run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ScriptForge 影片腳本生成器的單一 LLM 中轉端點（多供應商）。
// 瀏覽器只送 { module, task, fields, siteId, lang, sceneCount, customScenes }：角色、輸出規則、提示與品牌段
// 都在伺服器組（lib/script-forge/modules.ts forgePrompt，plan I6；品牌讀客戶網站 content_defaults，I1）。
// 設計對齊 app/api/content/generate/route.ts + lib/content/article/generate-core.ts：
//   - role gate（resolveOpsRole + canCreateAiImageJob，與其他 AI 端點同權限）
//   - apiKey 只存在伺服器（ANTHROPIC_API_KEY / OPENAI_API_KEY），絕不下放瀏覽器
//   - SYS 固定在伺服器端 = 受限端點（client 只能送 prompt + model 白名單，不能改 system）
//   - 供應商路由：GPT 走 OpenAI Chat Completions SSE；其餘走 Anthropic SDK stream（與 generate-core 同 pattern）
//   - 回 text/plain ReadableStream，保留逐字串流 UX（前端逐塊累加後 JSON.parse）
// model 由前端從 lib/ai/text-model-options.ts 的同一份選單挑（Content Studio 共用）。

const MAX_PROMPT_CHARS = FORGE_MAX_PROMPT_CHARS;
const MAX_TOKENS = FORGE_MAX_TOKENS;
const LANGS = ["繁體中文", "English", "簡體中文", "日本語", "한국어", "Español", "Bahasa Melayu"];

interface ScriptForgeBody {
  module?: string;
  task?: string;
  fields?: Record<string, unknown>;
  siteId?: string;
  lang?: string;
  sceneCount?: number;
  customScenes?: number;
  model?: string;
  autoBudget?: unknown;
}

const intIn = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d;

/** The selected client's voice for the prompt; null brand = no siteId; "denied" = not the caller's or no such site. */
async function brandFor(req: Request, siteId: string): Promise<ForgeCtx["brand"] | "denied"> {
  if (!siteId) return null;
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("script_forge:no_supabase_client");
  const site = await loadSiteBrand(sb, siteId);
  if (!site || !canAccessOrg(req, site.organizationId)) return "denied";
  return { voice: renderSiteVoice(site.defaults) || site.name, forbidden: (site.defaults.marketing?.forbiddenClaims ?? "").trim() };
}

export const POST = withFeature("video.script", handlePost, {
  org: async (req) => {
    const b = await req.clone().json().catch(() => null) as { autoBudget?: { organizationId?: unknown } } | null;
    return typeof b?.autoBudget?.organizationId === "string" ? b.autoBudget.organizationId : null;
  },
});
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let body: ScriptForgeBody;
  try {
    body = (await req.json()) as ScriptForgeBody;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {};
  const brand = await brandFor(req, typeof body.siteId === "string" ? body.siteId.trim() : "");
  if (brand === "denied") return new NextResponse("site not found", { status: 404 });
  const sceneCount = intIn(body.sceneCount, 1, 20, 6);
  const ctx: ForgeCtx = {
    lang: typeof body.lang === "string" && LANGS.includes(body.lang) ? body.lang : LANGS[0],
    sceneCount, customScenes: intIn(body.customScenes, 0, sceneCount, Math.min(3, sceneCount)), brand,
  };
  const built = forgePrompt(String(body.module ?? ""), String(body.task ?? ""), fields, ctx);
  if (!built) return new NextResponse("unknown module or task", { status: 400 });
  // 上限保護：bound 輸入 token 成本（CJK ≈ 1 token/字）。文章轉腳本模組會貼整篇，故給寬鬆 24k 但仍封頂。
  const prompt = built.prompt.slice(0, MAX_PROMPT_CHARS).trim();
  if (!prompt) return new NextResponse("prompt required", { status: 400 });
  const system = built.system;

  // model 白名單化（非清單值 → DEFAULT_AI_TEXT_MODEL）。決定供應商與所需金鑰。
  const model: AiTextModel = normalizeAiTextModel(body.model);
  const useOpenAi = isOpenAiTextModel(model);
  const apiKey = useOpenAi ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const which = useOpenAi ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return new NextResponse(`${which} not configured`, { status: 503 });
  }
  const budget = body.autoBudget === undefined ? null : parseAutoBudget(body.autoBudget);
  if (body.autoBudget !== undefined && !budget) return new NextResponse("一鍵執行預算無效", { status: 400 });
  if (budget && !((body.module === "manual" && body.task === "script") || (body.module === "result" && body.task === "score"))) return new NextResponse("一鍵執行只接受腳本與評分步驟", { status: 400 });
  const reserved = budget ? forgeCallUpperTwd(model, system, prompt) : 0;
  const budgetDb = budget ? getSupabaseWriteClient() : null;
  let claim: Extract<Awaited<ReturnType<typeof reserveScriptRun>>, { kind: "claim" }> | null = null;
  if (budget) {
    const org = (body.autoBudget as { organizationId?: string }).organizationId || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org) || !canAccessOrg(req, org)) return new NextResponse("organization not found", { status: 404 });
    if (!budgetDb) return new NextResponse("執行預算暫時無法儲存", { status: 503 });
    try {
      const key = createHash("sha256").update(JSON.stringify([body.module, body.task, model, system, prompt])).digest("hex"), saved = await reserveScriptRun(budgetDb, org, budget, key, reserved);
      if (saved.kind === "cached") return new Response(saved.text + "\n[SF_BUDGET]" + JSON.stringify({ spentTwd: saved.spentTwd, estimated: saved.estimated }), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-SF-Reserved-Twd": String(saved.spentTwd) } });
      claim = saved;
    } catch (e) { return new NextResponse(e instanceof Error ? e.message : "無法保留執行預算", { status: (e as { status?: number }).status || 503 }); }
  }

  // Abort plumbing — 與 content/generate 同樣的 belt-and-suspenders：req.signal 監聽 + ReadableStream
  // cancel() 雙保險，client 斷線時中止 in-flight 串流（不浪費 token）。
  const ac = new AbortController();
  if (req.signal.aborted) ac.abort();
  else req.signal.addEventListener("abort", () => ac.abort());
  // A budgeted call never outlives its reservation (run-store STALE_RESERVATION_MS): cut here, the reserved cost stays.
  let timedOut = false;
  const deadline = claim ? setTimeout(() => { timedOut = true; ac.abort(); }, SCRIPT_STREAM_LIMIT_MS) : undefined;
  const talking = () => !ac.signal.aborted || timedOut;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let actualUsd: number | null = null;
      let failed = false;
      const chunks: Uint8Array[] = [], capture = { enqueue: (chunk: Uint8Array) => { if (claim) chunks.push(chunk); controller.enqueue(chunk); } } as ReadableStreamDefaultController<Uint8Array>;
      const used = budget ? (usd: number) => { actualUsd = usd; } : undefined;
      try {
        if (useOpenAi) {
          await streamOpenAi(capture, encoder, model, system, prompt, apiKey, ac.signal, grant, used);
        } else {
          await streamAnthropic(capture, encoder, model, system, prompt, apiKey, ac.signal, grant, used);
        }
        if (timedOut) throw new Error("timeout"); // a cut stream may end quietly; it is still a failed call
      } catch (err) {
        failed = true;
        // 串流已開始 → 無法改 HTTP status；把錯誤塞進串流尾端讓前端 JSON.parse 失敗時可見。
        if (talking()) {
          const msg = timedOut ? `超過 ${SCRIPT_STREAM_LIMIT_MS / 1000} 秒，已停下；費用按保留額計` : err instanceof Error ? err.message : "script generation failed";
          controller.enqueue(encoder.encode(`\n[ERROR] ${msg}`));
        }
      } finally {
        clearTimeout(deadline);
        if (claim && budgetDb) {
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            let valid = false;
            try { const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); valid = autoRunResultValid(body.task === "script" ? "script" : "score", parsed); } catch { /* do not cache a malformed result: explicit retry may regenerate it within the same budget */ }
            const receipt = await finishScriptRun(budgetDb, claim, text, actualUsd === null ? null : usdToNtd(actualUsd), valid && !failed && !ac.signal.aborted && !text.includes("\n[ERROR]"));
            if (talking()) controller.enqueue(encoder.encode("\n[SF_BUDGET]" + JSON.stringify(receipt)));
          } catch { if (talking()) controller.enqueue(encoder.encode("\n[ERROR] 用量回執尚未存妥，已停下並保留額度，請稍後確認")); }
        }
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      ...(claim ? { "X-SF-Reserved-Twd": String(claim.spentTwd) } : {}),
    },
  });
}

// ── Anthropic 路徑（Claude 系列）─────────────────────────────────────────────
async function streamAnthropic(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  model: string,
  system: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  grant: Grant,
  used?: (usd: number) => void,
): Promise<void> {
  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey, ...(used ? { maxRetries: 0 } : {}) });
  // The SDK stream accumulates the message: it relabels the model when a fallback serves the answer and overwrites the
  // cumulative usage counters. A completed stream hands it to finalMessage() (currentMessage is cleared at the end);
  // an aborted one leaves the partial snapshot in currentMessage.
  const stream = client.beta.messages.stream(
    { ...claudeParams(model, MAX_TOKENS), ...(used ? {} : claudeFallback(model)), system, messages: [{ role: "user", content: prompt }] },
    { signal },
  );
  let failure: unknown;
  try {
    for await (const event of stream) {
      if (signal.aborted) break;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        controller.enqueue(encoder.encode(event.delta.text));
      }
    }
  } catch (e) {
    failure = e;
    throw e;
  } finally {
    const billed = stream.currentMessage ?? (await stream.finalMessage().catch(() => undefined));
    if (billed) void logAiCall({ route: "/api/tools/script-forge", response: billed, grant, tool: "video" });
    // output_tokens is final only with message_delta, which also sets stop_reason; before it the usage is a lower bound, so the cost stays unknown.
    if (billed?.stop_reason) used?.(textCallCostUsd({ model: billed.model || model, inputTokens: billed.usage?.input_tokens || 0, outputTokens: billed.usage?.output_tokens || 0, cacheReadTokens: billed.usage?.cache_read_input_tokens || 0, cacheWriteTokens: billed.usage?.cache_creation_input_tokens || 0 }));
    // An HTTP error status (APIError.status) means the API refused the request: nothing was generated or billed.
    else if (!billed && typeof (failure as { status?: unknown } | undefined)?.status === "number") used?.(0);
  }
}

// ── OpenAI 路徑（GPT 系列）── Chat Completions SSE，零新依賴（與 generate-core streamOpenAiGeneration 同 pattern）
// gpt-5.x reasoning models 用 max_completion_tokens（拒 max_tokens）且拒非預設 temperature → 兩者都不送 temperature。
async function streamOpenAi(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  model: string,
  system: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  grant: Grant,
  used?: (usd: number) => void,
): Promise<void> {
  const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    if (!res.ok) used?.(0); // an HTTP error response is not billed
    controller.enqueue(encoder.encode(`\n[ERROR] OpenAI API error (${res.status})`));
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let usageFrame: OpenAiUsageLike | null = null;
  try {
  while (true) {
    if (signal.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    // OpenAI 每個事件是單行 `data: {json}`（JSON 不含裸換行）→ 用 "\n" 切，保留尾段 partial 行跨 chunk 重組。
    const frames = buf.split("\n");
    buf = frames.pop() ?? "";
    for (const line of frames) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
          usage?: OpenAiUsageLike;
        };
        if (j.usage) usageFrame = j.usage; // final frame (stream_options.include_usage)
        if (j.error) {
          controller.enqueue(encoder.encode(`\n[ERROR] ${j.error.message ?? "OpenAI stream error"}`));
          return;
        }
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) controller.enqueue(encoder.encode(piece));
      } catch { /* skip partial/non-JSON keepalive frame */ }
    }
  }
  } finally {
    // Also when the connection breaks after the final usage frame arrived: that usage was billed.
    if (usageFrame) {
      void logAiCall({ route: "/api/tools/script-forge", model, ...openaiUsageTokens(usageFrame), grant, tool: "video" });
      used?.(textCallCostUsd({ model, ...openaiUsageTokens(usageFrame) }));
    }
  }
}
