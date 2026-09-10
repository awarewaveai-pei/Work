// Public surface of the knowledge-base module. External callers — the ops knowledge admin, the
// cs engine, and (planned) SEO writing / cold email / research consumers — import ONLY from here.
// Internals (db, rag, rrf, config) stay private so the module can be extracted to a standalone
// service later without changing any caller (ADR 011 §決策 3, K4).
//
// SCOPE (ADR 011 §決策 12): the KB returns EVIDENCE, never ANSWERS. There is deliberately no
// answer()/chat() here, and no guardrail / intent / autonomy logic — those belong to each
// consumer (lib/cs for customer service). Adding one here would make this KB sellable to exactly
// one kind of customer.
//
// NOT exported on purpose: chunkText and rrfFuse. They are internal mechanics (splitting,
// rank fusion) that no consumer has a reason to call; lib/kb/__tests__ reaches them directly.
//
// RETRIEVAL CONTRACT — load-bearing for consumers' safety gates:
//   retrieve() returns RetrievedChunk.score = the raw cosine similarity from the ACTIVE embedding
//   provider. Consumers that threshold on it (e.g. lib/cs/config.ts CS_THRESHOLDS.minRetrievalScore
//   gates knowledge-gap handoff) are coupled to which provider is active. setEmbeddingProvider is a
//   process-global singleton, so one consumer swapping providers changes another consumer's gate
//   semantics. K1 must replace this with per-caller provider injection — tracked in
//   agency-os/docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md §2 (K1 DoD).

export { ingestKnowledge, retrieve, getEmbeddingProvider, setEmbeddingProvider } from "@/lib/kb/rag";
export { listKnowledgeSources, deleteKnowledgeSource } from "@/lib/kb/db";

export type { KnowledgeInput, EmbeddingProvider, RetrievedChunk } from "@/lib/kb/types";
