// Knowledge-base config — embedding provider, retrieval fan-out, timeouts.
//
// K0 (ADR 011 §決策 3): moved out of lib/cs/config.ts with IDENTICAL VALUES. Verified before the
// move that every constant here had exactly one reader on the retrieval path — KB_EMBEDDING /
// embedMs / vectorTopK / keywordTopK / contextTopK in lib/cs/rag.ts, and rrfK in rrfFuse's default
// parameter (then in lib/cs/autonomy.ts, now lib/kb/rrf.ts). None was read by customer-service
// decision logic — so this is a relocation, not a behaviour change.
// The constants that stayed in lib/cs/config.ts (minRetrievalScore, defaultConfidence,
// maxToolRounds) are customer-service gates and are deliberately NOT duplicated here.

/** OpenAI embeddings (pluggable — see EmbeddingProvider in ./types.ts). small = 1536 dims. */
export const KB_EMBEDDING = {
  provider: "openai" as const,
  model: "text-embedding-3-small",
  dimensions: 1536,
} as const;

export const KB_RETRIEVAL = {
  /** Hybrid retrieval fan-out before fusion. */
  vectorTopK: 24,
  keywordTopK: 24,
  /** Passages returned to the caller. */
  contextTopK: 4,
  /** RRF constant (k). */
  rrfK: 60,
} as const;

export const KB_TIMEOUTS = {
  embedMs: 10_000,
} as const;

/**
 * The space every document lands in until K2 introduces space management. Rows written before K1
 * have space_id NULL, which the retrieval predicate COALESCEs to this same value — so "no space"
 * and "the default space" are one set, not two. Retrieval with no spaces requested searches ONLY
 * this space: a business question must not silently pick up academic material, so the default is
 * fail-closed rather than search-everything.
 *
 * Kept byte-identical to the constant embedded in migration 0072's predicate.
 */
export const KB_DEFAULT_SPACE_ID = "00000000-0000-0000-0000-000000000000";
