// "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, card SF-J): client + workspace + project + site + production
// environment in one call, all through records.ts. Idempotent on `siteId` (the page mints one per form): pressing the
// button twice, or retrying after a timeout, returns the same site and never a second one.
//
// Traps:
// - environments.metadata.host_slug is what gate-client.ts gateTargetOf reads as the site's code on the host
//   (container <slug>-wp, volume <slug>_wordpress_data). It is derived from the domain and written here, once.
// - Two sites must never share a host_slug (one container name): checked against every non-archived environment.
// - An existing client (same slug) is adopted and its metadata only added to (ensureOrganization); what was not
//   applied comes back in keptKeys.

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
  | "host_slug_taken";

export interface CreateSiteInput {
  /** Idempotency key, minted by the form. */
  siteId: string;
  clientName: string;
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
  const clientName = typeof b.clientName === "string" ? b.clientName.trim() : "";
  if (!clientName || clientName.length > 120) return { ok: false, error: "invalid_name" };
  const domain = typeof b.domain === "string" ? normalizeDomain(b.domain) : null;
  if (!domain || !hostSlugOf(domain)) return { ok: false, error: "invalid_domain" };
  if (!isLocale(b.locale)) return { ok: false, error: "invalid_locale" };
  if (!Array.isArray(b.packs) || !b.packs.every(isPack)) return { ok: false, error: "invalid_pack" };
  // The base pack is not optional (page-model PLUGIN_PACKS): always present, once, in catalog order.
  const packs = (["base", "ecommerce", "pod", "tourism", "brand"] as const).filter((p) => p === "base" || (b.packs as string[]).includes(p));
  return { ok: true, domain, input: { siteId: siteId.toLowerCase(), clientName, domain, locale: b.locale, packs } };
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

  // The siteId is the idempotency key: a known one must come back with the same domain, and is then a repeat (the
  // existing client is read again). An unknown one is a NEW site, so its client must be new too: a slug that already
  // exists is another client's and is never adopted (same rule as onboarding trigger-build, createOnly).
  const { data: known, error: knownErr } = await db.from("sites").select("id,primary_domain").eq("id", input.siteId).maybeSingle();
  if (knownErr) return fail("lookup_failed", knownErr.message);
  const isRepeat = !!known;
  if (known && (known as { primary_domain: string | null }).primary_domain !== domain) return fail("idempotency_key_reused");

  const org = await ensureOrganization(db, {
    createOnly: !isRepeat,
    slug: hostSlug,
    name: input.clientName,
    type: "client",
    status: "active",
    defaultLocale: input.locale,
    metadata: { source: "site_flow", client_config: { platform: "wordpress", site_url: `https://${domain}` } },
  });
  if ("error" in org) return fail(org.error, org.detail);

  const ws = await ensureWorkspace(db, { organizationId: org.value.id, name: `${input.clientName} - Default` });
  if ("error" in ws) return fail(ws.error, ws.detail);
  const proj = await ensureProject(db, { organizationId: org.value.id, workspaceId: ws.value.id, name: `${input.clientName} Website` });
  if ("error" in proj) return fail(proj.error, proj.detail);
  const site = await ensureSite(db, {
    organizationId: org.value.id,
    workspaceId: ws.value.id,
    projectId: proj.value.id,
    siteId: input.siteId,
    name: input.clientName,
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
  if ("error" in env) return fail(env.error, env.detail);

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
