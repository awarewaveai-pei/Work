export type MediaProvider = "anthropic" | "openai" | "replicate" | "pexels" | "elevenlabs";

const KNOWN: readonly MediaProvider[] = ["anthropic", "openai", "replicate", "pexels", "elevenlabs"];

/** Runtime provider policy. Empty allowlist is fail-closed; no browser supplied base URLs. */
export function allowedMediaProviders(): readonly MediaProvider[] {
  const raw = (process.env.MEDIA_PROVIDER_ALLOWLIST ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (raw.length === 0) return [];
  return raw.filter((x): x is MediaProvider => (KNOWN as readonly string[]).includes(x));
}

export function assertMediaProviderAllowed(provider: string): asserts provider is MediaProvider {
  if (!allowedMediaProviders().includes(provider as MediaProvider)) throw new Error(`media provider is not allowlisted: ${provider}`);
}
