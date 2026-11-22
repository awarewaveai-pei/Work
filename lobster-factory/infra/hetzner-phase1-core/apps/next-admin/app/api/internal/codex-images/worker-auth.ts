import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import type { SubLane } from "@/lib/tarot/codex-bridge";

/** Which lane the calling worker serves, decided by the secret it holds (never by what it says): Bearer
 *  CODEX_WORKER_SECRET = "owner" (the operator's laptop), SUB_WORKER_HOST_SECRET = "schedule" (the host worker).
 *  null = neither. An unset secret matches nobody (fail closed); both set to the same value = "owner" only. */
export function workerLane(req: Request, env: Record<string, string | undefined> = process.env): SubLane | null {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const owner = env.CODEX_WORKER_SECRET?.trim();
  const host = env.SUB_WORKER_HOST_SECRET?.trim();
  // Both compared every time, so the answer's timing does not tell which secret is set.
  const isOwner = !!owner && timingSafeEqual(token, owner);
  const isHost = !!host && timingSafeEqual(token, host);
  if (isOwner) return "owner";
  return isHost ? "schedule" : null;
}
