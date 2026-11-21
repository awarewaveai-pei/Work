import { describe, it, expect } from 'vitest';
import { parseInput, type InputSpec } from './input';

const doc = { 'zh-TW': 'x', en: 'x' };
const spec: InputSpec<Record<string, unknown>> = {
  fields: {
    n: { type: 'integer', min: 1, max: 9, doc },
    kind: { type: 'enum', values: ['a', 'b'], doc },
    note: { type: 'string', maxLength: 3, required: false, doc },
    when: { type: 'date', required: false, doc },
    zone: { type: 'timeZone', required: false, doc },
    lines: { type: 'array', minItems: 2, maxItems: 2, required: false, items: { type: 'integer', min: 6, max: 9, doc }, doc },
  },
  build: (v) => v,
  example: { n: 1, kind: 'a' },
};
const errs = (body: unknown) => {
  const r = parseInput(spec, body);
  return r.ok ? [] : r.errors;
};

describe('parseInput', () => {
  it('合法輸入原樣交給 build', () => {
    expect(parseInput(spec, { n: 3, kind: 'b', note: 'ok', when: { year: 2024, month: 2, day: 29 } })).toEqual({
      ok: true,
      value: { n: 3, kind: 'b', note: 'ok', when: { year: 2024, month: 2, day: 29 } },
    });
  });
  it('必填欄位缺漏', () => expect(errs({ kind: 'a' })).toEqual(['n: required']));
  it('範圍與整數', () => {
    expect(errs({ n: 10, kind: 'a' })).toEqual(['n: must be 1..9']);
    expect(errs({ n: 1.5, kind: 'a' })).toEqual(['n: must be an integer']);
  });
  it('列舉', () => expect(errs({ n: 1, kind: 'c' })).toEqual(['kind: must be one of a, b']));
  it('多餘欄位拒絕', () => expect(errs({ n: 1, kind: 'a', nn: 2 })).toEqual(['nn: unknown field']));
  it('不存在的日期、時區、陣列長度', () => {
    expect(errs({ n: 1, kind: 'a', when: { year: 2023, month: 2, day: 29 } })).toEqual(['when: no such date']);
    expect(errs({ n: 1, kind: 'a', zone: 'Mars/Olympus' })).toEqual(['zone: unknown IANA time zone']);
    expect(errs({ n: 1, kind: 'a', lines: [6] })).toEqual(['lines: exactly 2 items']);
  });
  it('body 不是物件', () => expect(errs([1])).toEqual(['input: must be an object']));
});
