import { describe, it, expect } from 'vitest';
import { ogCardUrl, ogParamsFromContext } from './og';
import type { InterpretationContext } from './divination/types';

describe('ogCardUrl', () => {
  it('組出 /api/og query(type/title/lines)', () => {
    const url = ogCardUrl({
      type: 'ziwei',
      title: '破軍 · 木三局',
      lines: ['命宮：破軍(陷)', '財帛：武曲化權'],
    });
    expect(url.startsWith('/api/og?')).toBe(true);
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('type')).toBe('ziwei');
    expect(q.get('title')).toBe('破軍 · 木三局');
    expect(q.get('lines')).toBe('命宮：破軍(陷)|財帛：武曲化權');
  });

  it('空 lines 不帶 lines 參數', () => {
    const url = ogCardUrl({ type: 'tarot', title: 'X', lines: [] });
    expect(url).not.toContain('lines=');
  });
});

describe('ogParamsFromContext', () => {
  it('headline→title、facts 前 5 條 value→lines', () => {
    const ctx: InterpretationContext = {
      systemId: 'bazi',
      locale: 'zh-TW',
      headline: '丙 · 偏財格 · 喜木火',
      facts: Array.from({ length: 8 }, (_, i) => ({
        label: `l${i}`,
        value: `v${i}`,
      })),
    };
    const p = ogParamsFromContext(ctx);
    expect(p.type).toBe('bazi');
    expect(p.title).toBe('丙 · 偏財格 · 喜木火');
    expect(p.lines).toEqual(['v0', 'v1', 'v2', 'v3', 'v4']); // 取前 5
  });
});
