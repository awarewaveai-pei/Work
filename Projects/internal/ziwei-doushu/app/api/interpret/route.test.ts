import { describe, it, expect } from 'vitest';
import { POST } from './route';

function post(body: unknown): Request {
  return new Request('http://localhost/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const goodCtx = {
  systemId: 'ziwei',
  locale: 'zh-TW',
  headline: '破軍 · 木三局',
  facts: [{ label: 'soul', value: '破軍' }],
};

describe('/api/interpret 輸入驗證(信任邊界)', () => {
  it('缺 context → 400', async () => {
    const r = await POST(post({}));
    expect(r.status).toBe(400);
  });

  it('未知 systemId → 400', async () => {
    const r = await POST(post({ context: { ...goodCtx, systemId: 'xxx' } }));
    expect(r.status).toBe(400);
  });

  it('未知 locale → 400', async () => {
    const r = await POST(post({ context: { ...goodCtx, locale: 'fr' } }));
    expect(r.status).toBe(400);
  });

  it('facts 超過上限(60)→ 400', async () => {
    const facts = Array.from({ length: 61 }, () => ({ label: 'a', value: 'b' }));
    const r = await POST(post({ context: { ...goodCtx, facts } }));
    expect(r.status).toBe(400);
  });

  it('單一 fact value 超長 → 400', async () => {
    const facts = [{ label: 'x', value: 'a'.repeat(301) }];
    const r = await POST(post({ context: { ...goodCtx, facts } }));
    expect(r.status).toBe(400);
  });

  it('premium tier 被拒(付費牆前不開放)→ 400', async () => {
    const r = await POST(post({ context: goodCtx, tier: 'premium' }));
    expect(r.status).toBe(400);
  });

  it('未知 provider → 400', async () => {
    const r = await POST(post({ context: goodCtx, provider: 'bogus' }));
    expect(r.status).toBe(400);
  });

  it('合法 context 但無 OPENAI key → 503 ai_not_configured', async () => {
    if (process.env.OPENAI_API_KEY) return; // 有 key 時(live)跳過
    const r = await POST(post({ context: goodCtx }));
    expect(r.status).toBe(503);
    const data = (await r.json()) as { error: string };
    expect(data.error).toBe('ai_not_configured');
  });
});

/** 真實端到端:RUN_LIVE_AI=1 才打真 GPT(避免一般 test/CI 燒額度)。 */
const LIVE = process.env.RUN_LIVE_AI === '1';
(LIVE ? describe : describe.skip)('/api/interpret 真實呼叫', () => {
  it(
    '回 200 + 非空 text',
    { timeout: 60_000 },
    async () => {
      const r = await POST(post({ context: goodCtx, tier: 'light' }));
      expect(r.status).toBe(200);
      const data = (await r.json()) as { text: string; provider: string };
      expect(data.text.length).toBeGreaterThan(20);
      expect(data.provider).toBe('openai');
    },
  );
});
