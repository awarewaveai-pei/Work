import { verify } from 'node:crypto';
import { getSites, SITE_KEY_ID, type Site } from './registry';

/**
 * 站台對引擎的伺服器對伺服器請求驗證。構造沿用既有的 WordPress 換手(next-admin
 *   lib/auth/sources/awarewave-wp.ts、aware-wave-store Signature.php):
 * - body 是 JSON,含 key_id、ts(unix 秒)、nonce(16–100 個 [A-Za-z0-9_-]),其餘是請求內容;
 * - 標頭 X-AwareWave-Oracle-Signature = base64(Ed25519(原始 body 位元組)),以站台私鑰簽;
 * - ts 在 ±60 秒內、同一站的 nonce 只能用一次;nonce 只在簽章與時鐘都通過後才消耗(攻擊者燒不掉別人的 nonce)。
 * 標頭名稱依用途分開(付款、換手、算命各一個),漏出的一把鑰匙不能拿去做另一件事。
 * nonce 記在本行程記憶體;重啟最多忘掉最後 60 秒,而那些請求的 ts 也已過期。
 */
export const SITE_SIGNATURE_HEADER = 'x-awarewave-oracle-signature';
const WINDOW_SECONDS = 60;
const NONCE = /^[A-Za-z0-9_-]{16,100}$/;
const AUTH_FIELDS = ['key_id', 'ts', 'nonce'] as const;

const seen = new Map<string, number>(); // <key_id>:<nonce> -> 到期(unix 秒)
let lastSweep = 0;
function takeNonce(key: string, now: number): boolean {
  // 每秒最多清一次過期的 nonce:表再大也不會每個請求都整表掃描
  if (now !== lastSweep) {
    lastSweep = now;
    for (const [n, exp] of seen) if (exp <= now) seen.delete(n);
  }
  const exp = seen.get(key);
  if (exp !== undefined && exp > now) return false;
  seen.set(key, now + 2 * WINDOW_SECONDS);
  return true;
}
/** 僅供測試。 */
export const __resetSiteNonces = (): void => {
  seen.clear();
  lastSweep = 0;
};

export type SiteAuth =
  | { ok: true; site: Site; payload: Record<string, unknown> }
  | { ok: false; status: 400 | 401 | 404; error: string };

export function verifySiteRequest(
  rawBody: string,
  signature: string | null,
  now: number = Math.floor(Date.now() / 1000),
  env: Record<string, string | undefined> = process.env,
): SiteAuth {
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: 'invalid_json' };
  }
  const { key_id: keyId, ts, nonce } = body;
  // key_id 在驗簽前讀取,只用來挑選驗簽的公鑰
  if (typeof keyId !== 'string' || !SITE_KEY_ID.test(keyId)) return { ok: false, status: 400, error: 'invalid_key_id' };
  const site = getSites(env).get(keyId);
  if (!site) return { ok: false, status: 404, error: 'unknown_site' };
  let valid = false;
  try {
    valid = !!signature && verify(null, Buffer.from(rawBody, 'utf8'), site.publicKey, Buffer.from(signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, error: 'invalid_signature' };
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) return { ok: false, status: 400, error: 'invalid_nonce' };
  if (!Number.isSafeInteger(ts) || Math.abs(now - (ts as number)) > WINDOW_SECONDS) return { ok: false, status: 401, error: 'stale_request' };
  if (!takeNonce(`${keyId}:${nonce}`, now)) return { ok: false, status: 401, error: 'replayed_request' };
  const payload = { ...body };
  for (const f of AUTH_FIELDS) delete payload[f];
  return { ok: true, site, payload };
}
