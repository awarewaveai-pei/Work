import { describe, it, expect, vi, afterEach } from 'vitest';
import { readParentTicket, requestInterpretation, type FrameWindow } from './memberRequest';

const ORIGIN = 'https://oracle.example';
const TICKET = { ticket: 'dGlja2V0', signature: 'c2ln' };

/** 框內頁:parent 是另一個同源視窗,可選擇定義 awOracleTicket。 */
function framed(awOracleTicket?: unknown): FrameWindow {
  const parent = { location: { origin: ORIGIN }, awOracleTicket };
  return { parent, location: { origin: ORIGIN } };
}
/** 獨立頁:parent 就是自己(瀏覽器頂層視窗的行為)。 */
function standalone(awOracleTicket: unknown): FrameWindow {
  const w = { location: { origin: ORIGIN }, awOracleTicket } as FrameWindow & { awOracleTicket: unknown };
  w.parent = w;
  return w;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('readParentTicket', () => {
  it('同源父頁有 awOracleTicket → 回票', async () => {
    expect(await readParentTicket(framed(async () => TICKET))).toEqual(TICKET);
  });

  it('父頁回 null → null', async () => {
    expect(await readParentTicket(framed(async () => null))).toBeNull();
  });

  it('父頁丟錯(同步或非同步)→ null', async () => {
    expect(
      await readParentTicket(
        framed(() => {
          throw new Error('x');
        }),
      ),
    ).toBeNull();
    expect(await readParentTicket(framed(() => Promise.reject(new Error('x'))))).toBeNull();
  });

  it('逾時 → null', async () => {
    vi.useFakeTimers();
    const p = readParentTicket(framed(() => new Promise(() => {})), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBeNull();
  });

  it('不在框內 → 不呼叫取票函式', async () => {
    const fn = vi.fn(async () => TICKET);
    expect(await readParentTicket(standalone(fn))).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('跨源父頁(讀屬性丟 SecurityError,或 origin 不同)→ 不呼叫、null', async () => {
    const fn = vi.fn(async () => TICKET);
    const blocked = {
      parent: new Proxy({}, { get: () => { throw new DOMException('blocked', 'SecurityError'); } }),
      location: { origin: ORIGIN },
    };
    expect(await readParentTicket(blocked)).toBeNull();
    const other = { parent: { location: { origin: 'https://evil.example' }, awOracleTicket: fn }, location: { origin: ORIGIN } };
    expect(await readParentTicket(other)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('形狀不對的回傳 → null', async () => {
    expect(await readParentTicket(framed(async () => ({ ticket: 'a' })))).toBeNull();
  });
});

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status, headers }));
}
const PAYLOAD = { context: { systemId: 'daily' }, tier: 'light' };

describe('requestInterpretation', () => {
  it('有票 → 兩個標頭都帶上,票不在網址', async () => {
    const f = reply(200, { text: 'ok' });
    expect(await requestInterpretation(f, PAYLOAD, TICKET)).toEqual({ kind: 'ok', text: 'ok' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/interpret');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-awarewave-oracle-ticket': TICKET.ticket,
      'x-awarewave-oracle-signature': TICKET.signature,
    });
  });

  it('沒票 → 與改前的匿名請求逐位元組相同', async () => {
    const f = reply(200, { text: 'ok' });
    await requestInterpretation(f, PAYLOAD, null);
    expect(f.mock.calls[0][1]).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PAYLOAD),
    });
  });

  it('429 daily_limit_reached → 顯示用完與可再試的秒數', async () => {
    const f = reply(429, { error: 'daily_limit_reached' }, { 'Retry-After': '3600' });
    expect(await requestInterpretation(f, PAYLOAD, TICKET)).toEqual({ kind: 'daily_limit', retryAfterSec: 3600 });
  });

  it('來源限流的 429(rate_limited)→ 一般錯誤', async () => {
    const f = reply(429, { error: 'rate_limited' }, { 'Retry-After': '30' });
    expect(await requestInterpretation(f, PAYLOAD, null)).toEqual({ kind: 'error' });
  });

  it('帶票被拒 401 → 錯誤,不改用匿名重送', async () => {
    const f = reply(401, { error: 'invalid_signature' });
    expect(await requestInterpretation(f, PAYLOAD, TICKET)).toEqual({ kind: 'error' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
