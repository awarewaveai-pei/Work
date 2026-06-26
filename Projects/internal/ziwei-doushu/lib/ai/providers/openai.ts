import OpenAI from 'openai';
import type { AiProviderAdapter, InterpretRequest, Reading } from '../types';
import { buildPrompt } from '../prompts';
import { MAX_TOKENS, modelFor } from '../models';
import { AiCallError } from '../errors';

/**
 * OpenAI (GPT) provider — 預設家 (PLAN §6,operator 偏好其解說)。
 *
 * Centaur:確定性引擎算好的結構化事實由 buildPrompt() 注入 system+user prompt,
 *   LLM 只敘事不算數(NO CALCULATIONS)。模型依 tier 由 models.ts 解析(env 可覆寫)。
 * 串流(萬字報告)為後續增量;此接縫回非串流 Reading,屆時加 interpretStream 即可。
 */
let client: OpenAI | null = null;
function getClient(): OpenAI {
  // 延遲建構:模組載入時不需要 key(isConfigured 只讀 env),真正呼叫時才需。
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const openaiAdapter: AiProviderAdapter = {
  id: 'openai',
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  async interpret(req: InterpretRequest): Promise<Reading> {
    const { system, user } = buildPrompt(req);
    const model = modelFor('openai', req.tier);
    try {
      const res = await getClient().chat.completions.create({
        model,
        max_tokens: MAX_TOKENS[req.tier],
        messages: [
          // 穩定的 system prompt 放最前;OpenAI 對 >1024 token 的前綴自動快取。
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = res.choices[0]?.message?.content?.trim() ?? '';
      if (!text) throw new AiCallError('openai', '空回應(無 completion 內容)');
      return { text, provider: 'openai', model };
    } catch (err) {
      if (err instanceof AiCallError) throw err;
      throw new AiCallError(
        'openai',
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};
