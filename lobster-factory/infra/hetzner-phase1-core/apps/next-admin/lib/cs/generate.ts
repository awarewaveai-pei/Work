// cs-engine generation + supervision + agentic tool loop.
//   generateReply   — plain RAG-grounded reply (Claude→Gemini failover).
//   superviseReply  — independent grounding/safety verdict (defence-in-depth before send).
//   runAgenticTurn  — Claude tool loop gated by tools.ts (A1 runs, A2/A3 → human). Used only when
//                     the tenant has enabled tools; otherwise the orchestrator uses generateReply.

import Anthropic from "@anthropic-ai/sdk";
import { CS_MODELS, CS_THRESHOLDS, CS_TIMEOUTS } from "@/lib/cs/config";
import { buildSystemPrompt, buildUserContext, renderPassage } from "@/lib/cs/cis";
import { claudeTurn, extractText, extractToolUses, generateText, parseJsonObject } from "@/lib/cs/llm";
import { getToolHandler, resolveToolDecision } from "@/lib/cs/tools";
import type { RetrievedChunk } from "@/lib/kb/types";
import type {
  CisProfile,
  SupervisorVerdict,
  ToolCallResult,
  ToolSpec,
} from "@/lib/cs/types";

export async function generateReply(opts: {
  cis: CisProfile;
  message: string;
  chunks: RetrievedChunk[];
  memory?: string[];
}): Promise<{ text: string; provider: string }> {
  const system = buildSystemPrompt(opts.cis);
  const user = buildUserContext({ message: opts.message, chunks: opts.chunks, memory: opts.memory });
  const { text, provider } = await generateText({
    system,
    user,
    model: CS_MODELS.generate,
    maxTokens: 800,
    route: "/cs/generate",
    organizationId: opts.cis.organizationId,
    timeoutMs: CS_TIMEOUTS.generateMs,
  });
  return { text, provider };
}

/** Map a parsed supervisor JSON to a verdict. PURE + fail-closed: any missing/false field ⇒ block. */
export function parseVerdict(v: { grounded?: boolean; safe?: boolean; reason?: string } | null): SupervisorVerdict {
  if (!v) return { grounded: false, safe: false, reason: "supervisor_parse_failed" };
  return { grounded: v.grounded === true, safe: v.safe === true, reason: v.reason ?? "" };
}

/** Independent supervisor: is the draft grounded in the knowledge and safe to send? */
export async function superviseReply(opts: {
  reply: string;
  chunks: RetrievedChunk[];
  organizationId: string;
}): Promise<SupervisorVerdict> {
  // The supervisor reads the same passages the writer did, wrapped the same way. Handing the
  // reviewer un-fenced text would leave the one component whose job is to catch a bad draft as the
  // one component still reading attacker-chosen sentences as prose.
  const knowledge = opts.chunks.length
    ? opts.chunks.map((c, i) => renderPassage(c, i + 1)).join("\n\n")
    : "（無）";
  const system =
    "你是一個獨立的客服品質審查員。判斷『回覆草稿』是否 (a) 完全由『知識』支撐、沒有編造，(b) 安全（沒有洩漏他人個資、沒有違規承諾）。只輸出 JSON，不要解釋。";
  const user = [
    "知識：",
    knowledge,
    "",
    "回覆草稿：",
    opts.reply,
    "",
    '回傳：{"grounded":true/false,"safe":true/false,"reason":"<簡短理由>"}',
  ].join("\n");

  try {
    const { text } = await generateText({
      system,
      user,
      model: CS_MODELS.supervisor,
      maxTokens: 200,
      route: "/cs/supervise",
      organizationId: opts.organizationId,
      timeoutMs: CS_TIMEOUTS.supervisorMs,
    });
    const v = parseJsonObject<{ grounded?: boolean; safe?: boolean; reason?: string }>(text);
    return parseVerdict(v);
  } catch {
    return { grounded: false, safe: false, reason: "supervisor_error" };
  }
}

export interface AgenticResult {
  text: string;
  toolCalls: ToolCallResult[];
  needsHandoff: boolean;
}

function toAnthropicTools(tools: ToolSpec[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const hasShape = t.schema && (t.schema as { type?: unknown }).type === "object";
    const input_schema = (hasShape ? t.schema : { type: "object", properties: {} }) as Anthropic.Tool["input_schema"];
    return { name: t.name, description: t.description ?? t.name, input_schema };
  });
}

/**
 * Agentic tool loop. Runs Claude with the tenant's enabled tools; each tool_use is gated by
 * resolveToolDecision before any execution. A2/A3 (or a missing handler) sets needsHandoff and
 * returns a benign "需要真人" tool_result so the model wraps up gracefully. Bounded by maxToolRounds.
 */
export async function runAgenticTurn(opts: {
  cis: CisProfile;
  message: string;
  chunks: RetrievedChunk[];
  memory?: string[];
  tools: ToolSpec[];
}): Promise<AgenticResult> {
  const system = buildSystemPrompt(opts.cis);
  const userText = buildUserContext({ message: opts.message, chunks: opts.chunks, memory: opts.memory });
  const anthropicTools = toAnthropicTools(opts.tools);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
  const toolCalls: ToolCallResult[] = [];
  let needsHandoff = false;

  for (let round = 0; round < CS_THRESHOLDS.maxToolRounds; round++) {
    const msg = await claudeTurn({
      model: CS_MODELS.generate,
      system,
      messages,
      maxTokens: 800,
      tools: anthropicTools,
      route: "/cs/agentic",
      organizationId: opts.cis.organizationId,
      timeoutMs: CS_TIMEOUTS.generateMs,
    });

    const uses = extractToolUses(msg);
    if (msg.stop_reason !== "tool_use" || uses.length === 0) {
      return { text: extractText(msg), toolCalls, needsHandoff };
    }

    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const use of uses) {
      const params = (use.input ?? {}) as Record<string, unknown>;
      const spec = opts.tools.find((t) => t.name === use.name);

      if (!spec) {
        toolCalls.push({ toolName: use.name, risk: "A3_human_only", status: "denied", params, reason: "not_in_allowlist" });
        results.push({ type: "tool_result", tool_use_id: use.id, content: "這個動作不在允許清單內。", is_error: true });
        needsHandoff = true;
        continue;
      }

      const decision = resolveToolDecision(spec, params);
      if (!decision.allow) {
        toolCalls.push({ toolName: spec.name, risk: spec.risk, status: decision.status, params, reason: decision.reason });
        if (decision.status === "pending_human" || decision.status === "pending_confirm") needsHandoff = true;
        results.push({ type: "tool_result", tool_use_id: use.id, content: "這個動作需要真人專員協助處理（尚未執行）。", is_error: true });
        continue;
      }

      const handler = getToolHandler(spec.name);
      if (!handler) {
        toolCalls.push({ toolName: spec.name, risk: spec.risk, status: "error", params, reason: "no_handler" });
        results.push({ type: "tool_result", tool_use_id: use.id, content: "目前無法執行這個查詢。", is_error: true });
        needsHandoff = true;
        continue;
      }

      try {
        const output = await handler(params);
        toolCalls.push({ toolName: spec.name, risk: spec.risk, status: "ok", params, output });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output).slice(0, 2000) });
      } catch {
        toolCalls.push({ toolName: spec.name, risk: spec.risk, status: "error", params, reason: "handler_threw" });
        results.push({ type: "tool_result", tool_use_id: use.id, content: "查詢時發生問題。", is_error: true });
        needsHandoff = true;
      }
    }

    messages.push({ role: "user", content: results });
  }

  // Rounds exhausted without a final text answer ⇒ hand to a human.
  return { text: "", toolCalls, needsHandoff: true };
}
