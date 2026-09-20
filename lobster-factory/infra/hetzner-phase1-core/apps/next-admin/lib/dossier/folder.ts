// Turn one knowledge FOLDER into one background file, and put the file back in the folder.
//
// WHY THIS LIVES IN lib/dossier AND NOT lib/collect: collection must be able to run with no
// knowledge base at all (ADR 011 — only a SINK may import lib/kb, enforced by
// collect/__tests__/collect-block-hygiene.test.ts). This module is the opposite direction: it READS
// the knowledge base after collection is over. Putting it under lib/collect broke that test within
// the hour, which is the test doing its job.
//
// The folder is the unit because that is what a dossier run already produces: sink/kb.ts files
// every document from one entity search under one folder named after the entity. Asking the
// operator to select documents by hand would be asking them to do the grouping the collector
// already did.
//
// WHAT IS DELIBERATELY NOT HERE: no fetching, no model call shaping, no markdown. This file reads
// the folder, calls lib/collect/dossier-report.ts, and writes the result through the ordinary
// ingest path — so the report is versioned, searchable, retrievable and labelled exactly like every
// other knowledge document, with no second storage path to keep in sync.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { folderDescendantIds, getFolder } from "@/lib/kb/folders";
import { ingestKnowledge, moveSourceToFolder } from "@/lib/kb";
import {
  generateDossierReport,
  renderReportMarkdown,
  type DossierReport,
  type DossierSource,
} from "@/lib/dossier/report";
import type { AiTextModel } from "@/lib/ai/text-model-options";

/**
 * Title of the generated file. Stable per folder so that regenerating supersedes the previous
 * report as a new VERSION rather than piling up "背景檔案 (2)", "背景檔案 (3)" — ingestKnowledge keys
 * a document family on kind+title when there is no canonical URL.
 */
export function reportTitleFor(folderName: string): string {
  return `${folderName} — 背景檔案`;
}

/** Marks the generated report so a later run never feeds it back to itself. */
export const REPORT_MARKER = "collect/dossier-report";

export type DossierFolderError =
  | "folder_not_found"
  | "no_sources"
  | "model_failed"
  | "ingest_failed"
  | "no_supabase_client";

export interface DossierFolderResult {
  ok: boolean;
  error?: DossierFolderError;
  detail?: string;
  sourceId?: string;
  sourcesUsed?: number;
  report?: DossierReport;
  markdown?: string;
}

/**
 * Read the folder's collected documents.
 *
 * Excludes anything this generator itself produced (metadata->>generator), because a report that
 * quotes last week's report is a citation loop: the claim keeps its [n] and loses its origin.
 * Excludes archived rows for the same reason retrieval does — an archived document is one somebody
 * decided should stop speaking.
 */
export async function readFolderSources(organizationId: string, folderId: string): Promise<DossierSource[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const folderIds = await folderDescendantIds(organizationId, folderId);
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select("id,title,canonical_url,body,metadata,author,published_at")
    .eq("organization_id", organizationId)
    .in("folder_id", folderIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (error || !data) return [];

  return data
    .filter((r) => (r.metadata as Record<string, unknown> | null)?.generator !== REPORT_MARKER)
    .map((r) => {
      const meta = (r.metadata as Record<string, unknown> | null) ?? {};
      return {
        id: r.id as string,
        title: (r.title as string) ?? "",
        url: (r.canonical_url as string | null) ?? null,
        body: (r.body as string | null) ?? "",
        angle: typeof meta.searchAngle === "string" ? meta.searchAngle : null,
        publishedAt: (r.published_at as string | null) ?? null,
        author: (r.author as string | null) ?? null,
        entityConfidence: typeof meta.entityConfidence === "string" ? meta.entityConfidence : null,
      };
    })
    .filter((s) => s.body.trim().length > 0);
}

/**
 * Generate the report for one folder and store it back into that folder.
 *
 * The entity name comes from the DOCUMENTS' own metadata rather than from the folder name: the
 * folder name carries a timestamp suffix (`Theo Farrell_202609200517`) and the entity is what the
 * documents were actually collected for.
 */
export async function buildFolderDossier(args: {
  organizationId: string;
  folderId: string;
  model?: AiTextModel;
  /** Dry run: generate and return, store nothing. */
  preview?: boolean;
}): Promise<DossierFolderResult> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, error: "no_supabase_client" };

  const folder = await getFolder(args.organizationId, args.folderId);
  if (!folder) return { ok: false, error: "folder_not_found" };

  const sources = await readFolderSources(args.organizationId, args.folderId);
  if (!sources.length) return { ok: false, error: "no_sources" };

  const { entityName, entityKind, anchors } = await entityOfFolder(args.organizationId, args.folderId, folder.name);

  const generated = await generateDossierReport({ entityName, entityKind, anchors, sources, model: args.model });
  if (generated.ok === false) return { ok: false, error: "model_failed", detail: generated.error, sourcesUsed: sources.length };

  const markdown = renderReportMarkdown(entityName, generated.report);
  if (args.preview) return { ok: true, sourcesUsed: sources.length, report: generated.report, markdown };

  const ingested = await ingestKnowledge({
    organizationId: args.organizationId,
    kind: "doc",
    title: reportTitleFor(folder.name),
    body: markdown,
    docType: "dossier_report",
    // AI_INFERENCE / AI_GENERATED, never SOURCE_QUOTATION: this document is a READING of the
    // sources, not one of them. A retrieval that cannot tell those apart will eventually quote the
    // summary back as if a source had said it.
    provenance: { epistemicType: "AI_INFERENCE", authorshipState: "AI_GENERATED", locked: null },
    metadata: {
      generator: REPORT_MARKER,
      entityName,
      entityKind,
      model: generated.report.model,
      sourceCount: sources.length,
      generatedAt: generated.report.generatedAt,
    },
  });
  if (!ingested.sourceId) return { ok: false, error: "ingest_failed", sourcesUsed: sources.length };

  // Filed into the same folder as the material it summarises. A report that lands unfiled is a
  // report nobody finds (the exact failure that put 159 documents in 未分類 on 2026-09-20).
  await moveSourceToFolder(args.organizationId, ingested.sourceId, args.folderId);

  return { ok: true, sourceId: ingested.sourceId, sourcesUsed: sources.length, report: generated.report, markdown };
}

/**
 * What entity this folder is about, taken from the documents rather than from the folder's name.
 *
 * Falls back to the folder name with its timestamp suffix stripped, so a folder created by hand
 * still produces a usable report instead of refusing.
 */
async function entityOfFolder(
  organizationId: string,
  folderId: string,
  folderName: string,
): Promise<{ entityName: string; entityKind: "person" | "company" | "event"; anchors: string[] }> {
  const sb = getSupabaseWriteClient();
  const fallbackName = folderName.replace(/_\d{8,14}$/, "").trim() || folderName;
  if (!sb) return { entityName: fallbackName, entityKind: "person", anchors: [] };

  const folderIds = await folderDescendantIds(organizationId, folderId);
  const { data } = await sb
    .from("cs_knowledge_sources")
    .select("metadata")
    .eq("organization_id", organizationId)
    .in("folder_id", folderIds)
    .not("metadata->>entityName", "is", null)
    .limit(1);

  const meta = (data?.[0]?.metadata as Record<string, unknown> | undefined) ?? {};
  const kind = meta.entityKind;
  return {
    entityName: typeof meta.entityName === "string" && meta.entityName.trim() ? meta.entityName : fallbackName,
    entityKind: kind === "company" || kind === "event" ? kind : "person",
    anchors: Array.isArray(meta.entityAnchorsHit) ? (meta.entityAnchorsHit as string[]) : [],
  };
}
