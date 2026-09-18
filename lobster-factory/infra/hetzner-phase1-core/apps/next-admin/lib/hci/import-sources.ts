// Bridges next-admin's cs_knowledge_sources (per-organization KB, lib/kb) into HCI-30's DISCOVERED
// admission pipeline (POST /api/hci/v1/seeds) -- the /ops/collect -> HCI-30 loop (operator:
// "資料蒐集器>>HCI 串連使用", 2026-09-18), a sibling of lib/cognitive-os/import-sources.ts's
// collect -> Cognitive OS bridge, built the same day against the same KB table.
//
// Deliberately NOT the same shape as the Cognitive OS bridge in one place: there is no
// "ensureProject" step, because HCI-30 has no project concept -- every accepted URL becomes one row
// in hci.sources under whichever single tenant HCI_IMPORT_TENANT names (lib/hci/client.ts). There is
// also no "send the extracted body" step: HCI-30's own isolated fetch-runner re-fetches the URL
// itself (ADR-0029's whole reason to exist -- every DISCOVERED candidate, regardless of who
// discovered it, goes through the SAME SSRF-hardened fetch path, so there is exactly one
// security-reviewed ingestion route rather than this bridge growing a second one that hands over
// already-extracted text and bypasses it). This bridge's only job is deciding WHICH already-collected
// URLs are worth asking HCI-30 to look at, then handing over the URL alone.
//
// Semantic scope note: cs_knowledge_sources has no "is this an organization's own site" flag (the
// collector's own RawDoc type deliberately does not infer content kind -- lib/collect/types.ts's own
// comment: "guessing... is a judgement about content, which belongs to the analysis side"). This
// bridge does not attempt that judgement either. HCI-30's own admission pipeline is built exactly for
// this: everything lands as DISCOVERED and a human reviews/rejects before it becomes anything else
// (ADR-011: "raw web result must never automatically become formal HCI Evidence"; app/server.mjs's
// own "🔎 探索來源" queue + reject button, already shipped). Sending a non-organization URL is not a
// data-integrity bug -- it is a low-quality DISCOVERED candidate a human rejects in five seconds,
// exactly like any other DISCOVERED row.

import { listKnowledgeSources, getSourceDetail, markSourceSentToHci, type SourceDetail } from "@/lib/kb";
import { createHciSeed, isHciConfigured } from "@/lib/hci/client";

export interface HciGateResult {
  eligible: boolean;
  issues: string[];
}

/**
 * Pure structural gate. Only two conditions: a URL to send, and not flagged sensitive.
 *
 * `isSensitive` is a hard gate for the identical reason lib/cognitive-os/import-sources.ts's own
 * evaluateSourceForImport excludes it (migration 0083's header: this exact flag was found to
 * silently do nothing for a different consumer of this same table) -- sending an operator-flagged
 * document into a THIRD external-facing system on one click, with no per-document classification
 * choice, would be the same failure in a new consumer.
 *
 * No title/author/DOI/body checks here (unlike the Cognitive OS gate): HCI-30 never receives this
 * row's extracted content at all, only its URL -- fields Cognitive OS needs to store as a Source are
 * simply not inputs to this call.
 */
export function evaluateSourceForHciImport(source: Pick<SourceDetail, "canonicalUrl" | "isSensitive">): HciGateResult {
  const issues: string[] = [];
  if (!source.canonicalUrl?.trim()) issues.push("MISSING_URL");
  if (source.isSensitive) issues.push("SENSITIVE_EXCLUDED");
  return { eligible: issues.length === 0, issues };
}

export interface RejectedHciSource {
  sourceId: string;
  title: string;
  issues: string[];
}

export interface HciImportSummary {
  organizationId: string;
  totalCandidates: number;
  imported: number;
  alreadyImported: number;
  rejected: RejectedHciSource[];
  errors: string[];
}

/**
 * List every non-archived source for `organizationId` with its full detail. Same pagination shape as
 * lib/cognitive-os/import-sources.ts's fetchAllSourceDetails -- a personal research corpus is not
 * expected to need more than a handful of pages.
 */
async function fetchAllSourceDetails(organizationId: string): Promise<SourceDetail[]> {
  const pageSize = 200;
  const details: SourceDetail[] = [];
  let page = 1;
  for (;;) {
    const { items, total } = await listKnowledgeSources(organizationId, { page, pageSize });
    for (const item of items) {
      const detail = await getSourceDetail(organizationId, item.id);
      if (detail) details.push(detail);
    }
    if (items.length === 0 || page * pageSize >= total) break;
    page += 1;
  }
  return details;
}

/**
 * Send one organization's eligible, not-yet-sent cs_knowledge_sources URLs to HCI-30 as DISCOVERED
 * candidates. A source already marked sent (hciSourceId set) is counted as `alreadyImported` and
 * skipped without calling HCI-30 again -- HCI-30's own upsert_discovered_source is idempotent by URL
 * (a re-send would not corrupt anything), but it WOULD re-trigger a full isolated-runner fetch and
 * append a redundant hci.source_snapshots row (ADR-0026: no record-level dedup) for zero benefit, so
 * skipping known-sent rows is a real waste avoidance, not just symmetry with the Cognitive OS bridge.
 */
export async function importOrganizationSourcesToHci(organizationId: string): Promise<HciImportSummary> {
  if (!isHciConfigured()) {
    return { organizationId, totalCandidates: 0, imported: 0, alreadyImported: 0, rejected: [], errors: ["hci_not_configured"] };
  }
  // No fail-fast reachability check beyond isHciConfigured() above (critic finding, 2026-09-18,
  // Minor): unlike the Cognitive OS sibling's ensureProject() up-front call, a genuinely unreachable
  // (but configured) HCI-30 fails independently per source rather than once. Accepted asymmetry, not
  // fixed: each failure is still correctly recorded in errors[] (see the "records a network/call-level
  // failure" test), and HCI-30 has no equivalent of a cheap "does the project exist" probe to reuse.

  const sources = await fetchAllSourceDetails(organizationId);
  const rejected: RejectedHciSource[] = [];
  const errors: string[] = [];
  let imported = 0;
  let alreadyImported = 0;

  for (const source of sources) {
    if (source.hciSourceId) {
      alreadyImported += 1;
      continue;
    }
    const gate = evaluateSourceForHciImport(source);
    if (!gate.eligible) {
      rejected.push({ sourceId: source.id, title: source.title, issues: gate.issues });
      continue;
    }

    const result = await createHciSeed(source.canonicalUrl as string); // gate guarantees non-empty
    if (result.ok === false) {
      errors.push(`${source.id}:${result.error}`);
      continue;
    }

    const outcome = result.value;
    if (outcome.outcome !== "written") {
      // A legitimate HCI-30 terminal state (content-isolation flag, fetch failure, poll timeout) --
      // not a call failure, but also not something that reached hci.sources, so there is nothing to
      // write back. Recorded under errors (not rejected): rejected is reserved for conditions known
      // BEFORE calling HCI-30; this is only known after.
      errors.push(`${source.id}:hci_${outcome.outcome}${outcome.error ? `:${outcome.error}` : ""}`);
      continue;
    }

    const wrote = await markSourceSentToHci(organizationId, source.id, outcome.sourceId);
    if (!wrote) errors.push(`write_back_failed:${source.id}`);
    imported += 1;
  }

  return { organizationId, totalCandidates: sources.length, imported, alreadyImported, rejected, errors };
}
