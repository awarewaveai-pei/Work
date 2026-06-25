import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('/api/health', () => {
  it('回傳 { ok: true, service: "ziwei" }', async () => {
    const res = GET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('ziwei');
  });
});
