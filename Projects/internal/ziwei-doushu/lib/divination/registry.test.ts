import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSystem,
  getSystem,
  listSystems,
  __resetRegistry,
} from './registry';
import { ziweiSystem } from './systems/ziwei';

describe('命理系統登錄表', () => {
  beforeEach(() => __resetRegistry());

  it('register → get / list', () => {
    registerSystem(ziweiSystem);
    expect(getSystem('ziwei')).toBe(ziweiSystem);
    expect(listSystems()).toHaveLength(1);
  });

  it('重複註冊同 id 應丟錯', () => {
    registerSystem(ziweiSystem);
    expect(() => registerSystem(ziweiSystem)).toThrow(/重複註冊/);
  });

  it('未註冊回 undefined', () => {
    expect(getSystem('bazi')).toBeUndefined();
  });
});

describe('紫微系統 adapter — compute → InterpretationContext', () => {
  it('回傳系統無關 context,綁具體命盤元素(寅時錨點)', async () => {
    const { data, context } = await ziweiSystem.compute(
      { year: 2000, month: 8, day: 16, hour: 4, minute: 0, gender: '女', calendar: 'solar' },
      'zh-TW',
    );
    expect(context.systemId).toBe('ziwei');
    expect(context.locale).toBe('zh-TW');
    expect(data.astrolabe.palaces).toHaveLength(12);

    const soul = context.facts.find((f) => f.label === 'soul');
    expect(soul?.value).toBe('破軍');
    expect(context.headline).toContain('破軍');
    // 12 宮主星事實皆存在 → AI 可寫綁具體星曜的解讀
    expect(context.facts.filter((f) => f.label.startsWith('palace:'))).toHaveLength(12);
  });
});
