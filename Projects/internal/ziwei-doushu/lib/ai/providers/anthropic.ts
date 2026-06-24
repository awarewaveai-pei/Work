import type { AiProviderAdapter } from '../types';
import { AiNotImplementedError } from '../errors';

/**
 * Anthropic (Claude) provider — 可切換備選,用於真命盤 A/B 對比 GPT。
 * F3 階段為接縫 stub:介面已固定、env 偵測已通;實際呼叫待 AI 階段接 SDK。
 */
export const anthropicAdapter: AiProviderAdapter = {
  id: 'anthropic',
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async interpret() {
    throw new AiNotImplementedError('anthropic');
  },
};
