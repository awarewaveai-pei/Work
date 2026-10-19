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
 * Private keys live ONLY in env (never the DB) — they are signing secrets. A publish call carries an
 * optional `clientId` ("" = default, "1".."10" = that site); absent → default → fully backward
 * compatible with the original single-site behaviour.
 */
import { createHash, createPrivateKey, randomUUID, sign as edSign, type KeyObject } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { BLOCKED_CHANGE_CODE } from "@/lib/system-modes/blocked-change";

const REST_NAMESPACE = "/aware-wave-bridge/v1";
// RFC 8410 PKCS#8 prefix for an Ed25519 private key; append the 32-byte seed.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** `blockedMode` is set only when the system-mode gate blocks the write (never from plugin output):
 *  callers answer the shared 423 (lib/system-modes/blocked-change.ts), not a 502 bridge failure. */
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string; blockedMode?: string };

type WriteClient = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * The bridge site's owning org = the org of the active wp_sites row on the same host -- the source
 * wordpress-core gates on too. No row -> null (global mode only). Unreadable, or rows on that host
 * naming different orgs -> undefined: the org cannot be told, so the caller blocks.
 */
export async function bridgeSiteOrg(db: WriteClient, baseUrl: string): Promise<string | null | undefined> {
  const host = hostOf(baseUrl);
  if (!host) return undefined;
  const { data, error } = await db.from("wp_sites").select("url, organization_id").eq("active", true);
  if (error) {
    console.error("[wp-bridge] wp_sites lookup failed; bridge write blocked:", error.message);
    return undefined;
  }
  const rows = (data ?? []) as Array<{ url: string; organization_id: string | null }>;
  const orgs = new Set(rows.filter((r) => hostOf(r.url) === host).map((r) => r.organization_id ?? null));
  if (orgs.size > 1) return undefined;
  return orgs.size === 1 ? [...orgs][0] : null;
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

function getConfig(clientId?: string): { baseUrl: string; keyId: string; key: KeyObject } | null {
  const { baseUrl, keyId, secretB64 } = rawBridgeEnv(clientId);
  if (!baseUrl || !keyId || !secretB64) return null;
  try {
    const raw = Buffer.from(secretB64.trim(), "base64");
    // libsodium "secret key" = seed(32) + public(32); Node wants just the seed.
    // Accept ONLY the two unambiguous encodings — anything else is a corrupt key.
    if (raw.length !== 64 && raw.length !== 32) return null;
    const seed = raw.subarray(0, 32);
    const key = createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
      format: "der",
      type: "pkcs8",
    });
    return { baseUrl: baseUrl.replace(/\/+$/, ""), keyId, key };
  } catch {
    return null;
  }
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
  const config = getConfig(options?.clientId);
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

  const fullPath = `${REST_NAMESPACE}${path}`;
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `POST\n${fullPath}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = edSign(null, Buffer.from(canonical, "utf8"), config.key).toString("base64");

  const dry = options?.dryRun ? "&dry_run=true" : "";
  const url = `${config.baseUrl}/?rest_route=${fullPath}${dry}`;

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 45_000);
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
): Promise<BridgeResult<BridgePostResponse>> {
  return bridgePost<BridgePostResponse>("/post", { status: "draft", ...spec }, { timeoutMs: 90_000 });
}
