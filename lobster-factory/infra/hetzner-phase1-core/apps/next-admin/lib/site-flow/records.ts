// Client-site records: organization -> workspace -> project -> site -> environment.
// The one write path for these rows (SITE-FLOW-COMPLETION-PLAN.md §1-4). Every ensure* is idempotent:
// a repeat call returns the existing row instead of inserting a second one.
//
// Traps for future readers:
// - ensureOrganization never changes an existing organization. Its metadata is only ADDED to: a key the row
//   already has keeps its value (nested objects recurse), and the keys that were not applied come back in
//   `keptKeys`. Editing a client's settings goes through its own endpoints, not through "create".
// - ensureEnvironment does not need the 0176 / 0179 partial unique indexes to be idempotent (select first); with them
//   applied, a concurrent insert's 23505 is read back as the existing row, or is `conflict` when the row that holds the
//   key is not this site's (0179: another site's live environment already uses the host_slug).
// - Every write of environments.metadata goes through updateEnvironmentCas (CAS on updated_at): ensureEnvironment and
//   the steps' patchEnvironmentMetadata both read-merge-write it, so a blind write would drop the other's keys.
// - Concurrent creates of the same thing converge on one row: ensureSite reads a 23505 back, ensureProject (no unique
//   key on projects) re-reads the oldest and returns it; the row it inserted and lost with stays, empty (never
//   deleted: sites.project_id is ON DELETE CASCADE, 0001_core.sql:121).
// - An environment's hosting_provider never changes in place: moving a site to another host is archive + new row.
// - environments.status is a CACHE of what the steps observed, never a source of truth (I1). Every write of it goes
//   through ENVIRONMENT_STATUS_TRANSITIONS: setEnvironmentStatus and ensureEnvironment refuse anything else.

import type { SupabaseClient } from "@supabase/supabase-js";

export const HOSTING_PROVIDERS = ["ks-aw-01-docker", "ks-aw-01-staging-subdir", "external-ssh"] as const;
export type HostingProvider = (typeof HOSTING_PROVIDERS)[number];
export const INGRESS_MODES = ["host-vhost", "product-gateway"] as const;
export type IngressMode = (typeof INGRESS_MODES)[number];
export const DEFAULT_INGRESS: IngressMode = "host-vhost";
const ENVIRONMENT_TYPES = ["local", "staging", "production", "preview"] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];
const ENVIRONMENT_STATUSES = ["pending", "provisioning", "ready", "failed", "archived"] as const;
export type EnvironmentStatus = (typeof ENVIRONMENT_STATUSES)[number];

export type RecordError =
  | "lookup_failed"
  | "create_failed"
  | "update_failed"
  | "invalid_input"
  | "slug_id_mismatch"
  | "slug_taken"
  | "site_not_found"
  | "site_scope_mismatch"
  | "invalid_hosting_provider"
  | "invalid_ingress"
  | "environment_provider_conflict"
  | "invalid_transition"
  | "environment_not_found"
  | "conflict";

export type RecordResult<T> = { ok: true; value: T } | { ok: false; error: RecordError; detail?: string };

type Db = SupabaseClient;
type Json = Record<string, unknown>;

const fail = <T>(error: RecordError, detail?: string): RecordResult<T> => ({ ok: false, error, detail });
const isUniqueViolation = (e: { code?: string } | null | undefined) => e?.code === "23505";
const isPlainObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Adds `incoming` keys that `existing` lacks; never replaces a value `existing` already has.
 * Returns the merged object and the dotted paths of incoming values that were not applied.
 */
export function mergeMetadataAddOnly(existing: Json, incoming: Json, prefix = ""): { merged: Json; kept: string[] } {
  const merged: Json = { ...existing };
  const kept: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (key === "__proto__") continue;
    if (!Object.prototype.hasOwnProperty.call(existing, key) || existing[key] === undefined) {
      merged[key] = value;
    } else if (isPlainObject(existing[key]) && isPlainObject(value)) {
      const inner = mergeMetadataAddOnly(existing[key] as Json, value, path);
      merged[key] = inner.merged;
      kept.push(...inner.kept);
    } else if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
      kept.push(path);
    }
  }
  return { merged, kept };
}

// ── organization ─────────────────────────────────────────────────────────────

export interface EnsureOrganizationInput {
  slug: string;
  name: string;
  type?: string;
  status?: string;
  defaultLocale?: string;
  metadata?: Json;
  /** Optional caller-chosen id for a NEW row; an existing row with another id is a slug_id_mismatch. */
  id?: string;
  /** A caller minting a new client: an existing slug is `slug_taken`, never adopted (it may be another client's) --
   *  unless the caller also passed `id` and the row has that id: then the row is this caller's own earlier or
   *  concurrent create of the same request (an idempotency key), and is returned. */
  createOnly?: boolean;
}

export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
  created: boolean;
  /** Incoming metadata paths not applied because the existing row already has a value there. */
  keptKeys: string[];
}

const ORG_COLS = "id,slug,name,type,status,created_at,metadata";

export async function ensureOrganization(db: Db, input: EnsureOrganizationInput): Promise<RecordResult<OrganizationRecord>> {
  const slug = input.slug?.trim();
  const name = input.name?.trim();
  if (!slug || !name) return fail("invalid_input", "slug and name required");
  const incoming = input.metadata ?? {};
  if (!isPlainObject(incoming)) return fail("invalid_input", "metadata must be an object");

  const fromExisting = async (): Promise<RecordResult<OrganizationRecord> | null> => {
    const { data, error } = await db.from("organizations").select(ORG_COLS).eq("slug", slug).maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return null;
    const row = data as Json & { id: string; metadata?: unknown };
    const sameId = !!input.id && input.id.toLowerCase() === String(row.id).toLowerCase();
    if (input.createOnly && !sameId) return fail("slug_taken", `slug ${slug} already exists`);
    if (input.id && !sameId) {
      return fail("slug_id_mismatch", `slug ${slug} belongs to organization ${row.id}`);
    }
    const current = isPlainObject(row.metadata) ? row.metadata : {};
    const { merged, kept } = mergeMetadataAddOnly(current, incoming);
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      const { error: upErr } = await db
        .from("organizations")
        .update({ metadata: merged, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) return fail("update_failed", upErr.message);
    }
    return { ok: true, value: toOrgRecord(row, false, kept) };
  };

  const existing = await fromExisting();
  if (existing) return existing;

  const insert: Json = {
    slug,
    name,
    type: input.type ?? "client",
    metadata: incoming,
    ...(input.status ? { status: input.status } : {}),
    ...(input.defaultLocale ? { default_locale: input.defaultLocale } : {}),
    ...(input.id ? { id: input.id } : {}),
  };
  const { data, error } = await db.from("organizations").insert(insert).select(ORG_COLS).single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await fromExisting();
      if (raced) return raced;
    }
    return fail("create_failed", error.message);
  }
  return { ok: true, value: toOrgRecord(data as Json, true, []) };
}

function toOrgRecord(row: Json, created: boolean, keptKeys: string[]): OrganizationRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    type: String(row.type),
    status: String(row.status),
    created_at: String(row.created_at),
    created,
    keptKeys,
  };
}

// ── workspace / project ──────────────────────────────────────────────────────

/** The organization's `default` workspace (unique (organization_id, slug), 0001_core.sql:26). */
export async function ensureWorkspace(db: Db, input: { organizationId: string; name: string }): Promise<RecordResult<{ id: string; created: boolean }>> {
  const find = async () =>
    db.from("workspaces").select("id").eq("organization_id", input.organizationId).eq("slug", "default").maybeSingle();
  const first = await find();
  if (first.error) return fail("lookup_failed", first.error.message);
  if (first.data) return { ok: true, value: { id: String((first.data as Json).id), created: false } };
  const { data, error } = await db
    .from("workspaces")
    .insert({ organization_id: input.organizationId, name: input.name, slug: "default", workspace_type: "default", status: "active" })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const again = await find();
      if (again.data) return { ok: true, value: { id: String((again.data as Json).id), created: false } };
    }
    return fail("create_failed", error.message);
  }
  return { ok: true, value: { id: String((data as Json).id), created: true } };
}

/**
 * The workspace's oldest wordpress project, or a new one. projects has no unique key to race on, so after an insert
 * the oldest is read again and returned, so concurrent creates put their sites under one project. The row this call
 * inserted and lost with is left empty, never deleted: sites.project_id is ON DELETE CASCADE (0001_core.sql:121) and
 * a third caller may already have put a site under it (created_at is the transaction start, not the commit order).
 */
export async function ensureProject(
  db: Db,
  input: { organizationId: string; workspaceId: string; name: string },
): Promise<RecordResult<{ id: string; created: boolean }>> {
  const oldest = () =>
    db
      .from("projects")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("workspace_id", input.workspaceId)
      .eq("project_type", "wordpress")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
  const { data: found, error: findErr } = await oldest();
  if (findErr) return fail("lookup_failed", findErr.message);
  if (found) return { ok: true, value: { id: String((found as Json).id), created: false } };
  const { data, error } = await db
    .from("projects")
    .insert({ organization_id: input.organizationId, workspace_id: input.workspaceId, name: input.name, project_type: "wordpress", status: "active" })
    .select("id")
    .single();
  if (error) return fail("create_failed", error.message);
  const mine = String((data as Json).id);
  const { data: first, error: againErr } = await oldest();
  if (againErr || !first || String((first as Json).id) === mine) return { ok: true, value: { id: mine, created: true } };
  // A concurrent create won: use theirs; ours stays (empty unless a third caller used it).
  return { ok: true, value: { id: String((first as Json).id), created: false } };
}

// ── site ─────────────────────────────────────────────────────────────────────

export interface EnsureSiteInput {
  organizationId: string;
  workspaceId: string;
  projectId: string;
  /** Caller-chosen id = idempotency key. Without it the project's oldest draft site is reused. */
  siteId?: string;
  name: string;
  primaryDomain?: string | null;
  locale?: string;
  themeFamily?: string;
  stackProfile?: string;
  siteType?: string;
}

export async function ensureSite(db: Db, input: EnsureSiteInput): Promise<RecordResult<{ id: string; created: boolean }>> {
  /** The row with the caller's siteId, scope-checked; null = none. */
  const byId = async (siteId: string): Promise<RecordResult<{ id: string; created: boolean }> | null> => {
    const { data, error } = await db
      .from("sites")
      .select("id,organization_id,workspace_id,project_id")
      .eq("id", siteId)
      .maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return null;
    const row = data as Json;
    const same = (a: unknown, b: string) => String(a).toLowerCase() === b.toLowerCase();
    if (!same(row.organization_id, input.organizationId) || !same(row.workspace_id, input.workspaceId) || !same(row.project_id, input.projectId)) {
      return fail("site_scope_mismatch", "siteId belongs to a different organization/workspace/project");
    }
    return { ok: true, value: { id: String(row.id), created: false } };
  };
  if (input.siteId) {
    const found = await byId(input.siteId);
    if (found) return found;
  } else {
    const { data, error } = await db
      .from("sites")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("project_id", input.projectId)
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (data) return { ok: true, value: { id: String((data as Json).id), created: false } };
  }
  const { data, error } = await db
    .from("sites")
    .insert({
      ...(input.siteId ? { id: input.siteId } : {}),
      organization_id: input.organizationId,
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      name: input.name,
      primary_domain: input.primaryDomain ?? null,
      status: "draft",
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.themeFamily ? { theme_family: input.themeFamily } : {}),
      ...(input.stackProfile ? { stack_profile: input.stackProfile } : {}),
      ...(input.siteType ? { site_type: input.siteType } : {}),
    })
    .select("id")
    .single();
  if (error) {
    // the same siteId inserted concurrently (primary key): that row is this request's twin
    if (isUniqueViolation(error) && input.siteId) {
      const raced = await byId(input.siteId);
      if (raced) return raced;
    }
    return fail("create_failed", error.message);
  }
  return { ok: true, value: { id: String((data as Json).id), created: true } };
}

// ── environment ──────────────────────────────────────────────────────────────

export interface EnsureEnvironmentInput {
  organizationId: string;
  siteId: string;
  environmentType: EnvironmentType;
  name: string;
  hostingProvider: string;
  baseUrl?: string;
  serverRef?: string;
  wpRootPath?: string;
  status?: EnvironmentStatus;
  /** `ingress` defaults to host-vhost on a new row; an existing row keeps its own unless one is passed. */
  metadata?: Json & { ingress?: string };
}

export async function ensureEnvironment(db: Db, input: EnsureEnvironmentInput): Promise<RecordResult<{ id: string; created: boolean }>> {
  if (!(HOSTING_PROVIDERS as readonly string[]).includes(input.hostingProvider)) {
    return fail("invalid_hosting_provider", `hosting_provider must be one of ${HOSTING_PROVIDERS.join(", ")}`);
  }
  const meta = input.metadata ?? {};
  if (!isPlainObject(meta)) return fail("invalid_input", "metadata must be an object");
  if (meta.ingress !== undefined && !(INGRESS_MODES as readonly unknown[]).includes(meta.ingress)) {
    return fail("invalid_ingress", `metadata.ingress must be one of ${INGRESS_MODES.join(", ")}`);
  }
  if (!(ENVIRONMENT_TYPES as readonly string[]).includes(input.environmentType)) {
    return fail("invalid_input", "environment_type");
  }
  if (input.status !== undefined && !(ENVIRONMENT_STATUSES as readonly string[]).includes(input.status)) {
    return fail("invalid_input", "status");
  }

  // The site decides the environment's organization and workspace: a caller cannot attach an environment
  // to another organization's site.
  const { data: site, error: siteErr } = await db
    .from("sites")
    .select("id,organization_id,workspace_id")
    .eq("id", input.siteId)
    .maybeSingle();
  if (siteErr) return fail("lookup_failed", siteErr.message);
  if (!site) return fail("site_not_found");
  const siteRow = site as Json;
  if (String(siteRow.organization_id).toLowerCase() !== input.organizationId.toLowerCase()) {
    return fail("site_scope_mismatch", "site belongs to a different organization");
  }

  const updateExisting = async (): Promise<RecordResult<{ id: string; created: boolean }> | null> => {
    const { data, error } = await db
      .from("environments")
      .select("id,hosting_provider,status,metadata")
      .eq("site_id", input.siteId)
      .eq("environment_type", input.environmentType)
      .neq("status", "archived")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return null;
    const id = String((data as Json).id);
    // Every check runs on the row as the CAS read it, so a concurrent move (status, provider, archive) is seen, never
    // overwritten; metadata is merged from that same read.
    const w = await updateEnvironmentCas(db, id, "hosting_provider,status,metadata", (row) => {
      if (row.status === "archived") return { ok: false, error: "invalid_transition", detail: "environment archived under the write" };
      if (row.hosting_provider && row.hosting_provider !== input.hostingProvider) {
        return { ok: false, error: "environment_provider_conflict", detail: `existing ${input.environmentType} environment is ${String(row.hosting_provider)}` };
      }
      if (input.status !== undefined && !canTransition(String(row.status), input.status)) {
        return { ok: false, error: "invalid_transition", detail: `${String(row.status)} -> ${input.status}` };
      }
      const patch: Json = {
        name: input.name,
        hosting_provider: input.hostingProvider,
        metadata: { ...(isPlainObject(row.metadata) ? row.metadata : {}), ...meta },
      };
      if (input.baseUrl !== undefined) patch.base_url = input.baseUrl;
      if (input.serverRef !== undefined) patch.server_ref = input.serverRef;
      if (input.wpRootPath !== undefined) patch.wp_root_path = input.wpRootPath;
      if (input.status !== undefined) patch.status = input.status;
      return { ok: true, patch };
    });
    if ("error" in w) return fail(w.error, w.detail);
    return { ok: true, value: { id, created: false } };
  };

  const existing = await updateExisting();
  if (existing) return existing;

  const { data, error } = await db
    .from("environments")
    .insert({
      organization_id: siteRow.organization_id,
      workspace_id: siteRow.workspace_id,
      site_id: input.siteId,
      environment_type: input.environmentType,
      name: input.name,
      hosting_provider: input.hostingProvider,
      base_url: input.baseUrl ?? null,
      server_ref: input.serverRef ?? null,
      wp_root_path: input.wpRootPath ?? null,
      ...(input.status ? { status: input.status } : {}),
      metadata: { ingress: DEFAULT_INGRESS, ...meta },
    })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await updateExisting();
      if (raced) return raced;
      // the key is held by a row that is not this site's live environment (0179: another site's host_slug)
      return fail("conflict", "unique key held by another row");
    }
    return fail("create_failed", error.message);
  }
  return { ok: true, value: { id: String((data as Json).id), created: true } };
}

/** An updated_at strictly later than `read` (every environments writer uses it), so the CAS in updateEnvironmentCas
 *  never takes a changed row for an unchanged one, even with two writes in one millisecond or a clock step back. */
function nextUpdatedAt(read: unknown): string {
  const t = Date.parse(String(read));
  return new Date(Math.max(Date.now(), Number.isFinite(t) ? t + 1 : 0)).toISOString();
}

/** patch null = nothing to write (the row already says it): updateEnvironmentCas returns ok without a write. */
export type EnvironmentChange = { ok: true; patch: Json | null } | { ok: false; error: RecordError; detail?: string };

/**
 * The one write path for environments.metadata (and the columns written with it): a read-merge-write with a CAS on
 * updated_at. `change` gets the row as just read (`columns` + updated_at) and returns the columns to write -- metadata
 * whole, merged from that read -- or a refusal. A row changed meanwhile is re-read and `change` asked again, at most
 * three times. updated_at is written strictly later than the value read, so two writes in one millisecond never look
 * like "unchanged" to a third.
 */
export async function updateEnvironmentCas(
  db: Db,
  environmentId: string,
  columns: string,
  change: (row: Json) => EnvironmentChange,
): Promise<RecordResult<null>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("environments").select(`${columns},updated_at`).eq("id", environmentId).maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return fail("environment_not_found", environmentId);
    const row = data as unknown as Json;
    const c = change(row);
    if ("error" in c) return fail(c.error, c.detail);
    if (c.patch === null) return { ok: true, value: null };
    const { data: moved, error: upErr } = await db
      .from("environments")
      .update({ ...c.patch, updated_at: nextUpdatedAt(row.updated_at) })
      .eq("id", environmentId)
      .eq("updated_at", row.updated_at)
      .select("id");
    // 23505 here = the merged metadata took a key another live row holds (0179 host_slug): the caller's `conflict`
    if (upErr) return isUniqueViolation(upErr) ? fail("conflict", "unique key held by another row") : fail("update_failed", upErr.message);
    if (Array.isArray(moved) && moved.length === 1) return { ok: true, value: null };
  }
  return fail("update_failed", "environment kept changing under the write");
}

/**
 * The status rule (SF-H item 3). Status = a cache of the last observation:
 *   pending      created, nothing built yet          -> provisioning, archived
 *   provisioning a step is building it               -> ready, failed, archived
 *   failed       the last build attempt failed       -> provisioning (a re-run), archived
 *   ready        built and observed working          -> provisioning (rebuilt by a re-run), archived
 *   archived     torn down                           -> nothing (never revived; a new site is a new row)
 * Writing the status a row already has is a no-op, not an error. failed -> ready goes through provisioning, so a row
 * can never read ready without a build having been observed after the failure.
 */
export const ENVIRONMENT_STATUS_TRANSITIONS: Readonly<Record<EnvironmentStatus, readonly EnvironmentStatus[]>> = {
  pending: ["provisioning", "archived"],
  provisioning: ["ready", "failed", "archived"],
  failed: ["provisioning", "archived"],
  ready: ["provisioning", "archived"],
  archived: [],
};

export function canTransition(from: string, to: EnvironmentStatus): boolean {
  if (from === to) return true;
  return (ENVIRONMENT_STATUS_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
}

/**
 * Moves an environment's status along ENVIRONMENT_STATUS_TRANSITIONS. A CAS on the status it read: a row that moved
 * meanwhile is re-read and checked again (at most twice), never overwritten blind. `invalid_transition` = refused.
 */
export async function setEnvironmentStatus(db: Db, environmentId: string, status: EnvironmentStatus): Promise<RecordResult<null>> {
  if (!(ENVIRONMENT_STATUSES as readonly string[]).includes(status)) return fail("invalid_input", "status");
  // through updateEnvironmentCas like every other environments write, so its updated_at CAS holds for all writers
  return updateEnvironmentCas(db, environmentId, "status", (row) => {
    const from = String(row.status);
    if (from === status) return { ok: true, patch: null };
    if (!canTransition(from, status)) return { ok: false, error: "invalid_transition", detail: `${from} -> ${status}` };
    return { ok: true, patch: { status } };
  });
}
