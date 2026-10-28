import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * D7 (VIDEO_TOOL_REDESIGN): rights are recorded when the asset is acquired, never filled in afterwards.
 * The draft → render flow passes assets through the browser, so each origin travels with an HMAC over (url, origin):
 * a client can drop one, not forge one. Pexels is derived from the host and needs no signature. Without a secret
 * nothing verifies, which makes the rights QA fail rather than pass.
 */
export type AssetOrigin =
  | { kind: "ai_generated"; model: string; provider: string }
  | { kind: "pexels"; sourceRef: string }
  | { kind: "upload"; rightsConfirmed: boolean };

export interface SignedOrigin { origin: AssetOrigin; sig: string }

/** Stored in media_assets.metadata.rightsSources of the finished video; `unknown` = nothing recorded for that url. */
export type RightsSource = (AssetOrigin | { kind: "unknown" }) & { url: string };

const PEXELS_HOSTS = new Set(["images.pexels.com", "videos.pexels.com", "player.vimeo.com"]);

const secret = (): string => process.env.OPS_PROXY_SHARED_SECRET ?? "";
const mac = (url: string, origin: AssetOrigin): string =>
  createHmac("sha256", secret()).update(JSON.stringify([url, origin])).digest("hex");

export function signOrigin(url: string, origin: AssetOrigin): SignedOrigin | null {
  return secret() ? { origin, sig: mac(url, origin) } : null;
}

export function verifyOrigin(url: string, signed: unknown): AssetOrigin | null {
  if (!secret() || !signed || typeof signed !== "object") return null;
  const { origin, sig } = signed as Partial<SignedOrigin>;
  if (!origin || typeof sig !== "string") return null;
  const want = Buffer.from(mac(url, origin), "hex");
  const got = Buffer.from(sig, "hex");
  return want.length === got.length && timingSafeEqual(want, got) ? origin : null;
}

export function pexelsOrigin(url: string): AssetOrigin | null {
  try {
    return PEXELS_HOSTS.has(new URL(url).hostname) ? { kind: "pexels", sourceRef: url } : null;
  } catch { return null; }
}

/** One entry per distinct url: Pexels by host, else the verified (signed) origin, else `unknown`. */
export function rightsSourcesFor(urls: string[], signed: Record<string, unknown> | undefined): RightsSource[] {
  return [...new Set(urls)].map((url) => {
    const origin = pexelsOrigin(url) ?? verifyOrigin(url, signed?.[url]);
    return origin ? { ...origin, url } : { kind: "unknown" as const, url };
  });
}

/** Server-internal origins (the auto pipeline made the asset itself): same shape as the signed path, no signature. */
export function rightsSourcesFromOrigins(urls: string[], origins: Record<string, AssetOrigin>): RightsSource[] {
  return [...new Set(urls)].map((url) => {
    const origin = pexelsOrigin(url) ?? origins[url];
    return origin ? { ...origin, url } : { kind: "unknown" as const, url };
  });
}
