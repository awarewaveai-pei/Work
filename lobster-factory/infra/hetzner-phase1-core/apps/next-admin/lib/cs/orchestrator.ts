// cs-engine orchestrator — the inbound pipeline. Given one customer message it returns a CsDecision
// (auto_sent / draft / handoff / suppressed) and records the audit row. It NEVER throws: any failure
// degrades to a human handoff (safe state, plan §8.4). The caller (Chatwoot AgentBot webhook route)
// turns the decision into a Chatwoot API call.

import { CS_MODELS, CS_THRESHOLDS } from "@/lib/cs/config";
import { canaryRoll, decideAnswerAction, topScore } from "@/lib/cs/autonomy";
import { loadCis } from "@/lib/cs/cis";
import { inputGuards, outputGuards } from "@/lib/cs/guardrails";
import { classifyIntent } from "@/lib/cs/intent";
import { retrieve } from "@/lib/kb";
import { generateReply, runAgenticTurn, superviseReply } from "@/lib/cs/generate";
import { loadEnabledTools, loadIntents, loadMemory, recordReply } from "@/lib/cs/db";
import type {
  CsDecision,
  HandoffReason,
  InboundMessage,
  Intent,
  ToolCallResult,
} from "@/lib/cs/types";

/** Conservative default for messages whose intent isn't configured: draft-only, never auto-send. */
function defaultIntent(key: string): Intent {
  return {
    key,
    label: key,
    answerLevel: "L1",
    actionLevel: "A0",
    isSensitive: false,
    confidenceThreshold: CS_THRESHOLDS.defaultConfidence,
    canaryPct: 0,
  };
}

export function resolveIntent(intents: Intent[], key: string): Intent {
  return intents.find((i) => i.key === key) ?? defaultIntent(key);
}

function makeHandoff(reason: HandoffReason, trace: Record<string, unknown>, chunkIds: string[] = [], toolCalls: ToolCallResult[] = []): CsDecision {
  return { action: "handoff", handoffReason: reason, retrievedChunkIds: chunkIds, toolCalls, traceMeta: trace };
}

async function persist(message: InboundMessage, decision: CsDecision, answerLevel?: string): Promise<void> {
  await recordReply({
    organizationId: message.organizationId,
    conversationId: message.conversationId,
    messageId: message.messageId,
    intentKey: decision.intentKey,
    confidence: decision.confidence,
    retrievalScore: decision.retrievalScore,
    answerLevel,
    action: decision.action,
    retrievedChunkIds: decision.retrievedChunkIds,
    model: CS_MODELS.generate,
    metadata: decision.traceMeta,
  });
}

export async function handleInbound(message: InboundMessage): Promise<CsDecision> {
  // Silence rules: never reply to an agent's own message, or when a human already owns the thread.
  if (message.isFromAgent || message.conversationStatus === "open") {
    return { action: "suppressed", retrievedChunkIds: [], toolCalls: [], traceMeta: { reason: "human_owns_thread" } };
  }

  try {
    // 1. Input guards — cheap rejection before any spend.
    const guard = inputGuards(message.text);
    if (!guard.pass) {
      const d = makeHandoff(guard.handoffReason ?? "guardrail_block", { guard: guard.reason });
      await persist(message, d);
      return d;
    }

    // 2. Tenant context.
    const [cis, intents, memory] = await Promise.all([
      loadCis(message.organizationId),
      loadIntents(message.organizationId),
      loadMemory(message.organizationId, message.contactRef),
    ]);

    // 2b. Per-tenant kill-switch — if disabled, route to a human before any LLM spend.
    if (cis.csEnabled === false) {
      const d = makeHandoff("tenant_killswitch", { killSwitch: true });
      await persist(message, d);
      return d;
    }

    // 3. Classify intent.
    const cls = await classifyIntent({ organizationId: message.organizationId, message: message.text, intents });
    const intent = resolveIntent(intents, cls.intentKey);

    // 4. Retrieve knowledge.
    // Flat tenant today: scope = the org itself, viewer = the org (so its own sensitive docs are
    // visible to it). A tenant tree would pass the whole chain here and change nothing in the KB.
    // includeSensitive: false (migration 0083) -- this IS the customer-service AI's own answer path;
    // a document ticked "敏感" in the ops UI must never end up quoted back to an end user.
    const chunks = await retrieve(
      { scope: [message.organizationId], viewer: message.organizationId, includeSensitive: false },
      message.text,
    );
    const retrievalScore = topScore(chunks);
    const chunkIds = chunks.map((c) => c.id);

    // 5. Generate (agentic when the tenant has tools, else plain RAG reply).
    const tools = await loadEnabledTools(message.organizationId);
    let replyText = "";
    let provider = "claude";
    let toolCalls: ToolCallResult[] = [];
    let toolHandoff = false;
    if (tools.length) {
      const a = await runAgenticTurn({ cis, message: message.text, chunks, memory, tools });
      replyText = a.text;
      toolCalls = a.toolCalls;
      toolHandoff = a.needsHandoff;
    } else {
      const g = await generateReply({ cis, message: message.text, chunks, memory });
      replyText = g.text;
      provider = g.provider;
    }

    // 6. Supervisor verdict (grounding + safety).
    const verdict = replyText
      ? await superviseReply({ reply: replyText, chunks, organizationId: message.organizationId })
      : { grounded: false, safe: false, reason: "empty_reply" };

    // 7. Autonomy decision (deterministic).
    const roll = canaryRoll(message.messageId);
    const decided = decideAnswerAction({
      intent,
      confidence: cls.confidence,
      retrievalScore,
      grounded: verdict.grounded && verdict.safe,
      messageText: message.text,
      roll,
    });

    const trace: Record<string, unknown> = {
      provider,
      classification: cls,
      verdict,
      retrievalScore,
      canaryRoll: roll,
      toolHandoff,
    };

    // 8. Combine overrides: tool handoff / output-guard fail / empty reply all force a human.
    let action = decided.action;
    let handoffReason: HandoffReason | undefined = decided.handoffReason;

    if (toolHandoff && action !== "handoff") {
      action = "handoff";
      handoffReason = "guardrail_block";
    }
    if (action !== "handoff" && action !== "suppressed") {
      const og = outputGuards(replyText);
      if (!og.pass) {
        action = "handoff";
        handoffReason = og.handoffReason ?? "guardrail_block";
        trace.outputGuard = og.reason;
      }
    }
    if (action !== "handoff" && !replyText.trim()) {
      action = "handoff";
      handoffReason = "engine_error";
    }

    const decision: CsDecision = {
      action,
      replyText: action === "auto_sent" || action === "draft" ? replyText : undefined,
      intentKey: intent.key,
      confidence: cls.confidence,
      retrievalScore,
      retrievedChunkIds: chunkIds,
      handoffReason: action === "handoff" ? handoffReason : undefined,
      toolCalls,
      traceMeta: trace,
    };

    await persist(message, decision, intent.answerLevel);
    return decision;
  } catch (err) {
    const d = makeHandoff("engine_error", { error: err instanceof Error ? err.message : String(err) });
    await persist(message, d).catch(() => undefined);
    return d;
  }
}
