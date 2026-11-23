/**
 * WordPress / Woo adapter — Ed25519-signed writes to a WordPress site running
 * the AwareWave WP Bridge plugin (packages/wp-bridge-plugin).
 *
 * Wire protocol (RestController.php): headers X-AWBridge-Key-Id / -Timestamp /
 * -Nonce / -Signature; signature = Ed25519 over
 *   METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256hex(rawBody)
 * where PATH is the REST route (e.g. /aware-wave-bridge/v1/product) even when
 * the request travels as ?rest_route=<path>.
 *
 * Env (server-only, never NEXT_PUBLIC):
 *   WPBRIDGE_BASE_URL    e.g. https://soulfulexpression.org   (the DEFAULT client, id="")
 *   WPBRIDGE_KEY_ID      e.g. SE-01
 *   WPBRIDGE_PRIVATE_KEY base64 Ed25519 secret (64-byte libsodium or 32-byte seed)
 *   WPBRIDGE_NAME        optional display label for the default client
 *
 * MULTI-CLIENT (one POD operator, several clients' WooCommerce sites): mirror the numbered
 * convention used by the content pipeline (lib/content/wp-sites.ts `WP_SITE_<i>_*`). Each extra
 * client i (1..10) is its OWN bridge install with its OWN Ed25519 key:
 *   WPBRIDGE_SITE_<i>_BASE_URL / _KEY_ID / _PRIVATE_KEY / _NAME
 * Private keys live in env or in Supabase Vault (never a table column) — they are signing secrets. A publish call
 * carries an optional `clientId` ("" = default, "1".."10" = that site, "env:<environments.id>" = a site the
 * site flow registered, see "sites registered by the site flow" below); absent → default → fully backward
 * compatible with the original single-site behaviour.
 */
import { createHash, createPrivateKey, randomUUID, sign as edSign, type KeyObject } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSecret } from "@/lib/secret-vault";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { BLOCKED_CHANGE_CODE } from "@/lib/system-modes/blocked-change";

const REST_NAMESPACE = "/aware-wave-bridge/v1";
// RFC 8410 PKCS#8 prefix for an Ed25519 private key; append the 32-byte seed.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** `blockedMode` is set only when the system-mode gate blocks the write (never from plugin output):
 *  callers answer the shared 423 (lib/system-modes/blocked-change.ts), not a 502 bridge failure. */
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string; blockedMode?: string };

type WriteClient = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;

/**
 * One WordPress install = its origin + path (lower case, no trailing slash): a staging install under a path of the same
 * host (https://aware-wave.com/staging/<slug>) is another site with another owner, so the host alone cannot name it.
 */
export function wpSiteKey(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The bridge site's owning org = the org of the active wp_sites row for the same install (wpSiteKey) -- the source
 * wordpress-core gates on too. No row -> null (global mode only). Unreadable, or rows for that install naming
 * different orgs -> undefined: the org cannot be told, so the caller blocks.
 */
export async function bridgeSiteOrg(db: WriteClient, baseUrl: string): Promise<string | null | undefined> {
  const rows = await activeWpSiteRows(db);
  return rows ? orgOfInstall(rows, baseUrl) : undefined;
}

type WpSiteOwnerRow = { url: string; organization_id: string | null };

/** Active wp_sites rows (url, owner); null when unreadable. */
async function activeWpSiteRows(db: WriteClient): Promise<WpSiteOwnerRow[] | null> {
  const { data, error } = await db.from("wp_sites").select("url, organization_id").eq("active", true);
  if (error) {
    console.error("[wp-bridge] wp_sites lookup failed; bridge write blocked:", error.message);
    return null;
  }
  return (data ?? []) as WpSiteOwnerRow[];
}

/** bridgeSiteOrg's rule over rows already read (one read for many sites). */
function orgOfInstall(rows: WpSiteOwnerRow[], baseUrl: string): string | null | undefined {
  const site = wpSiteKey(baseUrl);
  if (!site) return undefined;
  const orgs = new Set(rows.filter((r) => wpSiteKey(r.url) === site).map((r) => r.organization_id ?? null));
  if (orgs.size > 1) return undefined;
  if (orgs.size === 1) return [...orgs][0];
  // No row for this install, but rows on its host (spelled http://, or another install under a path): the owner
  // cannot be told -- block rather than fall back to the global gate (critic 2026-11-04).
  const host = new URL(site).hostname;
  return rows.some((r) => { const k = wpSiteKey(r.url); return !!k && new URL(k).hostname === host; }) ? undefined : null;
}

/** A configured bridge client the publish UI can target. `id` = "" for default, "1".."10" for extras. */
export interface BridgeClient {
  id: string;
  name: string;
  baseUrl: string;
}

/** Resolve the raw env triplet + label for a client id. "1".."10" → namespaced; else → default. */
function rawBridgeEnv(clientId?: string): { baseUrl?: string; keyId?: string; secretB64?: string; name?: string } {
  const n = typeof clientId === "string" && /^([1-9]|10)$/.test(clientId) ? clientId : null;
  if (n) {
    return {
      baseUrl: process.env[`WPBRIDGE_SITE_${n}_BASE_URL`],
      keyId: process.env[`WPBRIDGE_SITE_${n}_KEY_ID`],
      secretB64: process.env[`WPBRIDGE_SITE_${n}_PRIVATE_KEY`],
      name: process.env[`WPBRIDGE_SITE_${n}_NAME`],
    };
  }
  return {
    baseUrl: process.env.WPBRIDGE_BASE_URL,
    keyId: process.env.WPBRIDGE_KEY_ID,
    secretB64: process.env.WPBRIDGE_PRIVATE_KEY,
    name: process.env.WPBRIDGE_NAME,
  };
}

function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

type BridgeConfig = { baseUrl: string; keyId: string; key: KeyObject };

/** base64 Ed25519 secret (64-byte libsodium or 32-byte seed) -> a signing key; anything else -> null. */
function signingKeyOf(secretB64: string): KeyObject | null {
  try {
    const raw = Buffer.from(secretB64.trim(), "base64");
    // libsodium "secret key" = seed(32) + public(32); Node wants just the seed.
    // Accept ONLY the two unambiguous encodings — anything else is a corrupt key.
    if (raw.length !== 64 && raw.length !== 32) return null;
    const seed = raw.subarray(0, 32);
    return createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    return null;
  }
}

function getConfig(clientId?: string): BridgeConfig | null {
  const { baseUrl, keyId, secretB64 } = rawBridgeEnv(clientId);
  if (!baseUrl || !keyId || !secretB64) return null;
  const key = signingKeyOf(secretB64);
  return key ? { baseUrl: baseUrl.replace(/\/+$/, ""), keyId, key } : null;
}

// ── sites registered by the site flow (card SF-I) ──────────────────────────────────────────────────────────────────
// A site built by /ops/sites carries its bridge key in environments.metadata.bridge = {key_id, credential_id}; the
// private key is in Supabase Vault under client_credentials.secret_ref (SITE-FLOW-COMPLETION-PLAN.md §1-4, I4). Its
// client id is `env:<environments.id>`. Such an id NEVER falls back to the default env client: a registered site that
// cannot be loaded is "not configured", not "write to soulful".
// Traps: the private key is read here, turned into a KeyObject and dropped; no error text carries it. The env clients
// above keep their exact behaviour (sync, env only); only bridgePost/bridgeRead resolve both kinds.

export const REGISTERED_BRIDGE_PREFIX = "env:";
const REGISTERED_ID_RE = /^env:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const registeredBridgeClientId = (environmentId: string): string => `${REGISTERED_BRIDGE_PREFIX}${environmentId}`;
/** Case-insensitive like REGISTERED_ID_RE: "ENV:<id>" must never fall through to rawBridgeEnv's default client. */
export const isRegisteredBridgeClientId = (clientId: unknown): clientId is string => typeof clientId === "string" && /^env:/i.test(clientId);

/** environments.metadata.bridge as the site flow writes it; null when absent or malformed. */
export function bridgeRegistrationOf(metadata: unknown): { keyId: string; credentialId: string } | null {
  const b = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>).bridge : null;
  if (typeof b !== "object" || b === null) return null;
  const { key_id: keyId, credential_id: credentialId } = b as Record<string, unknown>;
  return typeof keyId === "string" && keyId && typeof credentialId === "string" && credentialId ? { keyId, credentialId } : null;
}

export interface RegisteredBridgeDeps {
  db: WriteClient | null;
  getSecret(name: string): Promise<string | null>;
}

const defaultRegisteredDeps = (): RegisteredBridgeDeps => ({ db: getSupabaseWriteClient(), getSecret });

/**
 * The bridge config of a registered site, or null (missing row, archived, no key, vault empty, corrupt key, or -- unless
 * the bridge step's own probe asks -- no wp_sites row giving this install to the environment's organization: a
 * registered site is usable only once its owner is recorded, so bridgePost always gates on the right org).
 */
export async function registeredBridgeConfig(
  clientId: string,
  deps?: RegisteredBridgeDeps,
  opts: { skipOwnerCheck?: boolean } = {},
): Promise<BridgeConfig | null> {
  const m = REGISTERED_ID_RE.exec(clientId);
  if (!m) return null;
  try {
    const d = deps ?? defaultRegisteredDeps();
    if (!d.db) return null;
    const { data: env, error } = await d.db.from("environments").select("id,organization_id,base_url,status,metadata").eq("id", m[1]).maybeSingle();
    if (error || !env) return null;
    const row = env as { organization_id: string | null; base_url: string | null; status: string; metadata: unknown };
    const reg = bridgeRegistrationOf(row.metadata);
    if (row.status === "archived" || !row.base_url || !reg || !wpSiteKey(row.base_url)) return null;
    if (!opts.skipOwnerCheck && (!row.organization_id || (await bridgeSiteOrg(d.db, row.base_url)) !== row.organization_id)) return null;
    const { data: cred, error: credErr } = await d.db.from("client_credentials").select("id,secret_ref").eq("id", reg.credentialId).maybeSingle();
    const ref = !credErr && cred ? (cred as { secret_ref: string | null }).secret_ref : null;
    if (!ref) return null;
    const secret = await d.getSecret(ref);
    const key = secret ? signingKeyOf(secret) : null;
    return key ? { baseUrl: row.base_url.replace(/\/+$/, ""), keyId: reg.keyId, key } : null;
  } catch {
    return null;
  }
}

/** Sites the site flow registered a bridge key for and whose owner is recorded (non-secret fields only). */
export async function listRegisteredBridgeClients(db: WriteClient | null = getSupabaseWriteClient()): Promise<BridgeClient[]> {
  if (!db) return [];
  const { data, error } = await db.from("environments").select("id,organization_id,base_url,status,metadata").neq("status", "archived");
  if (error) {
    console.error("[wp-bridge] environments lookup failed; registered bridge sites not listed:", error.message);
    return [];
  }
  const out: BridgeClient[] = [];
  const owners = await activeWpSiteRows(db);
  if (!owners) return [];
  for (const r of (data ?? []) as Array<{ id: string; organization_id: string | null; base_url: string | null; metadata: unknown }>) {
    if (!r.base_url || !r.organization_id || !bridgeRegistrationOf(r.metadata) || !wpSiteKey(r.base_url)) continue;
    if (orgOfInstall(owners, r.base_url) !== r.organization_id) continue;
    const baseUrl = r.base_url.replace(/\/+$/, "");
    out.push({ id: registeredBridgeClientId(r.id), name: hostLabel(baseUrl), baseUrl });
  }
  return out;
}

/** Env clients (unchanged order), then registered sites on an install no env client already serves. */
export async function listBridgeClientsWithRegistered(db: WriteClient | null = getSupabaseWriteClient()): Promise<BridgeClient[]> {
  const env = listBridgeClients();
  const taken = new Set(env.map((c) => wpSiteKey(c.baseUrl)));
  return [...env, ...(await listRegisteredBridgeClients(db)).filter((c) => !taken.has(wpSiteKey(c.baseUrl)))];
}

/**
 * The site flow's bridge step proving a new key before the owner row exists (card SF-I): a signed READ with the
 * vaulted key, no gate (writes nothing). Every other caller goes through bridgePost/bridgeRead.
 */
export async function probeRegisteredBridge<T>(
  clientId: string,
  path: string,
  payload: unknown,
  deps?: RegisteredBridgeDeps,
): Promise<BridgeResult<T>> {
  const config = await registeredBridgeConfig(clientId, deps, { skipOwnerCheck: true });
  if (!config) return { ok: false, error: "bridge_not_configured" };
  return signedPost<T>(config, path, payload, "", 20_000);
}

/** bridgePost/bridgeRead: env ids as before; `env:<id>` from the registry only. */
async function resolveConfig(clientId?: string, deps?: RegisteredBridgeDeps): Promise<BridgeConfig | null> {
  return isRegisteredBridgeClientId(clientId) ? registeredBridgeConfig(clientId, deps) : getConfig(clientId);
}

export function isBridgeConfigured(clientId?: string): boolean {
  return getConfig(clientId) !== null;
}

/**
 * The configured bridge site's base URL (no trailing slash), or null if the bridge is not
 * configured / the key is corrupt. Used by the publish route to gate Bridge routing on a hostname
 * match — so an article destined for a non-bridge site is NOT mis-published to the bridge site.
 */
export function bridgeBaseUrl(clientId?: string): string | null {
  return getConfig(clientId)?.baseUrl ?? null;
}

/**
 * List every configured bridge client (default + WPBRIDGE_SITE_1..10) for the publish UI selector.
 * Returns ONLY non-secret fields (id / display name / base URL — the site is public). A client appears
 * iff its full Ed25519 triplet is present AND the key parses, so the dropdown reflects what can actually
 * be published to. Empty when nothing is configured.
 */
export function listBridgeClients(): BridgeClient[] {
  const out: BridgeClient[] = [];
  const def = getConfig();
  if (def) out.push({ id: "", name: rawBridgeEnv().name?.trim() || hostLabel(def.baseUrl), baseUrl: def.baseUrl });
  for (let i = 1; i <= 10; i++) {
    const id = String(i);
    const c = getConfig(id);
    if (c) out.push({ id, name: rawBridgeEnv(id).name?.trim() || hostLabel(c.baseUrl), baseUrl: c.baseUrl });
  }
  return out;
}

/**
 * Which channel writes to a WordPress site: the id of the configured bridge client on the same install (wpSiteKey),
 * or null = no bridge, standard REST. Every write path (create, embed, the draft list) asks this one function, so one
 * site is never written through two identities.
 */
export function bridgeClientForSite(siteUrl: string): string | null {
  const site = wpSiteKey(siteUrl);
  if (!site) return null;
  return listBridgeClients().find((c) => wpSiteKey(c.baseUrl) === site)?.id ?? null;
}

/**
 * Signed POST to a bridge route. `path` is relative to the namespace, e.g. "/product".
 * dryRun is ONLY honored by the /option route (RestController:167) — /product and
 * /post COMMIT regardless (live-verified 2026-06-11: a "dry-run" create produced
 * real draft product 7164). Callers must treat every /product call as a real write.
 */
export async function bridgePost<T>(
  path: string,
  payload: unknown,
  options?: { dryRun?: boolean; timeoutMs?: number; clientId?: string },
): Promise<BridgeResult<T>> {
  const config = await resolveConfig(options?.clientId);
  if (!config) return { ok: false, error: "bridge_not_configured" };

  // Every bridge write funnels through this one function -- gate here once, so it covers every
  // current and future caller (createWooProduct/createPost/createNewsletter), on the org that owns
  // the bridge site (bridgeSiteOrg). No DB client -> org null -> the gate answers unavailable.
  const db = getSupabaseWriteClient();
  const orgId = db ? await bridgeSiteOrg(db, config.baseUrl) : null;
  if (orgId === undefined) return { ok: false, error: BLOCKED_CHANGE_CODE, blockedMode: "unavailable" };
  const gate = await checkProductionChangeAllowed(db, orgId);
  if (!gate.allowed) {
    return { ok: false, error: BLOCKED_CHANGE_CODE, blockedMode: gate.mode };
  }

  return signedPost<T>(config, path, payload, options?.dryRun ? "&dry_run=true" : "", options?.timeoutMs ?? 45_000);
}

/**
 * Signed READ through the bridge (e.g. "/asset-references"). No production-change gate: it writes nothing,
 * and the delete guard must still be able to look while a site is frozen. Same wire format as bridgePost.
 */
export async function bridgeRead<T>(
  path: string,
  payload: unknown,
  options?: { timeoutMs?: number; clientId?: string; registeredDeps?: RegisteredBridgeDeps },
): Promise<BridgeResult<T>> {
  const config = await resolveConfig(options?.clientId, options?.registeredDeps);
  if (!config) return { ok: false, error: "bridge_not_configured" };
  return signedPost<T>(config, path, payload, "", options?.timeoutMs ?? 20_000);
}

async function signedPost<T>(
  config: BridgeConfig,
  path: string,
  payload: unknown,
  query: string,
  timeoutMs: number,
): Promise<BridgeResult<T>> {
  const fullPath = `${REST_NAMESPACE}${path}`;
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `POST\n${fullPath}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = edSign(null, Buffer.from(canonical, "utf8"), config.key).toString("base64");

  const url = `${config.baseUrl}/?rest_route=${fullPath}${query}`;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AWBridge-Key-Id": config.keyId,
          "X-AWBridge-Timestamp": String(timestamp),
          "X-AWBridge-Nonce": nonce,
          "X-AWBridge-Signature": signature,
        },
        body,
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: controller.signal.aborted ? "bridge_timeout" : "bridge_network_error" };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: `bridge_bad_json_${res.status}` };
    }
    if (!res.ok) {
      const reason =
        typeof json === "object" && json !== null && "reason" in json
          ? String((json as { reason: unknown }).reason)
          : `bridge_${res.status}`;
      return { ok: false, error: reason.slice(0, 200) };
    }
    return { ok: true, value: json as T };
  } finally {
    clearTimeout(killer);
  }
}

export interface BridgeProductResponse {
  status: string; // committed | dry_run | rolled_back
  product_id?: number;
  variation_ids?: number[];
  variation_count?: number;
  edit_url?: string;
  permalink?: string;
  reason?: string;
}

/**
 * Create a WooCommerce product (template: agency-os/docs/wp-bridge-product-template.md).
 * ⚠ ALWAYS a real write — the plugin has no dry-run for /product. Payloads default
 * to status:"draft" so nothing becomes customer-visible without human review.
 */
export function createWooProduct(
  payload: Record<string, unknown>,
  clientId?: string,
): Promise<BridgeResult<BridgeProductResponse>> {
  return bridgePost<BridgeProductResponse>("/product", payload, { timeoutMs: 90_000, clientId });
}

export interface BridgePostResponse {
  status: string; // committed | rolled_back
  ok?: boolean;
  post_id?: number;
  edit_url?: string;
  /** Did the featured image (hero) land? Best-effort on the plugin side — false ≠ post failed. */
  featured_set?: boolean;
  reason?: string;
  detail?: unknown;
}

export interface BridgePostSpec {
  title: string;
  /** Bridge composes these into Kadence markup (BlockLibrary.compose) and sideloads image URLs. */
  blocks: unknown[];
  status?: "draft" | "pending" | "publish";
  excerpt?: string;
  categories?: string[];
  tags?: string[];
  seo?: { focus_keyword?: string; description?: string; title?: string };
  /** Issue 四: hero image URL the plugin sideloads + sets as post thumbnail (best-effort). */
  featured_image_url?: string;
  /** Alt text for the featured image; defaults to focus_keyword on the plugin side. */
  featured_image_alt?: string;
  /** Issue 七: keywords written to ILJ's `ilj_linkdefinition` meta for auto internal-linking. */
  internal_link_keywords?: string[];
}

/**
 * Create a full blog post draft through the Bridge `/post` route: blocks[] → Kadence, in-article
 * image URLs sideloaded into the media library, Rank Math SEO meta set server-side, categories/tags
 * created+assigned — all atomic with read-back verify + rollback on the plugin side.
 * ⚠ ALWAYS a real write (no dry-run for /post). Defaults to status:"draft".
 */
export function createPost(
  spec: BridgePostSpec,
  clientId?: string,
): Promise<BridgeResult<BridgePostResponse>> {
  return bridgePost<BridgePostResponse>("/post", { status: "draft", ...spec }, { timeoutMs: 90_000, clientId });
}

/** A blog post as the bridge's /post/read returns it (plugin 0.22.0, DraftPostEditor); content_sha256 is the
 *  precondition updateDraftPost sends back. */
export interface BridgePostRead {
  post_id: number;
  post_status: string;
  title: string;
  content: string;
  content_sha256: string;
}

/** The site's newest draft/pending posts. Read scope, no gate (writes nothing). */
export function listDraftPosts(
  clientId: string,
): Promise<BridgeResult<{ posts?: Array<{ id: number; title: string; status: string; modified: string }> }>> {
  return bridgeRead("/drafts", {}, { clientId });
}

/** One blog post's raw content and status (any status; only updateDraftPost is limited to not-live posts). */
export function readBridgePost(postId: number, clientId: string): Promise<BridgeResult<BridgePostRead>> {
  return bridgeRead<BridgePostRead>("/post/read", { post_id: postId }, { clientId });
}

/** Replace a draft/pending post's content if it is still the content read (expectSha256 = readBridgePost's
 *  content_sha256). The plugin refuses a live post ("post_not_draft") or one edited since ("content_changed") and never
 *  changes the status. Answer `content` = what WordPress saved (a save filter may have changed it), for the caller to check. */
export function updateDraftPost(
  postId: number,
  content: string,
  expectSha256: string,
  clientId: string,
): Promise<BridgeResult<{ status: string; post_id?: number; post_status?: string; content?: string }>> {
  return bridgePost("/draft/update", { post_id: postId, content, expect_sha256: expectSha256 }, { timeoutMs: 30_000, clientId });
}
