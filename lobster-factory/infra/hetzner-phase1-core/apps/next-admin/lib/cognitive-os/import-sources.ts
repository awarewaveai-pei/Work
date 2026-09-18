// Bridges next-admin's cs_knowledge_sources (per-organization KB, lib/kb) into a Cognitive OS
// Project's Source Import (ai_lego/apps/api/main.py POST /projects/{id}/sources) -- the first hop
// of the /ops/collect -> Cognitive OS -> Knowledge pipeline.
//
// Import-time gate below is the operator's own architecture decision: a record must clear
// title/authors/DOI-format/publish-year checks BEFORE it is sent to Cognitive OS, not after.
// Reference-only logic lineage: the STRUCTURAL_ONLY half of the retired
// research.citation_verification method (see `git show 82556b4c0:Projects/internal/
// cognitive-engineering-os/ai_lego/modules/research/citation_verification.py`) used the same DOI
// regex and year bounds. This is an independent TypeScript rewrite of that logic against a
// different input shape (cs_knowledge_sources' single `author` string, not a literature_search
// items[] list) -- it does NOT restore that Python method, which stays retired.

import { getSourceDetail, listKnowledgeSources, markSourceSentToCognitiveOs, type SourceDetail } from "@/lib/kb";
import {
  createCognitiveOsProject,
  createCognitiveOsSource,
  listCognitiveOsProjects,
  listCognitiveOsSources,
} from "@/lib/cognitive-os/client";

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const MIN_YEAR = 1400;
const MAX_YEAR = 2100;
// Title_Case vocabulary: ai_lego.core.domain._intake_validation.DATA_CLASSIFICATIONS
// ({"Public","Internal","Confidential","Restricted"}) -- a DIFFERENT vocabulary from the KB's own
// PUBLIC/INTERNAL/... used elsewhere in this app. "Internal" is the safe default for what actually
// reaches this constant: evaluateSourceForImport excludes every is_sensitive=true row before this
// point (SENSITIVE_EXCLUDED, below), so nothing needing Confidential/Restricted is ever classified
// here in the first place -- this is not a claim that no such content exists in cs_knowledge_sources.
const DATA_CLASSIFICATION = "Internal";
// ai_lego.core.domain.source.TEXT_MEDIA_TYPES Phase 1 accepts UTF-8 text only. cs_knowledge_sources
// bodies are always extraction output (lib/collect sinks store raw extracted text), never markdown
// or JSON, so this is a constant, not a per-source guess.
const TEXT_MEDIA_TYPE = "text/plain";
const PROJECT_PURPOSE = "next-admin cs_knowledge_sources import bridge";

export interface SourceGateResult {
  eligible: boolean;
  authors: string[];
  issues: string[];
}

/**
 * Parse the KB's single comma-joined `author` string into individual names. There is no separate
 * authors[] column in cs_knowledge_sources (migration 0075 added one `author text`) -- every
 * collector that produces multiple names writes them pre-joined
 * (lib/collect/collectors/academic.ts: `author: paper.authors.join(", ") || null`), so splitting on
 * "," is the exact inverse of how the column was populated, not a guess.
 */
export function parseAuthors(author: string | null): string[] {
  if (!author) return [];
  return author
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Pure structural gate. Title and authors are required (operator: "非空"); DOI format and
 * publish-year plausibility are validated only when present, since neither `doi` nor
 * `published_at` is NOT NULL in cs_knowledge_sources and most collected sources legitimately lack
 * one or both (operator's own wording used "格式"/"年份合理" for these two, not "非空").
 *
 * `body` (-> Cognitive OS `content`) is ALSO required here even though the operator's brief didn't
 * list it explicitly: POST .../sources hard-rejects empty content with SOURCE_SIZE_BYTES_INVALID
 * (ai_lego/core/domain/source.py L47-48, `size_bytes <= 0`), and cs_knowledge_sources has no
 * separate summary/excerpt column to fall back to -- verified against migrations
 * 0051/0072/0084_kb_source_body.sql and lib/kb/db.ts's own SourceDetail projection, both of which
 * expose `body` as the only content field. An empty body is reported as a gate failure
 * (MISSING_BODY) instead of being silently sent to an endpoint that would just reject it.
 *
 * `isSensitive` is also a hard gate (critic finding, 2026-09-18): migration 0083's own header
 * documents that this exact flag was found to silently do nothing for a DIFFERENT consumer of this
 * same table (the customer-service AI) -- a document an operator marked 敏感 stayed fully retrievable
 * regardless of the checkbox. Reproducing that same failure here (bulk-exporting a flagged-sensitive
 * document into a separate system with a blanket "Internal" classification, on one click, with no
 * warning) would be the identical bug in a new consumer. Cognitive OS's own DATA_CLASSIFICATION
 * vocabulary has "Confidential"/"Restricted" tiers for exactly this case, but this bridge has no
 * operator-facing UI yet to choose between them per document -- excluding sensitive rows entirely
 * (SENSITIVE_EXCLUDED) is the correct default until that UI exists, not a permanent policy.
 */
export function evaluateSourceForImport(
  source: Pick<SourceDetail, "title" | "author" | "doi" | "publishedAt" | "body" | "isSensitive">,
): SourceGateResult {
  const issues: string[] = [];
  if (!source.title?.trim()) issues.push("MISSING_TITLE");

  const authors = parseAuthors(source.author);
  if (authors.length === 0) issues.push("MISSING_AUTHORS");

  const doi = source.doi?.trim();
  if (doi && !DOI_PATTERN.test(doi)) issues.push("DOI_FORMAT_INVALID");

  const publishedAt = source.publishedAt?.trim();
  if (publishedAt) {
    const year = new Date(publishedAt).getFullYear();
    if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) issues.push("PUBLISHED_AT_YEAR_IMPLAUSIBLE");
  }

  if (!source.body?.trim()) issues.push("MISSING_BODY");
  if (source.isSensitive) issues.push("SENSITIVE_EXCLUDED");

  return { eligible: issues.length === 0, authors, issues };
}

export interface RejectedSource {
  sourceId: string;
  title: string;
  issues: string[];
}

export interface ImportSummary {
  organizationId: string;
  projectId: string;
  totalCandidates: number;
  imported: number;
  alreadyImported: number;
  rejected: RejectedSource[];
  errors: string[];
}

async function ensureProject(projectName: string): Promise<{ projectId: string } | { error: string }> {
  const existing = await listCognitiveOsProjects();
  // `=== false`, never `!x.ok`: see the matching comment in lib/cognitive-os/client.ts
  // (this repo's strict:false tsconfig does not narrow a discriminated union on negated truthiness).
  if (existing.ok === false) return { error: existing.error };
  const found = existing.value.find((p) => p.name === projectName);
  if (found) return { projectId: found.project_id };
  const created = await createCognitiveOsProject({
    name: projectName,
    purpose: PROJECT_PURPOSE,
    data_classification: DATA_CLASSIFICATION,
  });
  if (created.ok === false) return { error: created.error };
  return { projectId: created.value.project_id };
}

/**
 * List every non-archived source for `organizationId` with its full body/citation fields.
 * `listKnowledgeSources` only returns list-view columns (lib/kb/db.ts) -- `getSourceDetail` fills
 * in body/author/doi/venue/publishedAt per id. Pages through in 200-row batches; a personal
 * research corpus is not expected to need more than a handful of pages, so this stays a plain
 * sequential loop rather than a concurrent fan-out.
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
 * Import one organization's eligible cs_knowledge_sources into its Cognitive OS Project, creating
 * the Project on first run and reusing it (by exact name match) on every later run. Sources already
 * present in the target Project (matched by title) are counted as `alreadyImported` and skipped --
 * Cognitive OS's Source table has no uniqueness constraint on title, so re-running this without a
 * dedup check would create a duplicate row per re-run.
 */
export async function importOrganizationSources(
  organizationId: string,
  opts?: { projectName?: string },
): Promise<ImportSummary> {
  const projectName = opts?.projectName?.trim() || `Knowledge Import: ${organizationId}`;
  const project = await ensureProject(projectName);
  if ("error" in project) {
    return { organizationId, projectId: "", totalCandidates: 0, imported: 0, alreadyImported: 0, rejected: [], errors: [`ensure_project_failed:${project.error}`] };
  }

  const existingSources = await listCognitiveOsSources(project.projectId);
  if (existingSources.ok === false) {
    return { organizationId, projectId: project.projectId, totalCandidates: 0, imported: 0, alreadyImported: 0, rejected: [], errors: [`list_existing_sources_failed:${existingSources.error}`] };
  }
  const existingTitles = new Set(existingSources.value.map((s) => s.title));

  const sources = await fetchAllSourceDetails(organizationId);
  const rejected: RejectedSource[] = [];
  const errors: string[] = [];
  let imported = 0;
  let alreadyImported = 0;

  for (const source of sources) {
    if (existingTitles.has(source.title)) {
      // Self-heals a next-admin-side write-back this row missed (source imported before migration
      // 0087 existed, or a prior run's write-back failed) -- but only when it's actually missing or
      // stale (critic finding, 2026-09-18): without this comparison every already-imported source
      // got an unconditional UPDATE on every single click, forever, scaling with total KB size for
      // zero benefit in the overwhelming common case where the write-back already landed correctly.
      if (source.cognitiveOsProjectId !== project.projectId) {
        const wrote = await markSourceSentToCognitiveOs(organizationId, source.id, project.projectId);
        if (!wrote) errors.push(`write_back_failed:${source.id}`);
      }
      alreadyImported += 1;
      continue;
    }
    const gate = evaluateSourceForImport(source);
    if (!gate.eligible) {
      rejected.push({ sourceId: source.id, title: source.title, issues: gate.issues });
      continue;
    }
    const result = await createCognitiveOsSource(project.projectId, {
      title: source.title,
      media_type: TEXT_MEDIA_TYPE,
      data_classification: DATA_CLASSIFICATION,
      content: source.body as string, // gate guarantees non-empty
      doi: source.doi,
      authors: gate.authors,
      venue: source.venue,
      published_at: source.publishedAt,
    });
    if (result.ok === false) {
      errors.push(`${source.id}:${result.error}`);
      continue;
    }
    // The Cognitive OS create already succeeded at this point -- a failed write-back is this app's
    // own bookkeeping falling behind reality, not an import failure, so it's a soft warning
    // (surfaced in the UI's error list) rather than un-counting an import that genuinely happened.
    const wrote = await markSourceSentToCognitiveOs(organizationId, source.id, project.projectId);
    if (!wrote) errors.push(`write_back_failed:${source.id}`);
    imported += 1;
  }

  return { organizationId, projectId: project.projectId, totalCandidates: sources.length, imported, alreadyImported, rejected, errors };
}
