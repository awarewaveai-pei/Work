import { sign } from "node:crypto";
import { modeFor, verdictOf, type EntitlementMode, type GateDependencies, type Subject } from "./can";
import type { PermitPayload } from "./permit";
import { canonicalize } from "./permit";
import { PRODUCTS } from "@/lib/portal/products";
import { routeFeatureKeys } from "./route-features";

// "What this account can use" (ADR 017 §4): one signed list per billing account, so a screen greys the paid buttons it
// has not bought without asking can() per button. Kept 5 minutes or until a payment for the account (forgetFeatureListFor);
// the API still asks can() on every call.

export const FEATURE_LIST_TTL_SECONDS = 300;

export interface FeatureList {
  format_version: 1;
  subject: string;
  mode: EntitlementMode;
  /** allowed = what the button should do now (shadow: always true); verdict = what enforce would answer; source = who
   *  pays when verdict is true (contract / comp / credits, rightLabel's `source`), else null. */
  features: Record<string, { allowed: boolean; verdict: boolean; reason: string | null; source: PermitPayload["source"] | null }>;
  issued_at: number;
  expires_at: number;
  kid: string | null;
}
export interface SignedFeatureList { list: FeatureList; signature: string | null }

const cache = new Map<string, { value: SignedFeatureList; until: number }>();
// Bumped by forgetFeatureListFor: a list being built when the account's rights changed is returned but not kept.
const epochs = new Map<string, number>();
export const resetFeatureListCache = () => { cache.clear(); epochs.clear(); };
/** A payment changed this billing account's rights (U28): its next read builds a new list; other accounts keep theirs.
 *  In-memory, this process only (a second container keeps its copy until the TTL). */
export function forgetFeatureListFor(orgId: string): void {
  epochs.set(orgId, (epochs.get(orgId) ?? 0) + 1);
  for (const key of cache.keys()) if (key.startsWith(`${orgId}|`)) cache.delete(key);
}

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
  const epoch = epochs.get(subject.orgId) ?? 0;
  const features: FeatureList["features"] = {};
  for (const key of keys) {
    const v = await verdictOf(subject, key, actor, d);
    features[key] = { allowed: mode === "shadow" || v.allowed, verdict: v.allowed, reason: v.reason, source: v.source };
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
  if ((epochs.get(subject.orgId) ?? 0) === epoch) cache.set(cacheKey, { value, until: now + FEATURE_LIST_TTL_SECONDS });
  return value;
}
