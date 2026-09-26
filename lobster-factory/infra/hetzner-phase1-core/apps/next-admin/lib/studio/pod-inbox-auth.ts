// Bearer check for /api/internal/pod-orders/* (sweep = the 10-minute replay, stats = the AO smoke read).
// Own token, POD_INBOX_SWEEP_TOKEN: one token per caller class, see verifyIngestToken.ts M2.
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

export function verifyPodInboxToken(request: Request): boolean {
  const expected = process.env.POD_INBOX_SWEEP_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}
