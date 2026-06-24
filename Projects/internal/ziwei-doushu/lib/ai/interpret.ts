import type { AiProviderId, AiProviderAdapter, InterpretRequest, Reading } from './types';
import { openaiAdapter } from './providers/openai';
import { anthropicAdapter } from './providers/anthropic';
import { AiNotConfiguredError } from './errors';

/**
 * 廠商無關 AI 解讀入口 (F3 接縫,PLAN §6)。
 * 預設 GPT;可由環境變數 AI_PROVIDER 或呼叫參數切換到 Claude,供真命盤 A/B。
 * 加一家 provider = 加一個 adapter,本檔與上游不需改 → 不重工。
 */
const PROVIDERS: Record<AiProviderId, AiProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
};

export function defaultProvider(): AiProviderId {
  return process.env.AI_PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
}

export function getProvider(id: AiProviderId): AiProviderAdapter {
  return PROVIDERS[id];
}

export async function interpret(
  req: InterpretRequest,
  providerId: AiProviderId = defaultProvider(),
): Promise<Reading> {
  const provider = PROVIDERS[providerId];
  if (!provider.isConfigured()) throw new AiNotConfiguredError(providerId);
  return provider.interpret(req);
}
