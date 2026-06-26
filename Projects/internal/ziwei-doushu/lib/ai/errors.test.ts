import { describe, it, expect } from 'vitest';
import { AiCallError, redactSecrets } from './errors';

describe('AiCallError 密鑰遮蔽(secrets-adjacent 防外洩)', () => {
  const leaky =
    '401 Incorrect API key provided: sk-proj-ABCDEF1234567890XYZ (Authorization: Bearer sk-proj-ABCDEF1234567890XYZ)';

  it('AiCallError.message 與 .detail 都不含原始 key', () => {
    const err = new AiCallError('openai', leaky);
    expect(err.message).not.toContain('sk-proj-ABCDEF1234567890XYZ');
    expect(err.detail).not.toContain('sk-proj-ABCDEF1234567890XYZ');
    expect(err.message).toContain('REDACTED');
    expect(err.providerId).toBe('openai');
  });

  it('redactSecrets 同時遮蔽 sk- 與 Bearer 片段', () => {
    const out = redactSecrets(leaky);
    expect(out).not.toMatch(/sk-proj-ABCDEF/);
    expect(out).not.toMatch(/Bearer\s+sk-/);
  });

  it('一般錯誤訊息不受影響', () => {
    expect(redactSecrets('rate limit exceeded')).toBe('rate limit exceeded');
  });
});
