import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

// 只測深度報告的擁有權守衛:模型呼叫換成假的,記錄有沒有走到
const llmMock = vi.fn(async (req: { system: string }) => {
  const title = /本章標題:「## (.+?)」/.exec(req.system)?.[1] ?? '';
  return { text: `## ${title}\n內容。`, usage: { model: 'gpt-6.2-sol', input: 1, cachedInput: 0, output: 1 } };
});
vi.mock('@/lib/ai/providers/openai', () => ({ openaiComplete: llmMock }));

const { POST } = await import('./route');
const { __resetRateLimit } = await import('@/lib/http/rateLimit');
const { __resetSiteNonces } = await import('@/lib/sites/verify');
const { chartKey } = await import('@/lib/sites/purchase');
const { signPurchaseTicket } = await import('@/lib/sites/purchase.testing');
const { parseInput } = await import('@/lib/divination/input');
const { ziweiSystem } = await import('@/lib/divination/systems/ziwei');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const prevSites = process.env.ORACLE_SITES;
process.env.ORACLE_SITES = JSON.stringify([
  { key_id: 'site-a', public_key: publicKey.export({ format: 'pem', type: 'spki' }).toString(), ai_per_day: 5 },
]);
afterAll(() => {
  if (prevSites === undefined) delete process.env.ORACLE_SITES;
  else process.env.ORACLE_SITES = prevSites;
});

const MINE = {
  calendar: 'solar', year: 2000, month: 8, day: 16, hour: 14, minute: 30, gender: '女',
  place: { label: '台北', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' }, trueSolar: true,
};
const OTHER = { ...MINE, day: 17 };
const keyOf = (input: Record<string, unknown>) => {
  const p = parseInput(ziweiSystem.input, input);
  if (!p.ok) throw new Error('bad fixture');
  return chartKey('ziwei', p.value as unknown as Record<string, unknown>);
};
const now = new Date();
const today = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
const MEMBER = 'member-aaaaaaaa-0001';

let ip = 0;
function deep(ticket?: { ticket: string; signature: string }): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Real-IP': `10.1.0.${++ip}` };
  if (ticket) {
    headers['X-AwareWave-Oracle-Ticket'] = ticket.ticket;
    headers['X-AwareWave-Oracle-Signature'] = ticket.signature;
  }
  return new Request('http://localhost/api/reading', {
    method: 'POST',
    headers,
    body: JSON.stringify({ systemId: 'ziwei', stage: 'deep', input: MINE, today }),
  });
}
const ticketFor = (over: { chart?: string; report?: string; aud?: string } = {}) =>
  signPurchaseTicket(privateKey, {
    keyId: 'site-a',
    member: MEMBER,
    report: over.report ?? 'ziwei-deep',
    chart: over.chart ?? keyOf(MINE),
    aud: over.aud,
  });

beforeEach(() => {
  __resetRateLimit();
  __resetSiteNonces();
  llmMock.mockClear();
});

describe('/api/reading 深度報告的購買票', () => {
  it('沒票 → 401 purchase_required,不呼叫模型', async () => {
    const r = await POST(deep());
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: 'purchase_required' });
    expect(llmMock).not.toHaveBeenCalled();
  });

  it('錯票(簽章不符、或拿會員票 aud=ticket 來當購買票)→ 401,不呼叫模型', async () => {
    const t = ticketFor();
    const forged = await POST(deep({ ticket: t.ticket, signature: ticketFor().signature }));
    expect(forged.status).toBe(401);
    const member = await POST(deep(ticketFor({ aud: 'ticket' })));
    expect(member.status).toBe(401);
    expect(await member.json()).toEqual({ error: 'wrong_audience' });
    expect(llmMock).not.toHaveBeenCalled();
  });

  it('別人的票(買的是別張盤或別種報告)→ 403 not_purchased,不呼叫模型', async () => {
    const other = await POST(deep(ticketFor({ chart: keyOf(OTHER) })));
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: 'not_purchased' });
    const kind = await POST(deep(ticketFor({ report: 'bazi-deep' })));
    expect(kind.status).toBe(403);
    expect(llmMock).not.toHaveBeenCalled();
  });

  it('這張盤的票 → 產生深度報告(每章一次模型呼叫)', async () => {
    const r = await POST(deep(ticketFor()));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.chartKey).toBe(keyOf(MINE));
    expect(body.text).toContain('## 格局');
    expect(llmMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
