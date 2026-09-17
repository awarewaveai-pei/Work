// Public surface of the knowledge-base module. External callers — the ops knowledge admin, the
// cs engine, and (planned) SEO writing / cold email / research consumers — import ONLY from here.
// Internals (db, rag, rrf, family, config) stay private so the module can be extracted to a
// standalone service later without changing any caller (ADR 011 §決策 3, K4).
//
// SCOPE (ADR 011 §決策 12): the KB returns EVIDENCE, never ANSWERS. There is deliberately no
// answer()/chat() here, and no guardrail / intent / autonomy logic — those belong to each
// consumer (lib/cs for customer service). Adding one here would make this KB sellable to exactly
// one kind of customer.
//
// NOT exported on purpose: chunkText, rrfFuse, and the family-id helpers. They are internal
// mechanics (splitting, rank fusion, document identity) that no consumer has a reason to call;
// lib/kb/__tests__ reaches them directly.
//
// RETRIEVAL CONTRACT — load-bearing for consumers' safety gates:
//   retrieve(ctx, query) returns RetrievedChunk.score = the raw cosine similarity from the provider
//   in `ctx.embedder` (the default OpenAI one when omitted). A consumer that thresholds on it — cs
//   does, in CS_THRESHOLDS.minRetrievalScore, to decide a knowledge-gap handoff — is coupled to the
//   provider IT passes, and to nobody else's choice. K1 removed the process-global provider that
//   used to make that coupling cross-consumer.
//
//   Visibility is decided by six predicates inside the database (migration 0072):
//   scope × space × status × sensitive × as_of × embed_model. Both halves of hybrid retrieval share
//   one predicate text; a caller cannot widen one half. `ctx` with an empty scope returns nothing.

export { ingestKnowledge, retrieve, defaultEmbedder } from "@/lib/kb/rag";
export {
  listKnowledgeSources,
  listArchivedKnowledgeSources,
  archiveKnowledgeSource,
  restoreKnowledgeSource,
  rebindManualDocumentUrl,
  deleteKnowledgeSource,
  getSourceDetail,
  listVersionsForFamily,
  type RebindError,
  type SourceDetail,
  type VersionSummary,
} from "@/lib/kb/db";

export type { KnowledgeInput, EmbeddingProvider, RetrievedChunk, KbContext, IngestResult } from "@/lib/kb/types";
