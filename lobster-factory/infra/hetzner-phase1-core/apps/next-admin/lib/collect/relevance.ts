// Relevance gate — "is this document about the entity the operator asked for?"
//
// The SECOND axis of admission, next to quality.ts. They answer different questions and must never
// be merged: quality asks "did we extract the article or the navigation bar", relevance asks "is
// the article about the right thing". A bookshop's browse page is perfect quality and zero
// relevance; a badly-extracted profile of the right person is the reverse.
//
// Owned by the orchestrator, like grading, and for the same reason (quality.ts's own note): a block
// that rates its own relevance rates itself generously.
//
// INERT BY DEFAULT. `assess` returns `applicable: false` for any target that carries no entity
// assertion, which is every source that existed before this file — a URL somebody added, a feed, a
// sitemap, an academic query. Those go on being admitted exactly as before.

import { assessEntity, entityRefOf, type EntityMatch, type EntityRef } from "@/lib/collect/entity";
import type { RawDoc } from "@/lib/collect/types";

export type RelevanceReason = "entity_absent" | "entity_anchor_missing";

export interface RelevanceVerdict {
  /** False ⇒ this target made no entity claim; the caller must treat the document as admissible. */
  applicable: boolean;
  ok: boolean;
  reason: RelevanceReason | null;
  /**
   * How firmly the document is tied to the entity:
   *   anchored  — the name AND at least one disambiguation term appeared
   *   name_only — the name appeared, no anchors were configured to check against
   *   weak      — the name appeared, anchors were configured, none of them appeared (admitted only
   *               in non-strict mode, and worth showing to a human as "might be a different person")
   */
  confidence: "anchored" | "name_only" | "weak" | null;
  match: EntityMatch | null;
  entity: EntityRef | null;
}

const NOT_APPLICABLE: RelevanceVerdict = {
  applicable: false,
  ok: true,
  reason: null,
  confidence: null,
  match: null,
  entity: null,
};

/**
 * Judge one document against the entity its TARGET asserted.
 *
 * The entity comes from the target's meta rather than the document's, because the assertion is the
 * operator's ("I am researching this person"), not the page's. A page claiming to be about somebody
 * is exactly the thing being checked, so it cannot also be the thing doing the checking.
 */
export function assessRelevance(doc: Pick<RawDoc, "text" | "title">, targetMeta: Record<string, unknown> | undefined): RelevanceVerdict {
  const entity = entityRefOf(targetMeta);
  if (!entity) return NOT_APPLICABLE;

  const match = assessEntity(doc.text, doc.title, entity);

  if (!match.nameHit) {
    return { applicable: true, ok: false, reason: "entity_absent", confidence: null, match, entity };
  }
  if (match.anchorsAsked > 0 && match.anchorsHit.length === 0) {
    // Strict is the default (see EntityRef.strictAnchors): the operator supplied anchors precisely
    // to exclude the other people with this name, and admitting the page anyway spends their
    // attention on exactly what they tried to filter out.
    if (entity.strictAnchors) {
      return { applicable: true, ok: false, reason: "entity_anchor_missing", confidence: null, match, entity };
    }
    return { applicable: true, ok: true, reason: null, confidence: "weak", match, entity };
  }
  return {
    applicable: true,
    ok: true,
    reason: null,
    confidence: match.anchorsHit.length > 0 ? "anchored" : "name_only",
    match,
    entity,
  };
}

/**
 * What a stored document carries about WHY it was considered relevant.
 *
 * Kept with the document rather than only in the run report: six months later the run report is a
 * row nobody opens, while "this page is in the dossier because it names her and mentions La Trobe"
 * is the thing that makes the dossier auditable at all.
 */
export function relevanceMetadata(v: RelevanceVerdict): Record<string, unknown> | null {
  if (!v.applicable || !v.entity || !v.match) return null;
  return {
    entityName: v.entity.name,
    entityKind: v.entity.kind,
    entityConfidence: v.confidence,
    entityHits: v.match.nameHits,
    entityAnchorsHit: v.match.anchorsHit,
    entitySnippet: v.match.snippet,
  };
}
