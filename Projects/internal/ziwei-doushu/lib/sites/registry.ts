import { createPublicKey, type KeyObject } from 'node:crypto';

/**
 * 站台登記表:裝了算命外掛的網站(客戶站或操作者自有站)。來源只有環境變數 ORACLE_SITES(JSON 陣列),
 * 不寫死任何網域,也不存任何個資:站台只以 key_id 識別。格式見 deploy/DEPLOY.md。
 *
 *   [{ "key_id": "oracle-main", "public_key": "-----BEGIN PUBLIC KEY-----\n…", "embed_origins": ["https://oracle.example"],
 *      "requests_per_minute": 600, "ai_per_day": 20 }]
 *
 * public_key = 該站 Ed25519 公鑰(SPKI PEM,外掛 Signature::publicKeyPem 的輸出);私鑰只在該站。
 * 一筆設定錯誤只略過那一筆並記錄 key_id 與原因(不記金鑰內容),不讓整張表失效。
 */

/** 同 next-admin lib/payments/sites.ts SITE_KEY_ID(seller_sites.key_id 的格式)。 */
export const SITE_KEY_ID = /^[a-z0-9][a-z0-9-]{1,23}$/;
export const DEFAULT_REQUESTS_PER_MINUTE = 600;
const MAX_REQUESTS_PER_MINUTE = 100_000;
/** 每個會員假名每天可用的 AI 解讀次數(會員票,lib/sites/ticket.ts)。 */
export const DEFAULT_AI_PER_DAY = 20;
const MAX_AI_PER_DAY = 100_000;

export interface Site {
  keyId: string;
  publicKey: KeyObject;
  /** 允許嵌入的網站來源(W2 的 frame-ancestors 與訊息 origin 用) */
  embedOrigins: readonly string[];
  /** 已簽章請求的每分鐘額度(批次按筆數計) */
  requestsPerMinute: number;
  /** 每個會員假名每 24 小時可用的 AI 解讀次數 */
  aiPerDay: number;
}

function publicKeyOf(pem: unknown): KeyObject | null {
  if (typeof pem !== 'string' || !pem.trim().startsWith('-----BEGIN PUBLIC KEY-----') || /PRIVATE KEY/.test(pem)) return null;
  try {
    const key = createPublicKey({ key: pem, format: 'pem' });
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch {
    return null;
  }
}

function originOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === v ? u.origin : null;
  } catch {
    return null;
  }
}

/** 解析 ORACLE_SITES;回傳可用的站台與每筆被略過的原因。 */
export function parseSites(raw: string | undefined): { sites: Map<string, Site>; errors: string[] } {
  const sites = new Map<string, Site>();
  const errors: string[] = [];
  if (!raw || !raw.trim()) return { sites, errors };
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return { sites, errors: ['ORACLE_SITES: not JSON'] };
  }
  if (!Array.isArray(list)) return { sites, errors: ['ORACLE_SITES: must be a JSON array'] };
  list.forEach((entry, i) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const id = typeof e.key_id === 'string' ? e.key_id : `#${i}`;
    const fail = (why: string) => errors.push(`ORACLE_SITES ${id}: ${why}`);
    if (typeof e.key_id !== 'string' || !SITE_KEY_ID.test(e.key_id)) return fail('key_id must match [a-z0-9][a-z0-9-]{1,23}');
    if (sites.has(e.key_id)) return fail('duplicate key_id');
    const publicKey = publicKeyOf(e.public_key);
    if (!publicKey) return fail('public_key must be an Ed25519 SPKI PEM public key');
    const originsRaw = e.embed_origins ?? [];
    if (!Array.isArray(originsRaw)) return fail('embed_origins must be an array');
    const embedOrigins = originsRaw.map(originOf);
    if (embedOrigins.some((o) => o === null)) return fail('embed_origins: each must be an origin such as https://example.com');
    const rpm = e.requests_per_minute ?? DEFAULT_REQUESTS_PER_MINUTE;
    if (!Number.isInteger(rpm) || (rpm as number) < 1 || (rpm as number) > MAX_REQUESTS_PER_MINUTE) {
      return fail(`requests_per_minute must be an integer 1..${MAX_REQUESTS_PER_MINUTE}`);
    }
    const aiPerDay = e.ai_per_day ?? DEFAULT_AI_PER_DAY;
    if (!Number.isInteger(aiPerDay) || (aiPerDay as number) < 1 || (aiPerDay as number) > MAX_AI_PER_DAY) {
      return fail(`ai_per_day must be an integer 1..${MAX_AI_PER_DAY}`);
    }
    sites.set(e.key_id, {
      keyId: e.key_id,
      publicKey,
      embedOrigins: embedOrigins as string[],
      requestsPerMinute: rpm as number,
      aiPerDay: aiPerDay as number,
    });
  });
  return { sites, errors };
}

let cache: { raw: string | undefined; sites: Map<string, Site> } | null = null;

/** 目前的站台表;環境變數內容變了才重新解析(測試可改 process.env)。 */
export function getSites(env: Record<string, string | undefined> = process.env): Map<string, Site> {
  const raw = env.ORACLE_SITES;
  if (cache && cache.raw === raw) return cache.sites;
  const { sites, errors } = parseSites(raw);
  for (const e of errors) console.error(e);
  cache = { raw, sites };
  return sites;
}
