// Knowledge-base retrieval + ingestion — pluggable embeddings (OpenAI now, bge-m3 later — D3),
// hybrid retrieval (vector ⊕ keyword via RRF), and document ingestion. Embeddings go over fetch
// (no `openai` dep).
//
// K0 (ADR 011 §決策 3): moved verbatim from lib/cs/rag.ts. Behaviour unchanged — only the module
// it lives in, and where its config/RRF dependencies are imported from.

import { KB_EMBEDDING, KB_RETRIEVAL, KB_TIMEOUTS } from "@/lib/kb/config";
import { rrfFuse } from "@/lib/kb/rrf";
import {
  deleteKnowledgeSource,
  insertChunks,
  insertSource,
  matchChunksKeyword,
  matchChunksVector,
} from "@/lib/kb/db";
import type { EmbeddingProvider, KnowledgeInput, RetrievedChunk } from "@/lib/kb/types";

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
      const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
      return (json.data ?? []).map((d) => d.embedding);
    } finally {
      clearTimeout(timer);
    }
  }
}

let provider: EmbeddingProvider | null = null;

/** The active embedding provider (lazy). Swap with setEmbeddingProvider for bge-m3 / tests. */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!provider) provider = new OpenAIEmbeddingProvider();
  return provider;
}
export function setEmbeddingProvider(p: EmbeddingProvider): void {
  provider = p;
}

/**
 * Hybrid retrieval: embed the query, fetch vector + keyword candidates, fuse their orderings with
 * RRF, return the top-K. Each chunk's `score` is its VECTOR cosine similarity (the knowledge-gap
 * signal) — keyword-only hits carry score 0 so they contribute context but never raise the gate.
 */
export async function retrieve(organizationId: string, query: string): Promise<RetrievedChunk[]> {
  const embedding = (await getEmbeddingProvider().embed([query]))[0];
  if (!embedding) return [];

  const [vec, kw] = await Promise.all([
    matchChunksVector(organizationId, embedding, KB_RETRIEVAL.vectorTopK),
    matchChunksKeyword(organizationId, query, KB_RETRIEVAL.keywordTopK),
  ]);

  const cos = new Map<string, { sourceId: string; content: string; similarity: number }>();
  for (const m of vec) cos.set(m.id, { sourceId: m.sourceId, content: m.content, similarity: m.similarity });
  const kwContent = new Map<string, string>();
  for (const m of kw) kwContent.set(m.id, m.content);

  const fused = rrfFuse([vec.map((m) => m.id), kw.map((m) => m.id)]);
  return fused
    .slice(0, KB_RETRIEVAL.contextTopK)
    .map((f): RetrievedChunk => {
      const c = cos.get(f.id);
      return {
        id: f.id,
        sourceId: c?.sourceId ?? "",
        content: c?.content ?? kwContent.get(f.id) ?? "",
        score: c?.similarity ?? 0,
      };
    })
    .filter((c) => c.content.length > 0);
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

/**
 * Ingest one knowledge document: create a source row, chunk the body, embed, store. Contextual
 * Retrieval (Claude-generated per-chunk prefix, plan §4.2) is a P2 enhancement — seam left at
 * cs_knowledge_chunks.contextual_prefix (currently null).
 */
export async function ingestKnowledge(input: KnowledgeInput): Promise<{ sourceId: string | null; chunks: number }> {
  const sourceId = await insertSource({
    organizationId: input.organizationId,
    kind: input.kind,
    title: input.title,
    isSensitive: !!input.isSensitive,
  });
  if (!sourceId) return { sourceId: null, chunks: 0 };

  const pieces = chunkText(input.body);
  if (!pieces.length) {
    await deleteKnowledgeSource(input.organizationId, sourceId).catch(() => {});
    return { sourceId: null, chunks: 0 };
  }

  // The source row is already committed; if embedding/chunk-insert fails, roll it back so a failed
  // ingest never leaves a permanent zero-chunk ghost source (critic finding).
  try {
    const embeddings = await getEmbeddingProvider().embed(pieces);
    const model = getEmbeddingProvider().id;
    const rows = pieces.map((content, i) => ({
      organizationId: input.organizationId,
      sourceId,
      content,
      embedding: embeddings[i] ?? [],
      embedModel: model,
    }));
    const chunks = await insertChunks(rows.filter((r) => r.embedding.length > 0));
    if (chunks === 0) {
      await deleteKnowledgeSource(input.organizationId, sourceId).catch(() => {});
      return { sourceId: null, chunks: 0 };
    }
    return { sourceId, chunks };
  } catch (e) {
    await deleteKnowledgeSource(input.organizationId, sourceId).catch(() => {});
    throw e;
  }
}
