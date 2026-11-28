import OpenAI from 'openai';
import type { AiProviderAdapter, InterpretRequest, Reading } from '../types';
import { buildPrompt } from '../prompts';
import { MAX_TOKENS, modelFor } from '../models';
import { AiCallError, AiNotConfiguredError } from '../errors';
import type { Llm } from '../twoStage/types';

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
  // timeout/maxRetries 明設:解讀端點付費牆前開放,封住 upstream 卡住的連線佔用
  //   DoS(SDK 預設 10 分鐘 + retry 2 次太寬 — critic 2026-06-26)。
  if (!client)
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 1,
    });
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
        // 用 max_completion_tokens(非已棄用的 max_tokens):o-series 推理模型不收
        //   max_tokens。因模型 ID 可由 env 覆寫(OPENAI_MODEL_*),operator 換成
        //   o4-mini 之類也不會悄悄壞掉(critic 2026-06-26)。
        max_completion_tokens: MAX_TOKENS[req.tier],
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

let longClient: OpenAI | null = null;

/**
 * 兩段式解讀(lib/ai/twoStage)的模型呼叫:回文字與 token 用量(成本估算用)。
 * 深度報告一章推理加輸出可達數萬 token,逾時放寬到 180 秒、不重試(重試會重複計費)。
 */
export const openaiComplete: Llm = async (req) => {
  if (!process.env.OPENAI_API_KEY) throw new AiNotConfiguredError('openai');
  if (!longClient) longClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 180_000, maxRetries: 0 });
  try {
    const res = await longClient.chat.completions.create({
      model: req.model,
      max_completion_tokens: req.maxTokens,
      reasoning_effort: req.effort,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() ?? '';
    if (!text) throw new AiCallError('openai', `空回應(finish_reason=${res.choices[0]?.finish_reason ?? '?'})`);
    return {
      text,
      usage: {
        model: req.model,
        input: res.usage?.prompt_tokens ?? 0,
        cachedInput: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        output: res.usage?.completion_tokens ?? 0,
      },
    };
  } catch (err) {
    if (err instanceof AiCallError) throw err;
    throw new AiCallError('openai', err instanceof Error ? err.message : String(err));
  }
};
