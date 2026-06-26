import { describe, it, expect } from 'vitest';
import {
  evaluateEntitlement,
  createInMemoryStore,
  checkAndConsume,
  FREE_DAILY_AI_LIMIT,
} from './entitlements';

describe('evaluateEntitlement(純政策)', () => {
  it('訂閱者:所有 tier(含 premium)放行', () => {
    for (const tier of ['light', 'deep', 'premium'] as const) {
      expect(evaluateEntitlement({ plan: 'subscriber', aiUsedToday: 999, tier }).allowed).toBe(true);
    }
  });

  it('免費 + premium → 擋下(premium_requires_subscription)', () => {
    const r = evaluateEntitlement({ plan: 'free', aiUsedToday: 0, tier: 'premium' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('premium_requires_subscription');
  });

  it('免費 + deep 未達上限 → 放行 + 回剩餘', () => {
    const r = evaluateEntitlement({ plan: 'free', aiUsedToday: 0, tier: 'deep' });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(FREE_DAILY_AI_LIMIT - 1);
  });

  it('免費 + 達每日上限 → 擋下(free_daily_limit_reached)', () => {
    const r = evaluateEntitlement({ plan: 'free', aiUsedToday: FREE_DAILY_AI_LIMIT, tier: 'light' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('free_daily_limit_reached');
  });
});

describe('createInMemoryStore + checkAndConsume', () => {
  it('免費用戶每日上限後擋下;premium 不消費直接擋', async () => {
    const store = createInMemoryStore(() => '2026-06-26');
    // 連續 deep 消費到上限
    for (let i = 0; i < FREE_DAILY_AI_LIMIT; i++) {
      const r = await checkAndConsume(store, 'u1', 'deep');
      expect(r.allowed).toBe(true);
    }
    // 超出 → 擋
    const over = await checkAndConsume(store, 'u1', 'deep');
    expect(over.allowed).toBe(false);
    expect(over.reason).toBe('free_daily_limit_reached');

    // premium 對另一新用戶:直接擋,且不應消費其額度
    const r2 = await checkAndConsume(store, 'u2', 'premium');
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('premium_requires_subscription');
    expect((await store.getStatus('u2')).aiUsedToday).toBe(0);
  });

  it('跨日重置', async () => {
    let day = '2026-06-26';
    const store = createInMemoryStore(() => day);
    await checkAndConsume(store, 'u1', 'deep');
    expect((await store.getStatus('u1')).aiUsedToday).toBe(1);
    day = '2026-06-27';
    expect((await store.getStatus('u1')).aiUsedToday).toBe(0);
  });
});
