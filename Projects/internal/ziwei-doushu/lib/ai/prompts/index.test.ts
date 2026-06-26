import { describe, it, expect } from 'vitest';
import { buildPrompt } from './index';
import type { InterpretRequest } from '../types';

const baseReq: InterpretRequest = {
  context: {
    systemId: 'ziwei',
    locale: 'zh-TW',
    headline: '破軍 · 木三局',
    facts: [
      { label: 'soul', value: '破軍' },
      { label: 'fiveElements', value: '木三局' },
      { label: 'palace:命宮', value: '破軍/文昌' },
    ],
  },
  tier: 'deep',
  locale: 'zh-TW',
};

describe('Centaur prompt builder', () => {
  it('system prompt 注入 NO CALCULATIONS 護欄(零幻覺核心)', () => {
    const { system } = buildPrompt(baseReq);
    expect(system).toContain('NO CALCULATIONS');
  });

  it('user prompt 綁定每一條具體事實 + 標題(防巴納姆)', () => {
    const { user } = buildPrompt(baseReq);
    for (const f of baseReq.context.facts) {
      expect(user).toContain(f.value);
      expect(user).toContain(f.label);
    }
    expect(user).toContain(baseReq.context.headline);
  });

  it('zh-TW / en 各自獨立模板(不直譯)', () => {
    const zh = buildPrompt(baseReq);
    expect(zh.system).toContain('繁體中文');

    const enReq: InterpretRequest = {
      ...baseReq,
      locale: 'en',
      context: { ...baseReq.context, locale: 'en' },
    };
    const en = buildPrompt(enReq);
    expect(en.system).toContain('NO CALCULATIONS');
    expect(en.system.toLowerCase()).toContain('english');
    expect(en.system).not.toContain('繁體中文');
  });

  it('tier 改變篇幅指引(light ≠ premium)', () => {
    const light = buildPrompt({ ...baseReq, tier: 'light' });
    const premium = buildPrompt({ ...baseReq, tier: 'premium' });
    expect(light.system).not.toEqual(premium.system);
  });

  it('系統框架隨 systemId 切換(紫微 ≠ 塔羅)', () => {
    const ziwei = buildPrompt(baseReq);
    const tarot = buildPrompt({
      ...baseReq,
      context: { ...baseReq.context, systemId: 'tarot' },
    });
    expect(ziwei.system).not.toEqual(tarot.system);
    expect(ziwei.system).toContain('紫微');
    expect(tarot.system).toContain('塔羅');
  });
});
