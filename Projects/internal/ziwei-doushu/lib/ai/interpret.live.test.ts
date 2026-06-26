import { describe, it, expect } from 'vitest';
import { interpret } from './interpret';
import type { InterpretRequest } from './types';

/**
 * 真實 LLM 呼叫的端到端 smoke (R0 REALTEST)。
 *
 * 預設「跳過」——僅當 RUN_LIVE_AI=1 時才打真 API,避免一般 `npm test` / CI 燒額度
 *   或在無 key 環境失敗。本機驗證跑法(key 由 vault 注入 runtime,勿寫進 repo):
 *     RUN_LIVE_AI=1 OPENAI_API_KEY=sk-... npx vitest run lib/ai/interpret.live
 */
const LIVE = process.env.RUN_LIVE_AI === '1';
const suite = LIVE ? describe : describe.skip;

const req: InterpretRequest = {
  context: {
    systemId: 'ziwei',
    locale: 'zh-TW',
    headline: '破軍 · 木三局',
    facts: [
      { label: 'soul', value: '破軍' },
      { label: 'fiveElements', value: '木三局' },
      { label: 'palace:命宮', value: '破軍' },
    ],
  },
  tier: 'light',
  locale: 'zh-TW',
};

suite('AI 解讀真實呼叫 (RUN_LIVE_AI)', () => {
  it(
    'openai light 回傳非空解讀並標明 model',
    { timeout: 60_000 },
    async () => {
      const reading = await interpret(req, 'openai');
      expect(reading.text.length).toBeGreaterThan(20);
      expect(reading.provider).toBe('openai');
      expect(reading.model).toBeTruthy();
    },
  );

  it(
    'openai deep(max_completion_tokens=5000)不被 400 拒絕',
    { timeout: 90_000 },
    async () => {
      // 回歸:deep/premium 的 token 預算曾超出裸 gpt-4o 的 4096 輸出上限導致
      //   400(critic 2026-06-26)。釘 16384 輸出快照後須能成功回讀。
      const reading = await interpret({ ...req, tier: 'deep' }, 'openai');
      expect(reading.text.length).toBeGreaterThan(20);
      expect(reading.provider).toBe('openai');
    },
  );
});
