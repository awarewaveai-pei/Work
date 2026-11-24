// "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, cards SF-J / SF-J2): site + production environment, under a
// NEW client (organization + workspace + project made here) or an EXISTING one the operator picked by id, all through
// records.ts. Idempotent on `siteId` (the page mints one per form): pressing the button twice, at the same time, or
// retrying after a timeout, returns the same site and never a second one.
//
// Traps:
// - environments.metadata.host_slug is what gate-client.ts gateTargetOf reads as the site's code on the host
//   (container <slug>-wp, volume <slug>_wordpress_data). It is derived from the domain and written here, once.
// - Two sites must never share a host_slug (one container name): checked against every non-archived environment
//   first; with 0181 applied a concurrent create's insert also fails (records `conflict`) and is read as taken.
// - A new client's organization gets id = siteId, so a repeat or a concurrent twin of the same request finds ITS
//   organization (records createOnly + id) while any other client with the same slug is still `slug_taken`.
// - An existing client is never changed: no organization write at all; only a workspace/project is added when it has
//   none. A repeat is checked against the client the site already belongs to before anything is written.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureEnvironment,
  ensureOrganization,
  ensureProject,
  ensureSite,
  ensureWorkspace,
  type RecordError,
} from "./records";
import { hostSlugOf, isLocale, isPack, normalizeDomain, type Locale, type PackKey } from "./page-model";

export type CreateSiteError =
  | RecordError
  | "invalid_domain"
  | "invalid_name"
  | "invalid_locale"
  | "invalid_pack"
  | "idempotency_key_reused"
  | "invalid_site_id"
  | "invalid_client"
  | "client_not_found"
  | "client_inactive"
  | "host_slug_taken";

export interface CreateSiteInput {
  /** Idempotency key, minted by the form. */
  siteId: string;
  /** A new client's name; "" when `organizationId` is given. */
  clientName: string;
  /** An existing client (picked on the form): the site goes under it and the client is not changed. */
  organizationId?: string;
  domain: string;
  locale: Locale;
  packs: PackKey[];
}

export interface CreateSiteResult {
  organization: { id: string; slug: string; name: string; created: boolean };
  siteId: string;
  siteCreated: boolean;
  environmentId: string;
  hostSlug: string;
  keptKeys: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: CreateSiteError, detail?: string) => ({ ok: false as const, error, detail });

/** Narrows an untrusted request body into CreateSiteInput, or names the first bad field. */
export function parseCreateSiteBody(body: unknown): { ok: true; input: CreateSiteInput; domain: string } | { ok: false; error: CreateSiteError } {
  const b = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const siteId = typeof b.siteId === "string" ? b.siteId : "";
  if (!UUID_RE.test(siteId)) return { ok: false, error: "invalid_site_id" };
  // clientMode: "new" (default, the SF-J body) or "existing" + organizationId; never both a name and an id.
  const mode = b.clientMode ?? "new";
  if (mode !== "new" && mode !== "existing") return { ok: false, error: "invalid_client" };
  let clientName = "";
  let organizationId: string | undefined;
  if (mode === "existing") {
    organizationId = typeof b.organizationId === "string" ? b.organizationId : "";
    if (!UUID_RE.test(organizationId)) return { ok: false, error: "invalid_client" };
    organizationId = organizationId.toLowerCase();
  } else {
    clientName = typeof b.clientName === "string" ? b.clientName.trim() : "";
    if (!clientName || clientName.length > 120) return { ok: false, error: "invalid_name" };
  }
  const domain = typeof b.domain === "string" ? normalizeDomain(b.domain) : null;
  if (!domain || !hostSlugOf(domain)) return { ok: false, error: "invalid_domain" };
  if (!isLocale(b.locale)) return { ok: false, error: "invalid_locale" };
  if (!Array.isArray(b.packs) || !b.packs.every(isPack)) return { ok: false, error: "invalid_pack" };
  // The base pack is not optional (page-model PLUGIN_PACKS): always present, once, in catalog order.
  const packs = (["base", "ecommerce", "pod", "tourism", "brand"] as const).filter((p) => p === "base" || (b.packs as string[]).includes(p));
  return { ok: true, domain, input: { siteId: siteId.toLowerCase(), clientName, ...(organizationId ? { organizationId } : {}), domain, locale: b.locale, packs } };
}

export async function createSiteFlow(db: SupabaseClient, input: CreateSiteInput): Promise<{ ok: true; value: CreateSiteResult } | { ok: false; error: CreateSiteError; detail?: string }> {
  const domain = normalizeDomain(input.domain);
  const hostSlug = domain ? hostSlugOf(domain) : null;
  if (!domain || !hostSlug) return fail("invalid_domain");

  // One container name per site: another live environment holding this code is a hard stop.
  const { data: held, error: heldErr } = await db
    .from("environments")
    .select("id,site_id")
    .eq("metadata->>host_slug", hostSlug)
    .neq("status", "archived")
    .limit(5);
  if (heldErr) return fail("lookup_failed", heldErr.message);
  if (((held ?? []) as Array<{ site_id: string }>).some((r) => String(r.site_id).toLowerCase() !== input.siteId.toLowerCase())) {
    return fail("host_slug_taken", hostSlug);
  }

  // The siteId is the idempotency key: a known one must come back with the same domain and the same client choice, and
  // is then a repeat (nothing about the client is written again). An unknown one is a NEW site.
  const { data: known, error: knownErr } = await db.from("sites").select("id,primary_domain,organization_id").eq("id", input.siteId).maybeSingle();
  if (knownErr) return fail("lookup_failed", knownErr.message);
  const knownRow = known as { primary_domain: string | null; organization_id: string } | null;
  if (knownRow && knownRow.primary_domain !== domain) return fail("idempotency_key_reused");

  const org = await clientOf(db, input, domain, hostSlug, knownRow?.organization_id ?? null);
  if ("error" in org) return fail(org.error, org.detail);
  const label = input.organizationId ? org.value.name : input.clientName;

  const ws = await ensureWorkspace(db, { organizationId: org.value.id, name: `${label} - Default` });
  if ("error" in ws) return fail(ws.error, ws.detail);
  const proj = await ensureProject(db, { organizationId: org.value.id, workspaceId: ws.value.id, name: `${label} Website` });
  if ("error" in proj) return fail(proj.error, proj.detail);
  const site = await ensureSite(db, {
    organizationId: org.value.id,
    workspaceId: ws.value.id,
    projectId: proj.value.id,
    siteId: input.siteId,
    // an existing client's second site needs its own name: the domain
    name: input.organizationId ? domain : input.clientName,
    primaryDomain: domain,
    locale: input.locale === "zh-TW" ? "zh_TW" : "en",
    stackProfile: input.packs.includes("tourism") ? "wp-tourism" : input.packs.includes("ecommerce") ? "wc-core" : "wp-basic",
    themeFamily: input.packs.includes("tourism") ? "elementor" : "kadence",
  });
  if ("error" in site) return fail(site.error, site.detail);

  const env = await ensureEnvironment(db, {
    organizationId: org.value.id,
    siteId: site.value.id,
    environmentType: "production",
    name: "production",
    hostingProvider: "ks-aw-01-docker",
    baseUrl: `https://${domain}`,
    // A repeat of the same form must not push an environment the steps already moved on back to "pending".
    ...(site.value.created ? { status: "pending" as const } : {}),
    metadata: { host_slug: hostSlug, plugin_packs: input.packs, source: "site_flow" },
  });
  // conflict = 0181 refused the write: a concurrent create put this host_slug on another site's live environment. The
  // site row stays (environment-less draft): deleting it would cascade (environments, 0001_core.sql:138) into a twin
  // request's environment written meanwhile.
  if ("error" in env) return env.error === "conflict" ? fail("host_slug_taken", hostSlug) : fail(env.error, env.detail);

  return {
    ok: true,
    value: {
      organization: { id: org.value.id, slug: org.value.slug, name: org.value.name, created: org.value.created },
      siteId: site.value.id,
      siteCreated: site.value.created,
      environmentId: env.value.id,
      hostSlug,
      keptKeys: org.value.keptKeys,
    },
  };
}

type ClientOf = { ok: true; value: { id: string; slug: string; name: string; created: boolean; keptKeys: string[] } } | { ok: false; error: CreateSiteError; detail?: string };

/** The site's client, written only for a new client's first create. knownOrgId = the client a repeat's site already has. */
async function clientOf(db: SupabaseClient, input: CreateSiteInput, domain: string, hostSlug: string, knownOrgId: string | null): Promise<ClientOf> {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const readOrg = async (id: string): Promise<ClientOf> => {
    const { data, error } = await db.from("organizations").select("id,slug,name,status").eq("id", id).maybeSingle();
    if (error) return fail("lookup_failed", error.message);
    if (!data) return fail("client_not_found");
    const o = data as { id: string; slug: string; name: string | null; status?: string | null };
    // a site is never added under an inactive or suspended client (the picker's search does not filter them)
    if (o.status && o.status !== "active") return fail("client_inactive", o.status);
    return { ok: true, value: { id: String(o.id), slug: String(o.slug), name: o.name || String(o.slug), created: false, keptKeys: [] } };
  };

  if (input.organizationId) {
    // a repeat whose site is under another client was sent with a different choice: refuse before any write
    if (knownOrgId && !same(knownOrgId, input.organizationId)) return fail("idempotency_key_reused");
    return readOrg(input.organizationId);
  }
  if (knownOrgId) {
    const o = await readOrg(knownOrgId);
    // new-client mode: the repeat's client is the one this domain made (slug = host slug), never a picked client's
    if (o.ok && o.value.slug !== hostSlug) return fail("idempotency_key_reused");
    return o;
  }
  // A new client: createOnly refuses a slug that already exists (another client's: never adopted, same rule as
  // onboarding trigger-build) unless it is the row with id = siteId, i.e. this request's own earlier or twin create.
  const org = await ensureOrganization(db, {
    createOnly: true,
    id: input.siteId,
    slug: hostSlug,
    name: input.clientName,
    type: "client",
    status: "active",
    defaultLocale: input.locale,
    metadata: { source: "site_flow", client_config: { platform: "wordpress", site_url: `https://${domain}` } },
  });
  if ("error" in org) return fail(org.error, org.detail);
  return { ok: true, value: { id: org.value.id, slug: org.value.slug, name: org.value.name, created: org.value.created, keptKeys: org.value.keptKeys } };
}
