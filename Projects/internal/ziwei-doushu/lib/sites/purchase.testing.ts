import { randomBytes, sign, type KeyObject } from 'node:crypto';

/**
 * 只給測試與本機實跑用的購買票簽發輔助(正式簽發在 Z3 的 WordPress 外掛,用站台私鑰)。
 * 產出與外掛相同格式:原文 JSON → base64url 當票,Ed25519 簽原文 → base64 當簽章。
 */
export function signPurchaseTicket(
  privateKey: KeyObject,
  fields: { keyId: string; member: string; report: string; chart: string; aud?: string; ts?: number },
): { ticket: string; signature: string } {
  const raw = JSON.stringify({
    key_id: fields.keyId,
    ts: fields.ts ?? Math.floor(Date.now() / 1000),
    nonce: `test-${randomBytes(12).toString('hex')}`,
    aud: fields.aud ?? 'report',
    member: fields.member,
    report: fields.report,
    chart: fields.chart,
  });
  return {
    ticket: Buffer.from(raw).toString('base64url'),
    signature: sign(null, Buffer.from(raw), privateKey).toString('base64'),
  };
}
