export function verifyIngestToken(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.OPS_INBOX_INGEST_TOKEN;
  if (!expected) return false;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqual(m[1], expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
