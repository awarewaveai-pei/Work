import { NextResponse } from "next/server";
import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { normalizeAiTextModel, isOpenAiTextModel, type AiTextModel } from "@/lib/ai/text-model-options";
import { claudeFallback, claudeParams } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ScriptForge 影片腳本生成器的單一 LLM 中轉端點（多供應商）。
// 前端（app/tools/video/ScriptForge.tsx）24 個模組全走同一個 claude(prompt) → 這條 route。
// 設計對齊 app/api/content/generate/route.ts + lib/content/article/generate-core.ts：
//   - role gate（resolveOpsRole + canCreateAiImageJob，與其他 AI 端點同權限）
//   - apiKey 只存在伺服器（ANTHROPIC_API_KEY / OPENAI_API_KEY），絕不下放瀏覽器
//   - SYS 固定在伺服器端 = 受限端點（client 只能送 prompt + model 白名單，不能改 system）
//   - 供應商路由：GPT 走 OpenAI Chat Completions SSE；其餘走 Anthropic SDK stream（與 generate-core 同 pattern）
//   - 回 text/plain ReadableStream，保留逐字串流 UX（前端逐塊累加後 JSON.parse）
// model 由前端從 lib/ai/text-model-options.ts 的同一份選單挑（Content Studio 共用）。

const SYS = `你是世界頂級短影音腳本策略師、廣告創意總監與多語言內容專家。輸出必須是純JSON，不加任何markdown包裹或前言後記。台詞口語自然；畫面指令具體；字幕最多12字。`;

const MAX_PROMPT_CHARS = 24000;
const MAX_TOKENS = 4000;

interface ScriptForgeBody {
  prompt?: string;
  model?: string;
}

export const POST = withFeature("video.script", handlePost);
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

  // 上限保護：bound 輸入 token 成本（CJK ≈ 1 token/字）。文章轉腳本模組會貼整篇，故給寬鬆 24k 但仍封頂。
  const prompt = (typeof body.prompt === "string" ? body.prompt : "").slice(0, MAX_PROMPT_CHARS).trim();
  if (!prompt) return new NextResponse("prompt required", { status: 400 });

  // model 白名單化（非清單值 → DEFAULT_AI_TEXT_MODEL）。決定供應商與所需金鑰。
  const model: AiTextModel = normalizeAiTextModel(body.model);
  const useOpenAi = isOpenAiTextModel(model);

  const apiKey = useOpenAi ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const which = useOpenAi ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return new NextResponse(`${which} not configured`, { status: 503 });
  }

  // Abort plumbing — 與 content/generate 同樣的 belt-and-suspenders：req.signal 監聽 + ReadableStream
  // cancel() 雙保險，client 斷線時中止 in-flight 串流（不浪費 token）。
  const ac = new AbortController();
  if (req.signal.aborted) ac.abort();
  else req.signal.addEventListener("abort", () => ac.abort());

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        if (useOpenAi) {
          await streamOpenAi(controller, encoder, model, prompt, apiKey, ac.signal, grant);
        } else {
          await streamAnthropic(controller, encoder, model, prompt, apiKey, ac.signal, grant);
        }
      } catch (err) {
        // 串流已開始 → 無法改 HTTP status；把錯誤塞進串流尾端讓前端 JSON.parse 失敗時可見。
        if (!ac.signal.aborted) {
          const msg = err instanceof Error ? err.message : "script generation failed";
          controller.enqueue(encoder.encode(`\n[ERROR] ${msg}`));
        }
      } finally {
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
    },
  });
}

// ── Anthropic 路徑（Claude 系列）─────────────────────────────────────────────
async function streamAnthropic(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  model: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  grant: Grant,
): Promise<void> {
  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const stream = await client.beta.messages.create(
    { ...claudeParams(model, MAX_TOKENS), ...claudeFallback(model), system: SYS, messages: [{ role: "user", content: prompt }], stream: true },
    { signal },
  );
  for await (const event of stream) {
    if (signal.aborted) break;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      controller.enqueue(encoder.encode(event.delta.text));
    }
  }
}

// ── OpenAI 路徑（GPT 系列）── Chat Completions SSE，零新依賴（與 generate-core streamOpenAiGeneration 同 pattern）
// gpt-5.x reasoning models 用 max_completion_tokens（拒 max_tokens）且拒非預設 temperature → 兩者都不送 temperature。
async function streamOpenAi(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  model: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  grant: Grant,
): Promise<void> {
  const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_completion_tokens: MAX_TOKENS,
      stream: true,
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: prompt },
      ],
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    controller.enqueue(encoder.encode(`\n[ERROR] OpenAI API error (${res.status})`));
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
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
        };
        if (j.error) {
          controller.enqueue(encoder.encode(`\n[ERROR] ${j.error.message ?? "OpenAI stream error"}`));
          return;
        }
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) controller.enqueue(encoder.encode(piece));
      } catch { /* skip partial/non-JSON keepalive frame */ }
    }
  }
}
