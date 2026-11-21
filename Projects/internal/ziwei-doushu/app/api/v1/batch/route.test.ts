import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { POST as batch } from './route';
import { POST as single } from '../systems/[id]/route';
import { GET as places, OPTIONS as placesOptions } from '../places/route';
import { __resetRateLimit } from '@/lib/http/rateLimit';
import { __resetSiteNonces } from '@/lib/sites/verify';
import { verifyTicket } from '@/lib/sites/ticket';

// lib/places/server.ts 的 server-only 由 Next 提供,vitest 沒有;只在這裡換成空模組
vi.mock('server-only', () => ({}));

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ format: 'pem', type: 'spki' }).toString();
let n = 0;
const nonce = () => `nonce-abcdefghij-${++n}`;

function signedRequest(url: string, body: Record<string, unknown>, keyId = 'site-a') {
  const raw = JSON.stringify({ key_id: keyId, ts: Math.floor(Date.now() / 1000), nonce: nonce(), aud: 'v1', ...body });
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '198.51.100.7',
      'x-awarewave-oracle-signature': sign(null, Buffer.from(raw), privateKey).toString('base64'),
    },
    body: raw,
  });
}

const birth = (day: number) => ({
  calendar: 'solar', year: 1990, month: 5, day, hour: 7, minute: 15, gender: '女',
  place: { label: 'London', lat: 51.51, lon: -0.13, zone: 'Europe/London' }, trueSolar: true,
  date: { year: 2026, month: 11, day: 21 },
});

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.ORACLE_SITES;
  process.env.ORACLE_SITES = JSON.stringify([{ key_id: 'site-a', public_key: PEM, requests_per_minute: 400 }]);
  __resetRateLimit();
  __resetSiteNonces();
});
afterEach(() => {
  if (saved === undefined) delete process.env.ORACLE_SITES;
  else process.env.ORACLE_SITES = saved;
  vi.restoreAllMocks();
});

describe('POST /api/v1/batch', () => {
  it('逐筆回成功或錯誤,與 items 同序;錯誤只列欄位路徑', async () => {
    const r = await batch(signedRequest('http://x/api/v1/batch', {
      system: 'daily',
      items: [birth(1), { ...birth(1), month: 2, day: 31 }, { ...birth(1), gender: 'x' }],
    }));
    expect(r.status).toBe(200);
    const { results } = await r.json();
    expect(results.map((x: { ok: boolean }) => x.ok)).toEqual([true, false, false]);
    expect(results[0].context.systemId).toBe('daily');
    expect(results[1]).toEqual({ ok: false, error: 'invalid_input', detail: ['input.day: no such date'] });
    expect(results[2].detail).toEqual(['input.gender: must be one of 男, 女']);
  });

  it('沒簽章 401、改過的 body 401、未知 key 404、未知系統 404、超過 200 筆 400', async () => {
    expect((await batch(new Request('http://x/api/v1/batch', { method: 'POST', body: '{}' }))).status).toBe(401);
    const good = signedRequest('http://x/api/v1/batch', { system: 'daily', items: [birth(1)] });
    const tampered = new Request(good.url, {
      method: 'POST',
      headers: good.headers,
      body: (await good.text()).replace('"day":1', '"day":2'),
    });
    expect((await batch(tampered)).status).toBe(401);
    expect((await batch(signedRequest('http://x/api/v1/batch', { system: 'daily', items: [birth(1)] }, 'site-z'))).status).toBe(404);
    expect((await batch(signedRequest('http://x/api/v1/batch', { system: 'nope', items: [birth(1)] }))).status).toBe(404);
    const many = Array.from({ length: 201 }, () => birth(1));
    expect((await batch(signedRequest('http://x/api/v1/batch', { system: 'daily', items: many }))).status).toBe(400);
  });

  it('200 筆每日運勢 5 秒內;站台額度依 key_id 按筆數計,超額 429;日誌不含出生欄位', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      });
    }
    const items = Array.from({ length: 200 }, (_, i) => birth((i % 28) + 1));
    const t0 = Date.now();
    const r = await batch(signedRequest('http://x/api/v1/batch', { system: 'daily', items }));
    const ms = Date.now() - t0;
    expect(r.status).toBe(200);
    expect((await r.json()).results.every((x: { ok: boolean }) => x.ok)).toBe(true);
    expect(ms).toBeLessThan(5000);
    // 額度 400/分:再 200 筆剛好用完,再 1 筆超額
    expect((await batch(signedRequest('http://x/api/v1/batch', { system: 'daily', items }))).status).toBe(200);
    const over = await batch(signedRequest('http://x/api/v1/batch', { system: 'daily', items: [birth(1)] }));
    expect(over.status).toBe(429);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toMatch(/1990|Europe\/London|51\.51/);
  }, 30_000);
});

describe('亂帶簽章標頭', () => {
  it('驗簽前先依來源位址計數:同一來源第 601 次直接 429,不再讀 body、不再驗簽', async () => {
    const bogus = () =>
      new Request('http://x/api/v1/batch', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.50', 'x-awarewave-oracle-signature': 'x' },
        body: JSON.stringify({ key_id: 'site-a', system: 'daily', items: [] }),
      });
    for (let i = 0; i < 600; i++) expect((await batch(bogus())).status).toBe(401);
    expect((await batch(bogus())).status).toBe(429);
  });
});

describe('已簽章的單次呼叫', () => {
  it('走站台額度並正常計算', async () => {
    const r = await single(
      signedRequest('http://x/api/v1/systems/qian', { input: { lot: 7 } }),
      { params: Promise.resolve({ id: 'qian' }) },
    );
    expect(r.status).toBe(200);
    expect((await r.json()).data.no).toBe(7);
  });
  it('會員票原文拿來打 v1 → 401 wrong_audience;不扣站台額度、不消耗 nonce', async () => {
    process.env.ORACLE_SITES = JSON.stringify([{ key_id: 'site-a', public_key: PEM, requests_per_minute: 1 }]);
    const stolen = signedRequest('http://x/api/v1/systems/qian', { aud: 'ticket', member: 'member-aaaaaaaa-0001' });
    const raw = await stolen.clone().text();
    const sig = stolen.headers.get('x-awarewave-oracle-signature');
    const r = await single(stolen, { params: Promise.resolve({ id: 'qian' }) });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('wrong_audience');
    // 站台每分鐘只剩 1 次:沒被扣掉,正常請求仍過
    const ok = await single(signedRequest('http://x/api/v1/systems/qian', { input: { lot: 7 } }), { params: Promise.resolve({ id: 'qian' }) });
    expect(ok.status).toBe(200);
    // nonce 沒被消耗:同一張票在正確用途仍有效
    expect(verifyTicket(Buffer.from(raw).toString('base64url'), sig).ok).toBe(true);
  });
});

describe('GET /api/v1/places', () => {
  it('CORS 任意來源;回 BirthPlace;參數錯誤 400', async () => {
    const r = places(new Request('http://x/api/v1/places?q=London&locale=en&limit=3'));
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const { places: list, attribution } = await r.json();
    expect(list[0]).toMatchObject({ zone: 'Europe/London' });
    expect(attribution).toContain('GeoNames');
    expect(places(new Request('http://x/api/v1/places?limit=0')).status).toBe(400);
    expect(placesOptions().status).toBe(204);
  });
});
