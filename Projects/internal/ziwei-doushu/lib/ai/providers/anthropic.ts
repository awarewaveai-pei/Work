import Anthropic from '@anthropic-ai/sdk';
import type { AiProviderAdapter, InterpretRequest, Reading } from '../types';
import { buildPrompt } from '../prompts';
import { ALWAYS_THINKS, ANTHROPIC_EFFORT, MAX_TOKENS, THINKING_HEADROOM_TOKENS, modelFor } from '../models';
import { AiCallError } from '../errors';

/**
 * Anthropic (Claude) provider — 可切換備選,用於真命盤 A/B 對比 GPT (PLAN §6)。
 *
 * 同一 Centaur 管線:buildPrompt() 注入結構化事實,LLM 只敘事(NO CALCULATIONS)。
 * system prompt 標 cache_control(穩定段落)→ 知識庫長大後自動命中 prompt cache。
 */
let client: Anthropic | null = null;
function getClient(): Anthropic {
  // timeout/maxRetries 明設:同 openai,封住 upstream 卡住的連線佔用(critic 2026-06-26)。
  if (!client)
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 60_000,
      maxRetries: 1,
    });
  return client;
}

export const anthropicAdapter: AiProviderAdapter = {
  id: 'anthropic',
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async interpret(req: InterpretRequest): Promise<Reading> {
    const { system, user } = buildPrompt(req);
    const model = modelFor('anthropic', req.tier);
    try {
      const res = await getClient().messages.create({
        model,
        max_tokens: MAX_TOKENS[req.tier] + (ALWAYS_THINKS.test(model) ? THINKING_HEADROOM_TOKENS : 0),
        ...(ANTHROPIC_EFFORT[req.tier] && !model.startsWith('claude-haiku-')
          ? { output_config: { effort: ANTHROPIC_EFFORT[req.tier] } }
          : {}),
        system: [
          { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: user }],
      });
      // 拒答或截斷都不是完整報告(半句話不可交付)
      if (res.stop_reason === 'refusal') throw new AiCallError('anthropic', '模型拒答(refusal)');
      if (res.stop_reason === 'max_tokens') throw new AiCallError('anthropic', '輸出超過上限被截斷(max_tokens)');
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) throw new AiCallError('anthropic', '空回應(無 text 內容)');
      return { text, provider: 'anthropic', model };
    } catch (err) {
      if (err instanceof AiCallError) throw err;
      throw new AiCallError(
        'anthropic',
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};
