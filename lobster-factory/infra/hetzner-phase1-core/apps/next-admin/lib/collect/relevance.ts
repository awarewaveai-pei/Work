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

/**
 * Being NAMED on a page and being what the page is ABOUT are different things, and the difference
 * is worth recording. Real examples from one prod run (2026-09-20): a daily news round-up
 * ("今日大事 12月18日") and another professor's staff profile that lists him as a co-author. Both
 * name him exactly once.
 *
 * MEASURED, NOT REFUSED — corrected 2026-09-20 by the first real production dossier. This rule
 * originally DROPPED a page that named the entity only in passing. Two of the pages it dropped
 * turned out to be the only record of anything contentious in the entire corpus: a daily news
 * round-up carried the Ramsay Centre "Western Civilisation degree" controversy, and a third party's
 * staff page carried a co-authored book. In due diligence, "mentioned in connection with" is not
 * noise — it is frequently the finding, and dropping it lost facts that existed nowhere else.
 *
 * So a passing mention is LABELLED `peripheral` and kept. The junk this rule was originally reached
 * for — bookshop listings, social profiles, tag pages — is refused by lib/collect/source-class.ts
 * from the URL alone, before anything is fetched, which is where that judgement belongs.
 *
 * A page counts as being ABOUT the entity (rather than peripheral to it) when any one of these holds:
 *   - the name is in the TITLE — the page itself says that is its subject;
 *   - the name appears in two or more separate places — sustained, not incidental;
 *   - the name appears near the TOP of the text — how a document about somebody opens;
 *   - the text is SHORT (a notice, an abstract, a short bio), where one mention is the whole point.
 *
 * The opening test is what removes the length CLIFF that a bare "short enough" rule creates: a
 * 2,501-character official notice naming the entity in its first line is exactly as much about them
 * as a 2,499-character one (cross-model oracle finding, 2026-09-20).
 *
 * Deliberately not a ratio of mentions to length: that reads as precision it does not have, and it
 * punishes a long, careful profile that states the name once in the opening and then says "he".
 */
const SHORT_ENOUGH_FOR_ONE_MENTION = 2500;
const NAMED_IN_THE_OPENING = 0.15;

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
   *   peripheral — the page mentions the entity without being ABOUT them: a round-up, a third
   *               party's page, a list of names. Kept rather than dropped, because in due diligence
   *               that is frequently where a controversy is recorded, and labelled so that nobody
   *               mistakes it for a profile.
   */
  confidence: "anchored" | "name_only" | "weak" | "peripheral" | null;
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
  const aboutTheEntity =
    match.titleHit ||
    match.nameHits >= 2 ||
    (match.firstMentionAt >= 0 && match.firstMentionAt <= NAMED_IN_THE_OPENING) ||
    match.textLength <= SHORT_ENOUGH_FOR_ONE_MENTION;
  if (match.anchorsAsked > 0 && match.anchorsHit.length === 0) {
    // Strict is the default (see EntityRef.strictAnchors): the operator supplied anchors precisely
    // to exclude the other people with this name, and admitting the page anyway spends their
    // attention on exactly what they tried to filter out.
    if (entity.strictAnchors) {
      return { applicable: true, ok: false, reason: "entity_anchor_missing", confidence: null, match, entity };
    }
    return { applicable: true, ok: true, reason: null, confidence: "weak", match, entity };
  }
  // `peripheral` is the weakest ADMITTED label. It exists so the operator and the report generator
  // can see which documents are about the subject and which merely touch them — a distinction worth
  // recording and not worth discarding a document over.
  const confidence = !aboutTheEntity ? "peripheral" : match.anchorsHit.length > 0 ? "anchored" : "name_only";
  return { applicable: true, ok: true, reason: null, confidence, match, entity };
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
