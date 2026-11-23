// U3.6: one-click uses the same two registered tasks as U3.5. Reserve before either paid call.
import { textCallCostUsd } from "@/lib/ai/cost-calculator";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { claudeParams } from "@/lib/ai/claude-params";
import { isOpenAiTextModel, normalizeAiTextModel, openAiCompletionBudget } from "@/lib/ai/text-model-options";
import { forgePrompt, type ForgeCtx } from "./modules";
export const FORGE_MAX_PROMPT_CHARS = 24000, FORGE_MAX_TOKENS = 4000;
export function forgeCallUpperTwd(model: string, system: string, prompt: string): number {
  const selected = normalizeAiTextModel(model);
  const outputTokens = isOpenAiTextModel(selected) ? openAiCompletionBudget(FORGE_MAX_TOKENS) : claudeParams(selected, FORGE_MAX_TOKENS).max_tokens;
  const inputTokens = Buffer.byteLength(system + prompt.slice(0, FORGE_MAX_PROMPT_CHARS), "utf8") + 512;
  // Cache writes, if a gateway makes one, cost more than plain input; reserve both to stay conservative.
  return Math.ceil(textCallCostUsd({ model: selected, inputTokens, cacheWriteTokens: inputTokens, outputTokens }) * TWD_RATE * 100) / 100;
}
export function forgeRunUpperTwd(plan: { model?: string; fields?: Record<string, unknown> }, ctx: ForgeCtx): number {
  const model = normalizeAiTextModel(plan.model), script = forgePrompt("manual", "script", plan.fields || {}, ctx)!;
  // The score consumes the generated hook/CTA, whose combined size cannot exceed the script response cap.
  const score = forgePrompt("result", "score", { hook: "文".repeat(FORGE_MAX_PROMPT_CHARS), scenes: ctx.sceneCount, cta: "" }, ctx)!;
  return Math.round((forgeCallUpperTwd(model, script.system, script.prompt) + forgeCallUpperTwd(model, score.system, score.prompt)) * 100) / 100;
}
