// Knowledge-base retrieval + ingestion — pluggable embeddings (OpenAI now, bge-m3 later — D3),
// hybrid retrieval (vector ⊕ keyword via RRF), and versioned document ingestion. Embeddings go over
// fetch (no `openai` dep).
//
// K0 (ADR 011 §決策 3): moved from lib/cs/rag.ts.
// K1: the embedding provider is chosen PER CALL instead of by a module-level singleton, and ingest
// actually versions documents (KNOWLEDGE_BASE_PLAN.md §1.3).

import { KB_DEFAULT_SPACE_ID, KB_EMBEDDING, KB_RETRIEVAL, KB_TIMEOUTS } from "@/lib/kb/config";
import { rrfFuse } from "@/lib/kb/rrf";
import { canonicalKeyFor, contentHash, docFamilyId } from "@/lib/kb/family";
import {
  archiveOtherVersions,
  deleteKnowledgeSource,
  getFamilyState,
  insertChunks,
  insertSource,
  matchChunksKeyword,
  matchChunksVector,
  listVisibleSourceTitles,
  type RetrievalScope,
} from "@/lib/kb/db";
import type {
  Citation,
  EmbeddingProvider,
  IngestResult,
  KbContext,
  KnowledgeInput,
  KnowledgeProvenance,
  RetrievedChunk,
} from "@/lib/kb/types";
import type { MatchAttribution } from "@/lib/kb/db";

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  id = KB_EMBEDDING.model;
  dimensions = KB_EMBEDDING.dimensions;
  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("missing OPENAI_API_KEY");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KB_TIMEOUTS.embedMs);
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: KB_EMBEDDING.model, input: texts }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`openai_embeddings_${res.status}`);
      const json = (await res.json()) as { data?: Array<{ index?: number; embedding: number[] }> };
      // Order by the response's own `index`: the API documents an index per item and does not
      // promise array order. A shuffled response would pair each chunk with another chunk's vector
      // — retrieval then returns confidently irrelevant passages, with no error anywhere.
      const rows = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return rows.map((d) => d.embedding);
    } finally {
      clearTimeout(timer);
    }
  }
}

let defaultProvider: EmbeddingProvider | null = null;

/**
 * The provider used when a caller does not bring its own. It is a lazy instance, NOT a swappable
 * global: K0's critic found that a settable module-level provider let any consumer change which
 * model produced `RetrievedChunk.score`, and cs thresholds that score in its knowledge-gap safety
 * gate. Callers that need a different model pass `ctx.embedder` and change nothing for anyone else.
 */
export function defaultEmbedder(): EmbeddingProvider {
  if (!defaultProvider) defaultProvider = new OpenAIEmbeddingProvider();
  return defaultProvider;
}

function scopeOf(ctx: KbContext, model: string): RetrievalScope {
  return {
    scope: ctx.scope,
    // An empty array would mean "no space matches anything" further down; treat it as "unspecified"
    // so the caller gets the documented default-space behaviour rather than a silent empty result.
    spaces: ctx.spaces && ctx.spaces.length ? ctx.spaces : null,
    viewer: ctx.viewer,
    asOf: ctx.asOf ?? null,
    model,
    // Fail-closed: anything other than an explicit `true` excludes sensitive content (migration 0083).
    includeSensitive: ctx.includeSensitive === true,
  };
}

/** Most document titles visibleTitles() returns: enough for a small business's whole site. */
export const VISIBLE_TITLES_LIMIT = 100;

/**
 * The titles of the documents retrieve() could return for this context, newest first, capped at
 * VISIBLE_TITLES_LIMIT. For a consumer that rewrites a question into a search query: the
 * business's own names (a programme called "Back To The Origin") are what the documents say, and a
 * literal translation of the customer's wording ("returning to where I started") misses them.
 * Same fail-closed checks as retrieve(). Never evidence: a title says a document exists, not what
 * it supports.
 */
export async function visibleTitles(ctx: KbContext): Promise<string[]> {
  if (!ctx.scope.length || !ctx.viewer || !ctx.scope.includes(ctx.viewer)) return [];
  const embedder = ctx.embedder ?? defaultEmbedder();
  return listVisibleSourceTitles(scopeOf(ctx, embedder.id), VISIBLE_TITLES_LIMIT);
}

/**
 * Hybrid retrieval: embed the query, fetch vector + keyword candidates, fuse their orderings with
 * RRF, return the top-K. Each chunk's `score` is its VECTOR cosine similarity (the knowledge-gap
 * signal) — keyword-only hits carry score 0 so they contribute context but never raise the gate.
 *
 * Both halves receive the SAME RetrievalScope object, and both apply it inside the database via the
 * same predicate text (migration 0072). Neither this function nor lib/kb/db.ts can filter one half
 * differently from the other.
 */
export async function retrieve(ctx: KbContext, query: string): Promise<RetrievedChunk[]> {
  // Fail closed. `viewer` outside `scope` is rejected rather than ignored: when this module becomes
  // a network service (K4), scope and viewer arrive from the caller, and an unchecked pair is a
  // cross-tenant read dressed up as a normal query.
  if (!ctx.scope.length || !ctx.viewer || !ctx.scope.includes(ctx.viewer)) return [];
  const embedder = ctx.embedder ?? defaultEmbedder();
  const embedding = (await embedder.embed([query]))[0];
  if (!embedding) return [];

  const s = scopeOf(ctx, embedder.id);
  const [vec, kw] = await Promise.all([
    matchChunksVector(s, embedding, KB_RETRIEVAL.vectorTopK),
    matchChunksKeyword(s, query, KB_RETRIEVAL.keywordTopK),
  ]);

  const byId = new Map<string, { sourceId: string; content: string; similarity: number; attribution: MatchAttribution }>();
  for (const m of kw) byId.set(m.id, { sourceId: m.sourceId, content: m.content, similarity: 0, attribution: m });
  for (const m of vec) byId.set(m.id, { sourceId: m.sourceId, content: m.content, similarity: m.similarity, attribution: m });

  const fused = rrfFuse([vec.map((m) => m.id), kw.map((m) => m.id)]);
  let topIds = fused.slice(0, KB_RETRIEVAL.contextTopK).map((f) => f.id);

  // INVARIANT (broken by activating the keyword arm in migration 0076, restored here): the single
  // best vector match is never silently evicted from what this function returns.
  //
  // RRF ranks by reciprocal rank, not by magnitude, and a keyword-only chunk's score is forced to 0
  // (real cosine similarity was never computed for it — see the map below). That means enough
  // mediocre documents that happen to rank decently in BOTH lists can out-rank vec[0] in fused order
  // and fill every context slot, even though vec[0] has the highest cosine similarity of anything
  // retrieve() saw. Two things break at once if that happens: the LLM drafts from weaker evidence
  // than what was available, and lib/kb/index.ts's documented contract ("RetrievedChunk.score = the
  // raw cosine similarity... a consumer thresholds on it to decide a knowledge-gap handoff") no
  // longer holds — CS_THRESHOLDS.minRetrievalScore (lib/cs/config.ts) can then only read LOWER than
  // it would have pre-0076, never higher, because a displaced vec[0] is replaced by items whose
  // score is provably ≤ vec[0]'s (vec-list members can't exceed the top vector rank's similarity;
  // keyword-only members score 0) — a one-directional, hard-to-notice safety regression.
  //
  // Fixing this here (once, for every consumer) rather than in each consumer keeps the promise in
  // the RETRIEVAL CONTRACT comment true without touching cs/autonomy.ts's already-tested threshold
  // logic, and keeps the keyword arm's actual benefit — the other contextTopK-1 slots still come
  // from fused ranking, so keyword-relevant documents the vector half ranked low still get in.
  if (vec[0] && !topIds.includes(vec[0].id)) {
    topIds = [vec[0].id, ...topIds.slice(0, KB_RETRIEVAL.contextTopK - 1)];
  }

  return topIds
    .map((id): RetrievedChunk => {
      const c = byId.get(id);
      return {
        id,
        sourceId: c?.sourceId ?? "",
        content: c?.content ?? "",
        score: c?.similarity ?? 0,
        provenance: provenanceOf(c?.attribution),
        citation: citationOf(c?.attribution),
      };
    })
    .filter((c) => c.content.length > 0);
}

/**
 * What a passage's label is when the stored row has none.
 *
 * UNKNOWN, never a friendly guess. Rows written before migration 0075 genuinely have no label, and
 * calling them SOURCE_FACT would promote every one of them — including anything a crawler stored —
 * to "a fact we wrote". A consumer seeing UNKNOWN can decide to be careful; one seeing SOURCE_FACT
 * cannot.
 */
export function provenanceOf(a: MatchAttribution | undefined): KnowledgeProvenance {
  const epistemic = a?.epistemic_type as KnowledgeProvenance["epistemicType"] | null | undefined;
  const authorship = a?.authorship_state as KnowledgeProvenance["authorshipState"] | null | undefined;
  return {
    epistemicType: epistemic ?? "UNKNOWN",
    authorshipState: authorship ?? "SOURCE_QUOTATION",
    locked: (a?.locked as KnowledgeProvenance["locked"]) ?? null,
  };
}

export function citationOf(a: MatchAttribution | undefined): Citation {
  return {
    title: a?.title ?? null,
    url: a?.canonical_url ?? null,
    author: a?.author ?? null,
    publishedAt: a?.published_at ?? null,
    venue: a?.venue ?? null,
    doi: a?.doi ?? null,
  };
}

/**
 * Recursive-ish chunking: pack paragraphs to ~`target` chars with `overlap` carry-over, then
 * hard-split any oversize chunk. Pure (unit-tested). CJK length ≈ char count is fine here.
 */
export function chunkText(body: string, target = 500, overlap = 80): string[] {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const packed: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && (buf.length + 2 + p.length) > target) {
      packed.push(buf);
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = `${tail}\n\n${p}`;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf.trim()) packed.push(buf.trim());

  const out: string[] = [];
  for (const c of packed) {
    if (c.length <= Math.floor(target * 1.6)) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += target) out.push(c.slice(i, i + target));
  }
  return out;
}

const EMPTY_INGEST: IngestResult = { sourceId: null, docFamilyId: null, version: 0, chunks: 0, unchanged: false, inheritedFolderId: null };

/**
 * Ingest one knowledge document as a new VERSION of its document family.
 *
 * Order is load-bearing (KNOWLEDGE_BASE_PLAN.md §1.3): chunk → insert the new version → store its
 * chunks → only then archive the previous version. supabase-js has no transactions, so if embedding
 * fails halfway the new version is deleted and the previous version is still active and still
 * retrievable. Archiving first would leave the document with nothing at all.
 *
 * Re-ingesting byte-identical content returns `unchanged` instead of creating version N+1 — without
 * it, a crawler re-fetching an unchanged page would grow the family forever and re-embed every time.
 *
 * Contextual Retrieval (Claude-generated per-chunk prefix, plan §4.2) is a P2 enhancement — seam
 * left at cs_knowledge_chunks.contextual_prefix (currently null).
 */
export async function ingestKnowledge(input: KnowledgeInput, embedder?: EmbeddingProvider): Promise<IngestResult> {
  const canonicalKey = canonicalKeyFor(input);
  const familyId = docFamilyId(input.organizationId, canonicalKey);
  const hash = contentHash(input.body);

  const pieces = chunkText(input.body);
  if (!pieces.length) return { ...EMPTY_INGEST, docFamilyId: familyId };

  const spaceId = input.spaceId ?? KB_DEFAULT_SPACE_ID;
  const { live, maxVersion } = await getFamilyState(input.organizationId, familyId);

  // A locked document is the operator's answer, and AUTOMATION does not get to replace it. The
  // sequence this prevents is concrete: someone writes the authoritative refund policy by hand, the
  // crawler later finds last year's copy still published on the public site, and stores it as
  // version 2 — no error, no alert, and the knowledge base now contradicts the company.
  //
  // A person editing their own locked document is not that: the lock stops machines, not authors.
  // "Automation" here means the content is quoted or machine-written, which is exactly what a
  // collector stamps and what an operator's own writing never is.
  const fromAutomation =
    input.provenance?.authorshipState === "SOURCE_QUOTATION" ||
    input.provenance?.authorshipState === "AI_GENERATED" ||
    input.provenance?.authorshipState === "AI_SUGGESTED";
  if (live?.locked && fromAutomation) {
    return { ...EMPTY_INGEST, docFamilyId: familyId, sourceId: live.id, version: live.version, refused: "locked", inheritedFolderId: live.folderId ?? null };
  }
  // "Unchanged" has to mean the whole document, not just its text. Re-uploading the same body with
  // the sensitive flag newly ticked is a real change; treating it as a no-op would silently discard
  // a change the operator believes they made.
  const sameMetadata =
    !!live &&
    live.isSensitive === !!input.isSensitive &&
    (live.spaceId ?? KB_DEFAULT_SPACE_ID) === spaceId &&
    (live.canonicalUrl ?? null) === (input.canonicalUrl ?? null) &&
    (live.validFrom ?? null) === (input.validFrom ?? null) &&
    (live.validTo ?? null) === (input.validTo ?? null);
  if (live && live.contentHash === hash && sameMetadata) {
    return { sourceId: live.id, docFamilyId: familyId, version: live.version, chunks: 0, unchanged: true, inheritedFolderId: live.folderId ?? null };
  }

  const version = maxVersion + 1;
  // Absent ⇒ an operator typed it in, which is exactly SOURCE_FACT / HUMAN_ORIGINAL. Collectors
  // pass EVIDENCE / SOURCE_QUOTATION explicitly; see KnowledgeInput.provenance.
  const provenance: KnowledgeProvenance = input.provenance ?? {
    epistemicType: "SOURCE_FACT",
    authorshipState: "HUMAN_ORIGINAL",
    locked: null,
  };
  const sourceId = await insertSource({
    organizationId: input.organizationId,
    kind: input.kind,
    title: input.title,
    isSensitive: !!input.isSensitive,
    docFamilyId: familyId,
    sourceVersion: version,
    contentHash: hash,
    body: input.body,
    // K2h (critic finding 2026-09-17): there is no ingest-time field for folder assignment — it is
    // set afterwards via a separate ops-console action (PATCH .../cs-knowledge move_folder) — so a
    // re-ingest must inherit it from the version being superseded, or every edit to a filed
    // document would silently un-file it. A brand new document family has no `live`, so it starts
    // unfiled exactly as it does today.
    folderId: live?.folderId ?? null,
    canonicalUrl: input.canonicalUrl ?? null,
    spaceId,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    language: input.language ?? null,
    docType: input.docType ?? null,
    authorityTier: input.authorityTier ?? null,
    domainPack: input.domainPack ?? null,
    metadata: input.metadata ?? {},
    epistemicType: provenance.epistemicType,
    authorshipState: provenance.authorshipState,
    locked: provenance.locked ?? null,
    author: input.author ?? null,
    publishedAt: input.publishedAt ?? null,
    venue: input.venue ?? null,
    doi: input.doi ?? null,
  });
  if (!sourceId) return { ...EMPTY_INGEST, docFamilyId: familyId, inheritedFolderId: live?.folderId ?? null };

  const provider = embedder ?? defaultEmbedder();
  try {
    const embeddings = await provider.embed(pieces);
    // All or nothing. Storing the subset that came back would drop paragraphs from the document
    // while reporting success — and because content_hash records the FULL body, re-uploading the
    // same text would then be treated as unchanged, making the loss permanent and invisible.
    if (embeddings.length !== pieces.length || embeddings.some((e) => !e?.length)) {
      throw new Error(`embedding_count_mismatch_${embeddings.length}_of_${pieces.length}`);
    }
    const rows = pieces.map((content, i) => ({
      organizationId: input.organizationId,
      sourceId,
      docFamilyId: familyId,
      sourceVersion: version,
      content,
      embedding: embeddings[i]!,
      embedModel: provider.id,
    }));
    const chunks = await insertChunks(rows);
    if (chunks !== pieces.length) {
      // Partially stored is not a version. Remove it and leave the previous one active.
      await deleteKnowledgeSource(input.organizationId, sourceId).catch(() => {});
      return { ...EMPTY_INGEST, docFamilyId: familyId, inheritedFolderId: live?.folderId ?? null };
    }
    const archive = await archiveOtherVersions(input.organizationId, familyId, sourceId);
    return {
      sourceId,
      docFamilyId: familyId,
      version,
      chunks,
      unchanged: false,
      supersedeFailed: archive.failed,
      inheritedFolderId: live?.folderId ?? null,
    };
  } catch (e) {
    await deleteKnowledgeSource(input.organizationId, sourceId).catch(() => {});
    throw e;
  }
}
