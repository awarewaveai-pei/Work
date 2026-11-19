import { createHmac, timingSafeEqual } from "node:crypto";

// N12: 一鍵到草稿's whole-run maximum is priced once, by the quote route (api/internal/video/workbench/quick-render/quote),
// and travels through the browser to the script route's start check signed: a browser can drop it (the run then does not
// start) but not lower it. Key derived from VW_INTERNAL_TOKEN (the quote route's own bearer); unset = nothing signs or
// verifies, so no run starts. Bound to the organization, script model and scene count the max was priced with; ratios
// and the picture source never reach the script route (they go to the workbench run), so they are not bound here.
export interface RunQuote { organizationId: string; model: string; sceneCount: number; maxTwd: number; exp: number }
const TTL_MS = 24 * 60 * 60_000;
const key = (): Buffer | null => {
  const token = process.env.VW_INTERNAL_TOKEN;
  return token ? createHmac("sha256", token).update("script-forge run quote v1").digest() : null;
};
const mac = (k: Buffer, body: string) => createHmac("sha256", k).update(body).digest();

export function signRunQuote(q: Omit<RunQuote, "exp">, now = Date.now()): string | null {
  const k = key();
  if (!k) return null;
  const body = Buffer.from(JSON.stringify({ ...q, exp: now + TTL_MS })).toString("base64url");
  return body + "." + mac(k, body).toString("base64url");
}

export function verifyRunQuote(token: unknown, organizationId: string, model: string, sceneCount: number, now = Date.now()): RunQuote | null {
  const k = key();
  if (!k || typeof token !== "string" || token.length > 2000) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = mac(k, body), got = Buffer.from(sig, "base64url");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const q = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RunQuote;
    return q.organizationId === organizationId && q.model === model && q.sceneCount === sceneCount && Number.isFinite(q.maxTwd) && q.maxTwd >= 0 && q.exp > now ? q : null;
  } catch {
    return null;
  }
}
