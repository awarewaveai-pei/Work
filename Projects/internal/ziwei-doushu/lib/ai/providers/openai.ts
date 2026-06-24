import type { AiProviderAdapter } from '../types';
import { AiNotImplementedError } from '../errors';

/**
 * OpenAI (GPT) provider — 預設家(operator 偏好其解說)。
 * F3 階段為接縫 stub:介面已固定、env 偵測已通;實際呼叫待 AI 階段接 SDK
 * (依 tier 選模型 + streaming 萬字 + prompt caching,見 PLAN §6)。
 */
export const openaiAdapter: AiProviderAdapter = {
  id: 'openai',
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  async interpret() {
    throw new AiNotImplementedError('openai');
  },
};
