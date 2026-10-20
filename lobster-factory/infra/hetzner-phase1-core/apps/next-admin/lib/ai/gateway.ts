/** Provider SDK boundary (ADR 017). Lazy loads preserve server-only construction at each call site.
 * Client model pickers import claude-params directly, so their graph contains no provider SDK.
 * Every loader takes a Grant minted by entitlements `can()`; no grant, or a refused one, throws EntitlementRequired.
 */
import { EntitlementRequired, Grant } from "@/lib/entitlements/can";

export * from "./claude-params";
export type { default as Anthropic } from "@anthropic-ai/sdk";

/** Runtime half of the type-enforced parameter: JS callers and `as never` casts still hit this. */
export function assertGrant(grant: Grant): void {
  if (!(grant instanceof Grant)) throw new EntitlementRequired("missing_grant");
  if (!grant.allowed) throw new EntitlementRequired(grant.reason ?? "denied");
}

export async function loadAnthropic(grant: Grant) {
  assertGrant(grant);
  return (await import("@anthropic-ai/sdk")).default;
}

export async function loadGoogleGenerativeAI(grant: Grant) {
  assertGrant(grant);
  return (await import("@google/generative-ai")).GoogleGenerativeAI;
}

// Raw HTTP to a paid provider goes through here too: these origins are spelled nowhere else (import-boundary test).
const PROVIDER_ORIGINS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  replicate: "https://api.replicate.com",
} as const;
export type Provider = keyof typeof PROVIDER_ORIGINS;

/** The provider URL for `path`, only with an allowed grant (polls of the same job reuse the grant they started with). */
export function providerUrl(grant: Grant, provider: Provider, path: string): string {
  assertGrant(grant);
  if (!path.startsWith("/")) throw new Error(`providerUrl: path must start with "/" (${provider})`);
  return `${PROVIDER_ORIGINS[provider]}${path}`;
}
