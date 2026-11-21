import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { __resetSiteNonces } from './verify';
import { verifyTicket } from './ticket';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const env = { ORACLE_SITES: JSON.stringify([{ key_id: 'site-a', public_key: PEM }]) };
const NOW = 1_800_000_000;
const MEMBER = 'member-abcdef-0001';
let n = 0;
const ticket = (over: Record<string, unknown> = {}) => {
  const raw = JSON.stringify({ key_id: 'site-a', ts: NOW, nonce: `nonce-abcdefghij-${++n}`, member: MEMBER, ...over });
  return { t: Buffer.from(raw).toString('base64url'), sig: sign(null, Buffer.from(raw), privateKey).toString('base64') };
};

beforeEach(() => __resetSiteNonces());

describe('會員票 verifyTicket', () => {
  it('正確票 → 通過,回傳站台與假名(預設每日 20 次)', () => {
    const { t, sig } = ticket();
    const r = verifyTicket(t, sig, NOW, env);
    expect(r).toMatchObject({ ok: true, member: MEMBER });
    expect(r.ok && r.site.aiPerDay).toBe(20);
  });

  it('錯簽 → 401', () => {
    const { t } = ticket();
    const other = ticket().sig;
    expect(verifyTicket(t, other, NOW, env)).toMatchObject({ ok: false, status: 401, error: 'invalid_signature' });
  });

  it('過期 → 401', () => {
    const { t, sig } = ticket({ ts: NOW - 61 });
    expect(verifyTicket(t, sig, NOW, env)).toMatchObject({ ok: false, status: 401, error: 'stale_request' });
  });

  it('同一張票用第二次 → 401', () => {
    const { t, sig } = ticket();
    expect(verifyTicket(t, sig, NOW, env).ok).toBe(true);
    expect(verifyTicket(t, sig, NOW, env)).toMatchObject({ ok: false, status: 401, error: 'replayed_request' });
  });

  it('未知 key_id → 404', () => {
    const { t, sig } = ticket({ key_id: 'site-z' });
    expect(verifyTicket(t, sig, NOW, env)).toMatchObject({ ok: false, status: 404, error: 'unknown_site' });
  });

  it('member 格式錯(太短、非法字元、缺)→ 400', () => {
    for (const member of ['short', 'x'.repeat(65), 'has space in the name!!', 12345678901234567, undefined]) {
      const { t, sig } = ticket({ member });
      expect(verifyTicket(t, sig, NOW, env)).toMatchObject({ ok: false, status: 400, error: 'invalid_ticket' });
    }
  });

  it('多帶欄位(例如站台對 /api/v1 的請求原文)不算票 → 400', () => {
    const { t, sig } = ticket({ system: 'ziwei' });
    expect(verifyTicket(t, sig, NOW, env)).toMatchObject({ ok: false, status: 400, error: 'invalid_ticket' });
  });

  it('不是 base64url → 400', () => {
    expect(verifyTicket('not base64!', 'AAAA', NOW, env)).toMatchObject({ ok: false, status: 400, error: 'invalid_ticket' });
  });
});
