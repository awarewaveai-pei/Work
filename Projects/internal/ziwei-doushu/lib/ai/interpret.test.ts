import { describe, it, expect } from 'vitest';
import { defaultProvider, getProvider, interpret } from './interpret';
import { AiNotConfiguredError } from './errors';
import type { InterpretRequest } from './types';

const req: InterpretRequest = {
  context: {
    systemId: 'ziwei',
    locale: 'zh-TW',
    headline: '破軍 · 木三局',
    facts: [{ label: 'soul', value: '破軍' }],
  },
  tier: 'light',
  locale: 'zh-TW',
};

describe('廠商無關 AI 解讀層', () => {
  it('預設 provider = GPT(openai)', () => {
    // 註:測試環境未設 AI_PROVIDER → 預設 openai
    if (!process.env.AI_PROVIDER) {
      expect(defaultProvider()).toBe('openai');
    }
    expect(getProvider('openai').id).toBe('openai');
    expect(getProvider('anthropic').id).toBe('anthropic');
  });

  it('provider 未設 API key 時,interpret 丟 AiNotConfiguredError', async () => {
    if (getProvider('openai').isConfigured()) return; // 已設 key 則跳過
    await expect(interpret(req, 'openai')).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
  });
});
