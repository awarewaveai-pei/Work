// Client-site records: organization -> workspace -> project -> site -> environment.
// The one write path for these rows (SITE-FLOW-COMPLETION-PLAN.md §1-4). Every ensure* is idempotent:
// a repeat call returns the existing row instead of inserting a second one.
//
// Traps for future readers:
// - ensureOrganization never changes an existing organization. Its metadata is only ADDED to: a key the row
//   already has keeps its value (nested objects recurse), and the keys that were not applied come back in
//   `keptKeys`. Editing a client's settings goes through its own endpoints, not through "create".
// - ensureEnvironment does not need the 0176 partial unique index to be idempotent (select first); with the
//   index applied, a concurrent insert's 23505 is read back as the existing row.
// - An environment's hosting_provider never changes in place: moving a site to another host is archive + new row.

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
  | "environment_provider_conflict";

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
  /** A caller minting a new client: an existing slug is `slug_taken`, never adopted (it may be another client's). */
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
    if (input.createOnly) return fail("slug_taken", `slug ${slug} already exists`);
    if (input.id && input.id.toLowerCase() !== String(row.id).toLowerCase()) {
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

/** The workspace's oldest wordpress project, or a new one. */
export async function ensureProject(
  db: Db,
  input: { organizationId: string; workspaceId: string; name: string },
): Promise<RecordResult<{ id: string; created: boolean }>> {
  const { data: found, error: findErr } = await db
    .from("projects")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("workspace_id", input.workspaceId)
    .eq("project_type", "wordpress")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) return fail("lookup_failed", findErr.message);
  if (found) return { ok: true, value: { id: String((found as Json).id), created: false } };
  const { data, error } = await db
    .from("projects")
    .insert({ organization_id: input.organizationId, workspace_id: input.workspaceId, name: input.name, project_type: "wordpress", status: "active" })
    .select("id")
    .single();
  if (error) return fail("create_failed", error.message);
  return { ok: true, value: { id: String((data as Json).id), created: true } };
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
  if (input.siteId) {
    const { data, error } = await db
      .from("sites")
      .select("id,organization_id,workspace_id,project_id")
      .eq("id", input.siteId)
      .maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (data) {
      const row = data as Json;
      const same = (a: unknown, b: string) => String(a).toLowerCase() === b.toLowerCase();
      if (!same(row.organization_id, input.organizationId) || !same(row.workspace_id, input.workspaceId) || !same(row.project_id, input.projectId)) {
        return fail("site_scope_mismatch", "siteId belongs to a different organization/workspace/project");
      }
      return { ok: true, value: { id: String(row.id), created: false } };
    }
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
  if (error) return fail("create_failed", error.message);
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
      .select("id,hosting_provider,metadata")
      .eq("site_id", input.siteId)
      .eq("environment_type", input.environmentType)
      .neq("status", "archived")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return null;
    const row = data as Json;
    if (row.hosting_provider && row.hosting_provider !== input.hostingProvider) {
      return fail("environment_provider_conflict", `existing ${input.environmentType} environment is ${String(row.hosting_provider)}`);
    }
    const patch: Json = {
      name: input.name,
      hosting_provider: input.hostingProvider,
      metadata: { ...(isPlainObject(row.metadata) ? row.metadata : {}), ...meta },
      updated_at: new Date().toISOString(),
    };
    if (input.baseUrl !== undefined) patch.base_url = input.baseUrl;
    if (input.serverRef !== undefined) patch.server_ref = input.serverRef;
    if (input.wpRootPath !== undefined) patch.wp_root_path = input.wpRootPath;
    if (input.status !== undefined) patch.status = input.status;
    const { error: upErr } = await db.from("environments").update(patch).eq("id", row.id);
    if (upErr) return fail("update_failed", upErr.message);
    return { ok: true, value: { id: String(row.id), created: false } };
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
    }
    return fail("create_failed", error.message);
  }
  return { ok: true, value: { id: String((data as Json).id), created: true } };
}

/** Moves an environment out of `provisioning` only: an archived (or already finished) row is never revived. */
export async function setEnvironmentStatus(db: Db, environmentId: string, status: EnvironmentStatus): Promise<RecordResult<null>> {
  const { error } = await db
    .from("environments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", environmentId)
    .eq("status", "provisioning");
  if (error) return fail("update_failed", error.message);
  return { ok: true, value: null };
}
