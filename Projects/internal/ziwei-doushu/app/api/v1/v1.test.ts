import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listRoute, OPTIONS } from './systems/route';
import { GET as specRoute, POST } from './systems/[id]/route';
import { SYSTEM_IDS } from '@/lib/divination/types';
import { API_RULE, __resetRateLimit } from '@/lib/http/rateLimit';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown, ip = '203.0.113.9') =>
  POST(
    new Request(`http://localhost/api/v1/systems/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );

beforeEach(() => __resetRateLimit());

describe('GET /api/v1/systems', () => {
  it('列出全部 SYSTEM_IDS,每個都有輸入規格與範例;CORS 開放任意來源', async () => {
    const r = await listRoute(new Request('http://localhost/api/v1/systems'));
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    const body = await r.json();
    expect(body.apiVersion).toBe('1');
    expect(body.systems.map((s: { id: string }) => s.id).sort()).toEqual([...SYSTEM_IDS].sort());
    for (const s of body.systems) expect(Object.keys(s.input.example).length).toBeGreaterThan(0);
  });

  it('OPTIONS 預檢 204', () => {
    const r = OPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('POST /api/v1/systems/{id}', () => {
  it.each([...SYSTEM_IDS])('%s:規格裡的範例輸入 → 200,data 是純 JSON', async (id) => {
    const spec = await (await specRoute(new Request(`http://localhost/api/v1/systems/${id}`), ctx(id))).json();
    for (const locale of ['zh-TW', 'en']) {
      const r = await post(id, { input: spec.input.example, locale });
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body).toMatchObject({ apiVersion: '1', system: id });
      expect(body.context.systemId).toBe(id);
      expect(JSON.parse(JSON.stringify(body.data))).toEqual(body.data);
    }
  });

  it('未知系統 404', async () => {
    const r = await post('nope', { input: {} });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'unknown_system', detail: 'no system "nope"' });
  });

  it('輸入錯誤 400 並列出每一項', async () => {
    const r = await post('qian', { input: { lot: 101, extra: 1 } });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'invalid_input', detail: ['input.extra: unknown field', 'input.lot: must be 1..100'] });
  });

  it('用到「今天」的系統,日期必填(伺服器不代填)', async () => {
    const r = await post('iching', { input: { question: 'q' } });
    expect((await r.json()).detail).toContain('input.date: required');
  });

  it('占星年份限星曆範圍:1900、2099 算得出,1899 回 400 不是 500', async () => {
    const birth = (year: number) => ({
      year, month: 6, day: 1, hour: 12, minute: 0,
      place: { lat: 48.86, lon: 2.35, zone: 'Europe/Paris' }, date: { year: 2026, month: 11, day: 21 },
    });
    expect((await post('astrology', { input: birth(1900) })).status).toBe(200);
    expect((await post('astrology', { input: birth(2099) })).status).toBe(200);
    const r = await post('astrology', { input: birth(1899) });
    expect(r.status).toBe(400);
    expect((await r.json()).detail).toEqual(['input.year: must be 1900..2099']);
  });

  it('合婚 zodiac 模式拒收農曆日期;缺 input 回 input: required', async () => {
    const r = await post('hehun', {
      input: { mode: 'zodiac', a: { year: 1990, month: 1, day: 1, calendar: 'lunar' }, b: { year: 1992, month: 5, day: 5 } },
    });
    expect((await r.json()).detail).toEqual(['input.a.calendar: zodiac mode takes solar (Gregorian) dates']);
    expect((await (await post('qian', {})).json()).detail).toEqual(['input: required']);
  });

  it('同一來源第 N+1 次 429 + Retry-After', async () => {
    for (let i = 0; i < API_RULE.limit; i++) expect((await post('qian', { input: { lot: 1 } })).status).toBe(200);
    const r = await post('qian', { input: { lot: 1 } });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect((await post('qian', { input: { lot: 1 } }, '198.51.100.1')).status).toBe(200);
  });
});
