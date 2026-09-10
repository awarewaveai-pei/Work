// Knowledge-base types. Pure type module (no runtime imports) — import types from HERE rather than
// from the value barrel (@/lib/kb), so a dropped `type` keyword can never pull the Supabase client
// into a pure module's init path.
//
// Moved from lib/cs/types.ts in K0 (ADR 011 §決策 3); extended in K1 with the retrieval context and
// the versioning/temporal fields (KNOWLEDGE_BASE_PLAN.md §1.2, §1.3, §1.5).

/** A document to ingest into the knowledge store. */
export interface KnowledgeInput {
  organizationId: string;
  kind: "doc" | "faq" | "sop" | "conversation" | "url";
  title: string;
  body: string;
  isSensitive?: boolean;

  /** Stable URL identity when the document came from somewhere. Absent ⇒ identified by kind+title. */
  canonicalUrl?: string | null;
  /** Knowledge space. Absent ⇒ the default space (KB_DEFAULT_SPACE_ID). */
  spaceId?: string | null;
  /**
   * When this content became / stops being true. Absent valid_from means "since forever".
   * Recorded at ingest because it is the only moment it is knowable — it cannot be backfilled.
   */
  validFrom?: string | null;
  validTo?: string | null;

  /** Descriptive columns consumed by later stages (chunker choice, citation shape, domain pack). */
  language?: string | null;
  docType?: string | null;
  authorityTier?: string | null;
  domainPack?: string | null;
}

/** Pluggable embedding provider (OpenAI now; bge-m3 self-host later — D3). */
export interface EmbeddingProvider {
  id: string; // recorded in cs_knowledge_chunks.embed_model
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Everything a retrieval call needs to decide what this caller may see. Passed per call — there is
 * deliberately no process-global "current context" and no process-global embedding provider: K0's
 * critic found that a module-level provider singleton let one consumer silently change another
 * consumer's safety gate (cs thresholds `score`, which is provider-specific).
 */
export interface KbContext {
  /** Tenant inheritance chain, closest node first. Today callers pass [organizationId]. */
  scope: string[];
  /** The viewing node — sensitive documents do not flow down to other nodes in the chain. */
  viewer: string;
  /** Knowledge spaces to search. Omitted/null ⇒ the default space only (fail closed). */
  spaces?: string[] | null;
  /** Answer as of this instant (ISO-8601). Omitted/null ⇒ now(). */
  asOf?: string | null;
  /** Embedding provider for THIS call. Omitted ⇒ the default OpenAI provider. */
  embedder?: EmbeddingProvider;
}

/**
 * One retrieved passage. `score` is the VECTOR cosine similarity from the embedding provider used
 * for this call — NOT the fused rank score. Keyword-only hits carry 0. Consumers that threshold on
 * it (the cs knowledge-gap gate) are coupled to WHICH provider they passed in — see lib/kb/index.ts.
 */
export interface RetrievedChunk {
  id: string;
  sourceId: string;
  content: string;
  score: number;
}

/** Result of an ingest. `unchanged` means the document was already stored exactly like this. */
export interface IngestResult {
  sourceId: string | null;
  docFamilyId: string | null;
  version: number;
  chunks: number;
  unchanged: boolean;
  /**
   * The new version is stored but the previous one could not be archived, so two versions of the
   * document are active and retrieval may return both — contradictory text in the same answer.
   * Surfaced rather than swallowed: the fix is to re-ingest, which retries the archive.
   */
  supersedeFailed?: boolean;
}
