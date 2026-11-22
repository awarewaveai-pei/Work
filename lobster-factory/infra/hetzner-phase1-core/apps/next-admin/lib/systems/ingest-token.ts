// The host importer's bearer token (SYSTEMS_INGEST_TOKEN) for the two internal /api/internal/systems routes (ingest,
// pending). Own token, never a shared one (one leaked token must not forge others); unset = nobody is authorized.
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export function verifySystemsToken(request: Request): boolean {
  const expected = process.env.SYSTEMS_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}
