import { sign } from "node:crypto";
import { modeFor, verdictOf, type EntitlementMode, type GateDependencies, type Subject } from "./can";
import { canonicalize } from "./permit";
import { PRODUCTS } from "@/lib/portal/products";
import { routeFeatureKeys } from "./route-features";

// "What this account can use" (ADR 017 §4): one signed list per billing account, so a screen greys the paid buttons it
// has not bought without asking can() per button. Kept 5 minutes; the API still asks can() on every call.

export const FEATURE_LIST_TTL_SECONDS = 300;

export interface FeatureList {
  format_version: 1;
  subject: string;
  mode: EntitlementMode;
  /** allowed = what the button should do now (shadow: always true); verdict = what enforce would answer. */
  features: Record<string, { allowed: boolean; verdict: boolean; reason: string | null }>;
  issued_at: number;
  expires_at: number;
  kid: string | null;
}
export interface SignedFeatureList { list: FeatureList; signature: string | null }

const cache = new Map<string, { value: SignedFeatureList; until: number }>();
export const resetFeatureListCache = () => cache.clear();

/** Route features plus every feature of a product with a next-admin door: the door menu lists each one, and some are
 *  asked outside a route (social.dispatch, social.auto-reply, video.motion). Cognitive's methods stay out (external door). */
export const listedFeatureKeys = (): string[] => [...new Set([...routeFeatureKeys(),
  ...PRODUCTS.filter((p) => p.door.app === "next-admin").flatMap((p) => p.features.map((f) => f.feature_key))])].sort();

export async function featureList(subject: Subject, actor: string, d: GateDependencies, keys: readonly string[] = listedFeatureKeys(),
  now = Math.floor(Date.now() / 1000)): Promise<SignedFeatureList> {
  const mode = modeFor(d, actor);
  const cacheKey = `${subject.orgId}|${mode}|${keys.join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.until > now) return hit.value;
  const features: FeatureList["features"] = {};
  for (const key of keys) {
    const v = await verdictOf(subject, key, actor, d);
    features[key] = { allowed: mode === "shadow" || v.allowed, verdict: v.allowed, reason: v.reason };
  }
  let kid: string | null = null;
  let signature: string | null = null;
  const list: FeatureList = { format_version: 1, subject: subject.orgId, mode, features, issued_at: now, expires_at: now + FEATURE_LIST_TTL_SECONDS, kid };
  try {
    const key = (await d.permit()).key;
    list.kid = kid = key.kid;
    signature = sign(null, Buffer.from(canonicalize(list), "utf8"), key.privateKey).toString("base64url");
  } catch (error) {
    // Unsigned only means no other service can rely on it; the screen still greys by it.
    console.warn(`[entitlement] feature list unsigned: ${String(error).slice(0, 200)}`);
    list.kid = null;
  }
  const value = { list, signature };
  cache.set(cacheKey, { value, until: now + FEATURE_LIST_TTL_SECONDS });
  return value;
}
