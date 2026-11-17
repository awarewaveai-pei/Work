import { CLAUDE_FAST_MODEL } from "@/lib/ai/gateway";
import { textCallCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { buildPrompt, MAX_WRITER_CALLS, type WriteInput } from "@/lib/social/write-posts";

export interface AutoBudget { runId: string; budgetTwd: number; spentTwd: number; renderRatios?: string[]; startedAt?: string; episodeId?: string }

// UTF-8 bytes bound input tokens; the writer has no cache writes and caps each answer at 2,000 tokens.
export function draftCallUpperTwd(prompt: string): number {
  return Math.ceil(textCallCostUsd({ model: CLAUDE_FAST_MODEL, inputTokens: Buffer.byteLength(prompt, "utf8") + 512, outputTokens: 2000 }) * TWD_RATE * 100) / 100;
}
export function draftQuoteUsd(input: WriteInput): number {
  if (!input.keys.length) return 0;
  const prompt = buildPrompt(input, input.keys, input.keys.map((key) => ({ key, length: 999999999, limit: 1 })), undefined, input.keys);
  return (draftCallUpperTwd(prompt) * MAX_WRITER_CALLS) / (usdToNtd(1));
}
export function parseAutoBudget(value: unknown): AutoBudget | null {
  const v = value as Partial<AutoBudget> | null;
  return v && typeof v.runId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v.runId)
    && Number.isFinite(v.budgetTwd) && Number(v.budgetTwd) >= 0
    && Number.isFinite(v.spentTwd) && Number(v.spentTwd) >= 0 && Number(v.spentTwd) <= Number(v.budgetTwd)
    ? { runId: v.runId, budgetTwd: Number(v.budgetTwd), spentTwd: Number(v.spentTwd),
      ...(typeof v.startedAt === "string" ? { startedAt: v.startedAt } : {}),
      ...(typeof v.episodeId === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(v.episodeId) ? { episodeId: v.episodeId } : {}),
      ...(Array.isArray(v.renderRatios) && v.renderRatios.length && v.renderRatios.every((r) => ["16x9", "9x16", "4x5"].includes(r)) ? { renderRatios: [...new Set(v.renderRatios)] } : {}) } : null;
}
export function reserveDraftCall(budget: AutoBudget, prompt: string): AutoBudget {
  const cost = draftCallUpperTwd(prompt);
  if (budget.spentTwd + cost > budget.budgetTwd + 1e-9) throw Error(`已到上限 NT$${budget.budgetTwd}，草稿文案下一次呼叫最多需要 NT$${cost}`);
  return { ...budget, spentTwd: Math.round((budget.spentTwd + cost) * 100) / 100 };
}
