import { timingSafeEqual } from "../security/timingSafeEqual";

export function verifyIngestToken(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.OPS_INBOX_INGEST_TOKEN;
  if (!expected) return false;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqual(m[1], expected);
}

// Re-export so callers that import timingSafeEqual from this module continue to work.
// The canonical implementation lives in lib/security/timingSafeEqual.ts (m2 audit fix).
export { timingSafeEqual };
