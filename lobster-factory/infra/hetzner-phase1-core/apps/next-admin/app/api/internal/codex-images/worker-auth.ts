import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

/** Bearer CODEX_WORKER_SECRET, the laptop worker's own token. Unset = nobody is authorized (fail closed). */
export function verifyCodexWorker(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.CODEX_WORKER_SECRET?.trim();
  if (!expected) return false;
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1].trim(), expected);
}
