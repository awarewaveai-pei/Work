import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ScriptForge 影片腳本生成器的單一 LLM 中轉端點。
// 前端（app/tools/video/ScriptForge.tsx）24 個模組全走同一個 claude(prompt) → 這條 route。
// 設計與 app/api/content/generate/route.ts 一致：
//   - role gate（resolveOpsRole + canCreateAiImageJob，與其他 AI 端點同權限）
//   - apiKey 只存在伺服器（ANTHROPIC_API_KEY），絕不下放瀏覽器（修掉原 .jsx 直連 api.anthropic.com 的 401/金鑰外洩）
//   - SYS 固定在伺服器端 = 受限端點（client 只能送 prompt，不能改 system）
//   - 回 text/plain ReadableStream，保留逐字串流 UX（前端逐塊累加後 JSON.parse）
// model 維持原 .jsx 的 claude-sonnet-4-6。

const SYS = `你是世界頂級短影音腳本策略師、廣告創意總監與多語言內容專家。輸出必須是純JSON，不加任何markdown包裹或前言後記。台詞口語自然；畫面指令具體；字幕最多12字。`;

interface ScriptForgeBody {
  prompt?: string;
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: ScriptForgeBody;
  try {
    body = (await req.json()) as ScriptForgeBody;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  // 上限保護：bound 輸入 token 成本（CJK ≈ 1 token/字）。文章轉腳本模組會貼整篇，故給寬鬆 24k
  // 但仍封頂，避免單次 multi-MB prompt 把 input token 成本拉爆（critic 2026-06-19 Major）。
  const MAX_PROMPT_CHARS = 24000;
  const prompt = (typeof body.prompt === "string" ? body.prompt : "").slice(0, MAX_PROMPT_CHARS).trim();
  if (!prompt) return new NextResponse("prompt required", { status: 400 });

  const client = new Anthropic({ apiKey });

  // Abort plumbing — 與 content/generate 同樣的 belt-and-suspenders：req.signal 監聽 + ReadableStream
  // cancel() 雙保險，client 斷線時中止 in-flight Anthropic stream（不浪費 token）。
  const ac = new AbortController();
  if (req.signal.aborted) ac.abort();
  else req.signal.addEventListener("abort", () => ac.abort());

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const stream = await client.messages.create(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 4000,
            system: SYS,
            messages: [{ role: "user", content: prompt }],
            stream: true,
          },
          { signal: ac.signal },
        );
        for await (const event of stream) {
          if (ac.signal.aborted) break;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        // 串流已開始 → 無法改 HTTP status；把錯誤訊息塞進串流尾端讓前端 JSON.parse 失敗時可見。
        if (!ac.signal.aborted) {
          const msg = err instanceof Error ? err.message : "script generation failed";
          controller.enqueue(new TextEncoder().encode(`\n[ERROR] ${msg}`));
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
