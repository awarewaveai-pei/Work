// The configured sources for a tenant: read, write, approve, withdraw.
//
// This is the approval surface ADR 013 requires. Two rules are enforced here rather than trusted:
//   * a row is validated against the CATALOGUE before it is written — an unknown block id or a
//     configuration that cannot collect anything is rejected while somebody is still looking at it;
//   * only `approved` rows are ever turned into crawl seeds. A `candidate` proposed by discovery is
//     data, not permission, and nothing in this file can promote one without an approver's name.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { catalogueEntry, validateSourceConfig } from "@/lib/collect/catalogue";
import type { SeedInput } from "@/lib/collect/orchestrator";

export type SourceStatus = "candidate" | "approved" | "disabled";

export interface CollectionSource {
  id: string;
  organizationId: string;
  blockId: string;
  entry: string;
  options: Record<string, unknown>;
  status: SourceStatus;
  label: string | null;
  proposedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface Row {
  id: string;
  organization_id: string;
  block_id: string;
  entry: string;
  options: Record<string, unknown> | null;
  status: SourceStatus;
  label: string | null;
  proposed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

function toSource(r: Row): CollectionSource {
  return {
    id: r.id,
    organizationId: r.organization_id,
    blockId: r.block_id,
    entry: r.entry,
    options: r.options ?? {},
    status: r.status,
    label: r.label,
    proposedBy: r.proposed_by,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    lastRunAt: r.last_run_at,
    lastStatus: r.last_status,
    lastError: r.last_error,
  };
}

export async function listSources(organizationId: string): Promise<CollectionSource[]> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("collection_sources")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(toSource);
}

export interface AddSourceInput {
  organizationId: string;
  blockId: string;
  entry: string;
  options?: Record<string, unknown>;
  label?: string;
  /** Present ⇒ this came from discovery and lands as a candidate, never as an approved source. */
  proposedBy?: string;
  /** Present ⇒ a human is adding it directly, which is itself the approval. */
  approvedBy?: string;
}

export interface WriteResult {
  ok: boolean;
  source?: CollectionSource;
  errors: string[];
}

export async function addSource(input: AddSourceInput): Promise<WriteResult> {
  const entry = catalogueEntry(input.blockId);
  if (!entry) return { ok: false, errors: [`unknown_source:${input.blockId}`] };

  const validation = validateSourceConfig(input.blockId, { entry: input.entry, options: input.options });
  // A source proposed by discovery is allowed to be unavailable right now (its key may arrive
  // later); one a human is switching on is not, because it would silently collect nothing.
  const errors = input.proposedBy ? validation.errors.filter((e) => !e.startsWith("unavailable:")) : validation.errors;
  if (errors.length) return { ok: false, errors };

  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, errors: ["no_supabase_client"] };

  const status: SourceStatus = input.proposedBy ? "candidate" : "approved";
  const { data, error } = await sb
    .from("collection_sources")
    .upsert(
      {
        organization_id: input.organizationId,
        block_id: input.blockId,
        entry: input.entry.trim(),
        options: input.options ?? {},
        label: input.label ?? null,
        status,
        proposed_by: input.proposedBy ?? null,
        approved_by: input.approvedBy ?? null,
        approved_at: input.approvedBy ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,block_id,entry" },
    )
    .select("*")
    .single();

  if (error || !data) return { ok: false, errors: [`write_failed:${error?.message ?? "no_row"}`] };
  return { ok: true, source: toSource(data as Row), errors: [] };
}

/**
 * Approve a candidate. The approver's name is required — an approval with nobody attached is the
 * same as no approval, and this is the record that answers "who decided this could speak for us?".
 */
export async function approveSource(organizationId: string, id: string, approvedBy: string): Promise<WriteResult> {
  if (!approvedBy.trim()) return { ok: false, errors: ["approver_required"] };
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, errors: ["no_supabase_client"] };

  const { data, error } = await sb
    .from("collection_sources")
    .update({ status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, errors: [`approve_failed:${error?.message ?? "not_found"}`] };
  return { ok: true, source: toSource(data as Row), errors: [] };
}

/**
 * Withdraw a source. The row is KEPT, in `disabled`: the question "what did this source put in our
 * knowledge base?" is answerable only while the source still exists to be asked about.
 */
export async function disableSource(organizationId: string, id: string): Promise<WriteResult> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { ok: false, errors: ["no_supabase_client"] };
  const { data, error } = await sb
    .from("collection_sources")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, errors: [`disable_failed:${error?.message ?? "not_found"}`] };
  return { ok: true, source: toSource(data as Row), errors: [] };
}

export async function recordRunOutcome(
  id: string,
  outcome: { status: string; error?: string | null },
): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return;
  await sb
    .from("collection_sources")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: outcome.status.slice(0, 100),
      last_error: outcome.error ? outcome.error.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * Turn one configured source into a crawl seed.
 *
 * The entry shape decides the URI scheme, which is what routes it to the right block — a query
 * becomes `academic://…`, a path becomes a file URL, a URL stays itself. Options ride along in
 * `meta`, where each block reads its own.
 */
export function sourceToSeed(source: CollectionSource): SeedInput | null {
  const entry = catalogueEntry(source.blockId);
  if (!entry) return null;

  const meta = { ...source.options, sourceId: source.id };

  if (entry.entry === "query") {
    // The scheme comes from the block, not from here. It used to be the literal string "academic",
    // which made this function something you had to remember to edit every time a query source was
    // added — and forgetting it would not fail, it would hand the query to the academic collector.
    return { uri: `${entry.queryScheme ?? "academic"}://${encodeURIComponent(source.entry)}`, hint: source.blockId, meta };
  }
  if (entry.entry === "path") {
    // A path is turned into a file URL by the block's own helper rules; hand-built file:// strings
    // break on Windows drive letters (that bug has already been paid for once).
    const url = source.entry.startsWith("file:") ? source.entry : `file:///${source.entry.replace(/\\/g, "/").replace(/^\/+/, "")}`;
    return { uri: url, hint: source.blockId, meta };
  }

  let scope: SeedInput["scope"];
  try {
    const u = new URL(source.entry);
    const prefix = typeof source.options.pathPrefix === "string" ? source.options.pathPrefix : undefined;
    scope = { hosts: [u.hostname], pathPrefix: prefix };
  } catch {
    return null;
  }
  // `hint` carries the block id so a source configured as an API endpoint is read as one, rather
  // than being extracted as a web page because its URL happens to look ordinary.
  return { uri: source.entry, scope, hint: source.blockId === "collect/http-api" ? "http-api" : undefined, meta };
}

/** The seeds for everything this tenant has approved. Candidates are excluded, by definition. */
export async function approvedSeeds(organizationId: string): Promise<Array<{ source: CollectionSource; seed: SeedInput }>> {
  const sources = await listSources(organizationId);
  return sources
    .filter((s) => s.status === "approved")
    .map((source) => ({ source, seed: sourceToSeed(source) }))
    .filter((p): p is { source: CollectionSource; seed: SeedInput } => p.seed !== null);
}
