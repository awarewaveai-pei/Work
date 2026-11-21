import { describe, it, expect, beforeEach } from 'vitest';
import { __resetRateLimit, hit } from './rateLimit';

describe('固定視窗限流', () => {
  beforeEach(() => __resetRateLimit());
  const rule = { limit: 3, windowMs: 60_000 };

  it('第 N+1 次擋下並給 Retry-After 秒數;下個視窗重新計數;來源與範圍各自計數', () => {
    for (let i = 0; i < 3; i++) expect(hit('v1', '1.2.3.4', rule, 1_000)).toEqual({ ok: true });
    expect(hit('v1', '1.2.3.4', rule, 31_000)).toEqual({ ok: false, retryAfterSec: 30 });
    expect(hit('v1', '5.6.7.8', rule, 31_000)).toEqual({ ok: true });
    expect(hit('interpret', '1.2.3.4', rule, 31_000)).toEqual({ ok: true });
    expect(hit('v1', '1.2.3.4', rule, 61_000)).toEqual({ ok: true });
  });
});

describe('來源鍵', () => {
  it('IPv6 以 /64 計數,IPv4 與 IPv4-mapped 用整個位址', async () => {
    const { sourceKey } = await import('./rateLimit');
    expect(sourceKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(sourceKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(sourceKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(sourceKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(sourceKey('203.0.113.9')).toBe('203.0.113.9');
  });
});
