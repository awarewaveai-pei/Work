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

  /**
   * Absent ⇒ SOURCE_FACT / HUMAN_ORIGINAL, which is what a document typed into the ops console by
   * an operator actually is. A collector MUST pass its own (EVIDENCE / SOURCE_QUOTATION):
   * defaulting crawled text to "a fact we wrote" is the mislabelling this field exists to prevent.
   */
  provenance?: KnowledgeProvenance;
  /**
   * Free-form facts about HOW this document was collected, written to cs_knowledge_sources.metadata
   * (jsonb, migration 0051 — no schema change needed for a new key).
   *
   * Today's only writer is the collection pipeline's relevance gate: which entity the document was
   * collected for, how confidently it matched, and the fragment that matched. Kept WITH the
   * document rather than only in the run report, because six months later the run report is a row
   * nobody opens and "why is this page in my dossier" is the question actually being asked.
   *
   * Not for anything a query needs to filter on: a jsonb blob nobody indexes is the right home for
   * evidence, and the wrong home for a field that later grows a WHERE clause.
   */
  metadata?: Record<string, unknown> | null;
  /** Citation fields. Unknowable later — a page that changed takes its byline and date with it. */
  author?: string | null;
  publishedAt?: string | null;
  venue?: string | null;
  doi?: string | null;
}

/**
 * Where a document came from and what kind of claim it is (migration 0075).
 *
 * The vocabulary is NOT defined here — it is epistemic-label.schema.yaml (ADR-004), shared with
 * HCI. Anything fetched from the web is EVIDENCE + SOURCE_QUOTATION: the page proves somebody SAID
 * it, never that it is true. An operator's own policy is SOURCE_FACT + HUMAN_ORIGINAL.
 */
export interface KnowledgeProvenance {
  epistemicType:
    | "SOURCE_FACT" | "EVIDENCE" | "ASSUMPTION" | "HYPOTHESIS" | "AI_INFERENCE" | "AI_SUGGESTION"
    | "HUMAN_OPINION" | "CALCULATED_RESULT" | "SIMULATED_RESULT" | "UNKNOWN" | "DECISION";
  authorshipState:
    | "HUMAN_ORIGINAL" | "AI_GENERATED" | "AI_SUGGESTED" | "HUMAN_EDITED" | "HUMAN_APPROVED"
    | "SOURCE_QUOTATION";
  /**
   * Set by a human to mean "automation must not rewrite this". The failure it prevents is concrete:
   * an operator writes the authoritative policy, the crawler finds an outdated copy on the public
   * site, and the copy silently becomes the next version.
   */
  locked?: "LOCKED_FACT" | "LOCKED_DECISION" | null;
}

/** Everything needed to quote a passage back to somebody who wants to check it. */
export interface Citation {
  title: string | null;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  venue: string | null;
  doi: string | null;
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
  /**
   * Migration 0083. Fail-closed: omitted ⇒ `false`, sensitive-flagged documents are excluded.
   * A caller must actively opt IN to see them — the ops KB browser is the only place that should,
   * and does not go through `retrieve()` today (it lists/edits sources directly). The
   * customer-service reply path (lib/cs/orchestrator.ts, lib/cs/eval.ts) passes this explicitly as
   * `false` anyway, so the intent is visible at the call site and not just inherited from a default.
   */
  includeSensitive?: boolean;
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
  /**
   * How this passage may be used. A consumer putting SOURCE_QUOTATION text into a prompt must wrap
   * it as untrusted data rather than concatenating it with its own instructions
   * (DATA_COLLECTION_PLAN.md §1.3b). Not optional: a passage without a label would have to be
   * treated as the least trustworthy kind anyway, and nothing downstream would know to do that.
   */
  provenance: KnowledgeProvenance;
  /** Enough to show a reader where this came from. */
  citation: Citation;
}

/** Why an ingest refused to write. */
export type IngestRefusal = "locked" | "promotion_forbidden";

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
  /** Set when the write was refused on purpose; `sourceId` is null and nothing changed. */
  refused?: IngestRefusal;
  /**
   * The folder_id this version was actually stored with (rag.ts: `live?.folderId ?? null`) —
   * null means either a brand-new document family, or a re-ingest of one that was never manually
   * filed. A caller deciding whether to auto-assign a folder (lib/collect/sinks/kb.ts) should act
   * only when this is null; anything else is a real, already-inherited assignment from the version
   * being superseded and must not be overwritten (K2h invariant, lib/kb/db.ts's own comment).
   */
  inheritedFolderId: string | null;
}
