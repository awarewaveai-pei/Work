// sink/kb — deliver collected documents to the knowledge base.
//
// This is the ONLY file in lib/collect that knows lib/kb exists (enforced by
// __tests__/collect-block-hygiene.test.ts). Collection and the knowledge base are two systems; this
// sink is the seam between them, and deleting this one file leaves both working.
//
// Division of labour, deliberately narrow (ADR 011, DATA_COLLECTION_PLAN.md §2):
//   * collection decides WHAT was fetched and whether it is worth storing;
//   * the knowledge base decides what a VERSION is — same canonical URL, changed text ⇒ version N+1,
//     unchanged text ⇒ nothing at all. This sink must not re-implement any of that, and does not.

import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import { registerSink } from "@/lib/collect/registry";
import { ingestKnowledge } from "@/lib/kb";
import { findOrCreateFolderByName, moveSourceToFolder } from "@/lib/kb/folders";

// Auto-foldering for search-driven runs (operator, 2026-09-18: "搜尋到的資料應該直接進入一個資料夾, 不是散落
// 一地" — folder name = search keyword + YYYYMMDDHHmm). Scoped to documents whose Target carried a
// `searchQuery` (collect/web-search.ts and collect/academic.ts both stamp it, http-html.ts carries it
// through) — a plain "add this one URL" source has no query to name a folder after, so it stays
// unfoldered exactly as before this feature existed.
//
// Cache shape mirrors lib/collect/run-jobs.ts's own reasoning: this sink is one long-lived module
// instance for the life of the server process (registerSink(createKbSink()) below runs once at
// import time), so a plain Map safely de-dupes repeated (runId, query) lookups across a run's
// multiple flush() calls without a new table — and, keying the cache by the PROMISE rather than the
// resolved id, two docs from the very same flush racing to resolve the same brand-new folder name
// share one in-flight createFolder call instead of both hitting the duplicate_name fallback path.
const folderCache = new Map<string, { promise: Promise<string | null>; createdAt: number }>();
const FOLDER_CACHE_MAX_AGE_MS = 60 * 60_000; // a run does not legitimately span longer than this

function pruneFolderCache(now: number) {
  for (const [key, entry] of folderCache) {
    if (now - entry.createdAt > FOLDER_CACHE_MAX_AGE_MS) folderCache.delete(key);
  }
}

/** Test-only escape hatch, same rationale as lib/cognitive-os/client.ts's own
 *  resetCognitiveOsSessionCacheForTests: this module-level cache is the whole point in production
 *  (one long-lived sink instance for the server process's life) but leaks between otherwise-isolated
 *  test cases that reuse the same (runId, query) pair otherwise. */
export function resetFolderCacheForTests(): void {
  folderCache.clear();
}

function folderName(query: string, now: Date): string {
  const stamp =
    String(now.getUTCFullYear()) +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0");
  // Capped well under createFolder's own 200-char slice so the timestamp suffix -- the part that
  // actually distinguishes one run's folder from the next -- can never itself be the part silently
  // truncated off a long PICO boolean query.
  return `${query.trim().slice(0, 150)}_${stamp}`;
}

/**
 * Resolves to null (never rejects) on any failure — a folder-assignment problem must not be
 * mistaken for the ingest itself having failed; see this file's write-loop for how the caller
 * reports that distinction.
 *
 * Only a CONFIRMED SUCCESS is cached (critic finding, 2026-09-18) — today's orchestrator (run.ts /
 * orchestrator.ts) awaits each sink flush sequentially and this file's own write-loop is a plain
 * `for...of` with `await` inside, so there is no concurrent race for the promise-level cache to
 * de-dupe in the first place; caching a transient failure would only cost every later doc in the
 * same run its own retry, for up to FOLDER_CACHE_MAX_AGE_MS, over one blip. Matches
 * lib/cognitive-os/client.ts's own cachedCookie precedent, which populates its cache strictly
 * after a confirmed-good login, never before.
 */
async function resolveSearchFolderId(organizationId: string, runId: string, query: string): Promise<string | null> {
  const now = Date.now();
  pruneFolderCache(now);
  const key = `${organizationId}:${runId}:${query}`;
  const cached = folderCache.get(key);
  if (cached) return cached.promise;
  const id = await findOrCreateFolderByName(organizationId, folderName(query, new Date(now)), null).then(
    (r) => (r.ok ? r.id : null),
    () => null,
  );
  if (id) folderCache.set(key, { promise: Promise.resolve(id), createdAt: now });
  return id;
}

export interface KbSinkOptions {
  /**
   * How the collection tenantRef maps to a knowledge-base organization id. Injected rather than
   * assumed: tenantRef is documented as opaque, and today's identity is a coincidence of both being
   * the organization uuid, not a contract.
   */
  organizationIdFor?: (tenantRef: string) => string;
  /** Knowledge space to file documents in. Omitted ⇒ the KB's default space. */
  spaceId?: string | null;
  /** Cap on the text stored per document, matching the ops upload limit. */
  maxBodyChars?: number;
}

export function createKbSink(opts: KbSinkOptions = {}): SinkBlock {
  const orgOf = opts.organizationIdFor ?? ((tenantRef: string) => tenantRef);
  const maxBodyChars = opts.maxBodyChars ?? 100_000;

  return {
    id: "sink/kb",
    title: "Knowledge base",
    icon: "📚",

    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      const report: SinkReport = { written: 0, skipped: 0, errors: [] };
      const organizationId = orgOf(ctx.tenantRef);

      for (const doc of docs) {
        try {
          // Truncated rather than stored: the knowledge base hashes the body it is given, so a
          // silently shortened document would (a) supersede the complete version and (b) report
          // "unchanged" forever after, because every later edit past the cut point hashes the same.
          if (doc.text.length > maxBodyChars) {
            report.errors!.push(`too_long_for_kb:${doc.canonicalUrl}:${doc.text.length}`);
            report.skipped++;
            continue;
          }
          const result = await ingestKnowledge({
            organizationId,
            kind: "url",
            // A page without a usable title still needs a stable identity, and the canonical URL is
            // exactly that. Falling back to something like "Untitled" would merge every such page
            // into one document family.
            title: (doc.title ?? doc.canonicalUrl).slice(0, 300),
            body: doc.text,
            canonicalUrl: doc.canonicalUrl,
            spaceId: opts.spaceId ?? null,
            language: typeof doc.meta.language === "string" ? doc.meta.language : null,
            docType: doc.contentType || "web_page",
            // The label the orchestrator stamped, carried the whole way (DATA_COLLECTION_PLAN §1.3b).
            // Without it a consumer cannot tell a vendor's claim scraped off the open web from a
            // policy the operator wrote, and therefore cannot wrap the first one before it reaches
            // a prompt. A locked document refuses this write outright — see lib/kb/rag.ts.
            provenance: {
              epistemicType: doc.provenance.epistemic_type,
              authorshipState: doc.provenance.authorship_state,
              locked: doc.provenance.locked,
            },
            author: doc.author,
            publishedAt: doc.publishedAt,
            venue: typeof doc.meta.venue === "string" ? doc.meta.venue : null,
            doi: typeof doc.meta.doi === "string" ? doc.meta.doi : null,
            // publishedAt is when the source says the content became true. Recorded now because it
            // is unknowable later — nobody can reconstruct it after the fact.
            validFrom: doc.publishedAt,
          });

          if (result.refused === "locked") {
            // Not a failure: the operator marked this document as theirs. Reported so a crawl that
            // silently stops updating one page does not look like a page that stopped changing.
            report.skipped++;
            report.errors!.push(`locked:${doc.canonicalUrl}`);
            continue;
          }
          if (result.unchanged) {
            report.skipped++;
            continue;
          }
          if (!result.sourceId) {
            report.errors!.push(`ingest_failed:${doc.canonicalUrl}`);
            continue;
          }
          if (result.supersedeFailed) {
            // Stored, but the previous version is still active: both can be retrieved, and they may
            // contradict each other. Loud, because the fix is a re-ingest, not a wait.
            report.errors!.push(`supersede_failed:${doc.canonicalUrl}`);
          }
          report.written++;

          // Only files when nothing is already inherited (critic finding 2026-09-18, refined
          // 2026-09-18 operator report: gating on version===1 alone made a document collected once
          // before this feature shipped, then re-collected with changed text, permanently
          // unfolderable — result.version was 2 forever after, even though it had never actually
          // been filed anywhere). result.inheritedFolderId is lib/kb/rag.ts's own
          // `live?.folderId ?? null`: null means either a brand-new document family OR a re-ingest
          // of one that was never manually organized — both are safe to auto-file. Anything else is
          // a REAL prior assignment (manual or a previous auto-file) carried forward on purpose
          // (K2h invariant, lib/kb/db.ts's own comment) and must not be overwritten.
          const searchQuery = result.inheritedFolderId === null && typeof doc.meta.searchQuery === "string" ? doc.meta.searchQuery.trim() : "";
          if (searchQuery) {
            try {
              const folderId = await resolveSearchFolderId(organizationId, ctx.runId, searchQuery);
              if (folderId) {
                const moved = await moveSourceToFolder(organizationId, result.sourceId, folderId);
                // `=== false`, never `!moved.ok` — see lib/cognitive-os/client.ts's comment on why
                // (this repo's strict:false tsconfig does not narrow on negated truthiness here).
                if (moved.ok === false) report.errors!.push(`folder_assign_failed:${doc.canonicalUrl}:${moved.error}`);
              } else {
                report.errors!.push(`folder_assign_failed:${doc.canonicalUrl}:folder_resolve_failed`);
              }
            } catch (e) {
              // Never lets a foldering problem read as the ingest itself having failed — the
              // document above is already correctly written and retrievable regardless.
              report.errors!.push(`folder_assign_failed:${doc.canonicalUrl}:${String(e).slice(0, 160)}`);
            }
          }

          ctx.log(`sink/kb: ${doc.canonicalUrl} -> v${result.version} (${result.chunks} chunks)`);
        } catch (e) {
          // One bad document must not abort a crawl's whole flush; the rest of the batch still lands.
          report.errors!.push(`${doc.canonicalUrl}:${String(e).slice(0, 160)}`);
        }
      }
      return report;
    },

    // finalize (tombstoning pages that vanished from the site) is deliberately NOT implemented yet:
    // it needs "every canonical URL this tenant had before", which the knowledge base cannot answer
    // per source system today. Implementing it against an incomplete URL set would archive
    // hand-uploaded documents that no crawl was ever going to see. C2 owns it.
  };
}

registerSink(createKbSink());
