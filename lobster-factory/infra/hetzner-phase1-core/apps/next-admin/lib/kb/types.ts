// Knowledge-base types. Pure type module (no runtime imports) — import types from HERE rather than
// from the value barrel (@/lib/kb), so a dropped `type` keyword can never pull the Supabase client
// into a pure module's init path.
//
// Moved from lib/cs/types.ts in K0 (ADR 011 §決策 3) with corrected doc comments (not verbatim —
// the old `score` comment was wrong): the KB is a general product with several consumers
// (cs, SEO writing, cold email, research); its types must not live inside the customer-service
// module. Zero semantic change.

/** A document to ingest into the knowledge store. */
export interface KnowledgeInput {
  organizationId: string;
  kind: "doc" | "faq" | "sop" | "conversation" | "url";
  title: string;
  body: string;
  isSensitive?: boolean;
}

/** Pluggable embedding provider (OpenAI now; bge-m3 self-host later — D3). */
export interface EmbeddingProvider {
  id: string; // recorded in cs_knowledge_chunks.embed_model
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * One retrieved passage. `score` is the VECTOR cosine similarity from the active embedding
 * provider — NOT the fused rank score. Keyword-only hits carry 0. Consumers that threshold on it
 * (cs knowledge-gap gate) are coupled to which provider is active — see lib/kb/index.ts contract.
 */
export interface RetrievedChunk {
  id: string;
  sourceId: string;
  content: string;
  score: number;
}
