/**
 * wp-bridge signing client — Ed25519-signed writes to a WordPress site running
 * the AwareWave WP Bridge plugin (packages/wp-bridge-plugin).
 *
 * Wire protocol (RestController.php): headers X-AWBridge-Key-Id / -Timestamp /
 * -Nonce / -Signature; signature = Ed25519 over
 *   METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256hex(rawBody)
 * where PATH is the REST route (e.g. /aware-wave-bridge/v1/product) even when
 * the request travels as ?rest_route=<path>.
 *
 * Env (server-only, never NEXT_PUBLIC):
 *   WPBRIDGE_BASE_URL    e.g. https://soulfulexpression.org
 *   WPBRIDGE_KEY_ID      e.g. SE-01
 *   WPBRIDGE_PRIVATE_KEY base64 Ed25519 secret (64-byte libsodium or 32-byte seed)
 */
import { createHash, createPrivateKey, randomUUID, sign as edSign, type KeyObject } from "node:crypto";

const REST_NAMESPACE = "/aware-wave-bridge/v1";
// RFC 8410 PKCS#8 prefix for an Ed25519 private key; append the 32-byte seed.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: string };

function getConfig(): { baseUrl: string; keyId: string; key: KeyObject } | null {
  const baseUrl = process.env.WPBRIDGE_BASE_URL;
  const keyId = process.env.WPBRIDGE_KEY_ID;
  const secretB64 = process.env.WPBRIDGE_PRIVATE_KEY;
  if (!baseUrl || !keyId || !secretB64) return null;
  try {
    const raw = Buffer.from(secretB64.trim(), "base64");
    // libsodium "secret key" = seed(32) + public(32); Node wants just the seed.
    const seed = raw.length >= 64 ? raw.subarray(0, 32) : raw.subarray(0, 32);
    if (seed.length !== 32) return null;
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

export function isBridgeConfigured(): boolean {
  return getConfig() !== null;
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
  options?: { dryRun?: boolean; timeoutMs?: number },
): Promise<BridgeResult<T>> {
  const config = getConfig();
  if (!config) return { ok: false, error: "bridge_not_configured" };

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
): Promise<BridgeResult<BridgeProductResponse>> {
  return bridgePost<BridgeProductResponse>("/product", payload, { timeoutMs: 90_000 });
}
