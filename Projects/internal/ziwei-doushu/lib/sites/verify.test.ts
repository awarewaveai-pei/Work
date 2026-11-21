import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { parseSites } from './registry';
import { __resetSiteNonces, verifySiteRequest } from './verify';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const env = { ORACLE_SITES: JSON.stringify([{ key_id: 'site-a', public_key: PEM, embed_origins: ['https://a.example'] }]) };
const NOW = 1_800_000_000;
let n = 0;
const signed = (body: Record<string, unknown>) => {
  const raw = JSON.stringify(body);
  return { raw, sig: sign(null, Buffer.from(raw), privateKey).toString('base64') };
};
const req = (over: Record<string, unknown> = {}) =>
  signed({ key_id: 'site-a', ts: NOW, nonce: `nonce-abcdefghij-${++n}`, hello: 1, ...over });

beforeEach(() => __resetSiteNonces());

describe('站台登記表 ORACLE_SITES', () => {
  it('合法一筆可用;錯的那筆略過並說明原因,不帶金鑰內容', () => {
    const { sites, errors } = parseSites(JSON.stringify([
      { key_id: 'site-a', public_key: PEM },
      { key_id: 'Bad Id', public_key: PEM },
      { key_id: 'site-b', public_key: 'not a key' },
      { key_id: 'site-c', public_key: PEM, embed_origins: ['https://c.example/path'] },
    ]));
    expect([...sites.keys()]).toEqual(['site-a']);
    expect(sites.get('site-a')!.requestsPerMinute).toBe(600);
    expect(errors).toHaveLength(3);
    expect(errors.join(' ')).not.toContain('BEGIN PUBLIC KEY');
  });

  it('沒設定 = 沒有站台', () => expect(parseSites(undefined).sites.size).toBe(0));
});

describe('站台請求驗證', () => {
  it('正確簽章 → 通過,回傳去掉 key_id/ts/nonce 的內容', () => {
    const { raw, sig } = req();
    const r = verifySiteRequest(raw, sig, NOW, env);
    expect(r).toMatchObject({ ok: true, payload: { hello: 1 } });
    expect(r.ok && Object.keys(r.payload)).toEqual(['hello']);
  });

  it('錯簽、缺簽、被改過的 body → 401', () => {
    const { raw, sig } = req();
    expect(verifySiteRequest(raw, 'AAAA', NOW, env)).toMatchObject({ status: 401, error: 'invalid_signature' });
    expect(verifySiteRequest(raw, null, NOW, env)).toMatchObject({ status: 401 });
    expect(verifySiteRequest(raw.replace('"hello":1', '"hello":2'), sig, NOW, env)).toMatchObject({ status: 401 });
  });

  it('過期(超過 ±60 秒)→ 401', () => {
    const { raw, sig } = req({ ts: NOW - 61 });
    expect(verifySiteRequest(raw, sig, NOW, env)).toMatchObject({ status: 401, error: 'stale_request' });
  });

  it('重送 → 401;nonce 只在簽章與時鐘都通過後才消耗', () => {
    const { raw, sig } = req();
    expect(verifySiteRequest(raw, 'AAAA', NOW, env)).toMatchObject({ error: 'invalid_signature' });
    expect(verifySiteRequest(raw, sig, NOW, env).ok).toBe(true);
    expect(verifySiteRequest(raw, sig, NOW, env)).toMatchObject({ status: 401, error: 'replayed_request' });
  });

  it('未知 key → 404', () => {
    const { raw, sig } = req({ key_id: 'site-z' });
    expect(verifySiteRequest(raw, sig, NOW, env)).toMatchObject({ status: 404, error: 'unknown_site' });
  });
});
