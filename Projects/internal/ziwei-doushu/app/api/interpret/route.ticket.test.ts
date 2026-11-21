import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';

// 只測會員票路徑:AI 呼叫換成假的,記錄有沒有走到
const interpretMock = vi.fn(async () => ({ text: 'ok', provider: 'openai', model: 'fake', tier: 'deep' }));
vi.mock('@/lib/ai/interpret', () => ({ interpret: interpretMock, defaultProvider: () => 'openai' }));

const { POST } = await import('./route');
const { __resetRateLimit } = await import('@/lib/http/rateLimit');
const { __resetSiteNonces } = await import('@/lib/sites/verify');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const prevSites = process.env.ORACLE_SITES;
process.env.ORACLE_SITES = JSON.stringify([{ key_id: 'site-a', public_key: PEM, ai_per_day: 2 }]);
afterAll(() => {
  if (prevSites === undefined) delete process.env.ORACLE_SITES;
  else process.env.ORACLE_SITES = prevSites;
});

const goodCtx = { systemId: 'ziwei', locale: 'zh-TW', headline: '破軍 · 木三局', facts: [{ label: 'soul', value: '破軍' }] };
let n = 0;
function post(member: string, opts: { badSig?: boolean; ip?: string; aud?: string } = {}): Request {
  const raw = JSON.stringify({ key_id: 'site-a', ts: Math.floor(Date.now() / 1000), nonce: `nonce-abcdefghij-${++n}`, aud: opts.aud ?? 'ticket', member });
  const signed = opts.badSig ? `${raw} ` : raw;
  return new Request('http://localhost/api/interpret', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Real-IP': opts.ip ?? `10.0.0.${n}`,
      'X-AwareWave-Oracle-Ticket': Buffer.from(raw).toString('base64url'),
      'X-AwareWave-Oracle-Signature': sign(null, Buffer.from(signed), privateKey).toString('base64'),
    },
    body: JSON.stringify({ context: goodCtx }),
  });
}
const A = 'member-aaaaaaaa-0001';
const B = 'member-bbbbbbbb-0002';

beforeEach(() => {
  __resetRateLimit();
  __resetSiteNonces();
  interpretMock.mockClear();
});

describe('/api/interpret 會員票', () => {
  it('正確票 → 走到 AI 呼叫', async () => {
    const r = await POST(post(A));
    expect(r.status).toBe(200);
    expect(interpretMock).toHaveBeenCalledTimes(1);
  });

  it('錯簽 → 401,不退回匿名、不呼叫 AI', async () => {
    const r = await POST(post(A, { badSig: true }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'invalid_signature' });
    expect(interpretMock).not.toHaveBeenCalled();
  });

  it('aud 不是 ticket(v1 原文當票)→ 401 wrong_audience,不扣每日次數', async () => {
    const r = await POST(post(A, { aud: 'v1' }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'wrong_audience' });
    expect((await POST(post(A))).status).toBe(200);
    expect((await POST(post(A))).status).toBe(200); // ai_per_day = 2:被拒的那次沒算
    expect(interpretMock).toHaveBeenCalledTimes(2);
  });

  it('空的票標頭 → 400,不退回匿名', async () => {
    const req = post(A);
    req.headers.set('X-AwareWave-Oracle-Ticket', '');
    const r = await POST(req);
    expect(r.status).toBe(400);
    expect(interpretMock).not.toHaveBeenCalled();
  });

  it('同一假名第 ai_per_day+1 次 → 429 帶 Retry-After;不同假名各自計數', async () => {
    expect((await POST(post(A))).status).toBe(200);
    expect((await POST(post(A))).status).toBe(200);
    const over = await POST(post(A));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(JSON.stringify(await over.json())).not.toContain('破軍');
    expect((await POST(post(B))).status).toBe(200);
    expect(interpretMock).toHaveBeenCalledTimes(3);
  });
});
