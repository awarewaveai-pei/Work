import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface PermitPayload {
  format_version: 1;
  tenant: string;
  product_key: string;
  feature_key: string;
  source: "contract" | "comp" | "credits";
  entitlement_id: string | null;
  source_ref: string | null;
  limits: Record<string, JsonValue>;
  max_spend: number | null;
  actor: string;
  on_behalf_of: string;
  issued_at: number;
  expires_at: number;
  kid: string;
}
export type PermitBinding = Pick<PermitPayload, "tenant" | "product_key" | "feature_key" | "actor" | "on_behalf_of">;
export type PermitKey = string | KeyObject;
export class PermitError extends Error {}
const fail = (reason: string): never => { throw new PermitError(reason); };
const fields = ["format_version", "tenant", "product_key", "feature_key", "source", "entitlement_id", "source_ref", "limits", "max_spend", "actor", "on_behalf_of", "issued_at", "expires_at", "kid"].sort();
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** RFC 8785: JS number serialization and UTF-16 property ordering; invalid Unicode is rejected. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : fail("non_finite_number");
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail("invalid_unicode");
      } else if (c >= 0xdc00 && c <= 0xdfff) fail("invalid_unicode");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${Array.from(value, canonicalize).join(",")}]`;
  if (object(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map((key) => `${canonicalize(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return fail("not_json");
}

function validate(payload: unknown): asserts payload is PermitPayload {
  if (!object(payload) || JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(fields)) fail("invalid_payload");
  const p = payload as Record<string, unknown>;
  if (p.format_version !== 1) fail("unknown_version");
  for (const key of ["tenant", "product_key", "feature_key", "actor", "on_behalf_of", "kid"]) if (!text(p[key])) fail("invalid_payload");
  if (p.tenant !== p.on_behalf_of) fail("tenant_binding");
  if (!["contract", "comp", "credits"].includes(p.source as string) || !object(p.limits)) fail("invalid_payload");
  if (!(p.source_ref === null || text(p.source_ref))) fail("invalid_payload");
  if (p.source === "credits") {
    if (p.entitlement_id !== null || typeof p.max_spend !== "number" || !Number.isFinite(p.max_spend) || p.max_spend <= 0) fail("invalid_credit_grant");
  } else if (!text(p.entitlement_id) || p.max_spend !== null) fail("invalid_contract_grant");
  if (!Number.isSafeInteger(p.issued_at) || !Number.isSafeInteger(p.expires_at) || (p.issued_at as number) < 0) fail("invalid_time");
  const ttl = (p.expires_at as number) - (p.issued_at as number);
  if (ttl <= 0 || ttl > 600) fail("invalid_lifetime");
  canonicalize(p);
}

export function signPermit(payload: PermitPayload, privateKey: PermitKey): string {
  validate(payload);
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  if (key.asymmetricKeyType !== "ed25519" || key.type !== "private") fail("invalid_signing_key");
  const bytes = Buffer.from(canonicalize(payload), "utf8");
  return `${bytes.toString("base64url")}.${sign(null, bytes, key).toString("base64url")}`;
}

export function verifyPermit(token: string, publicKeys: Readonly<Record<string, PermitKey>>, expected: PermitBinding, now = Math.floor(Date.now() / 1000)): PermitPayload {
  if (typeof token !== "string" || token.length > 65536) fail("invalid_token");
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) fail("invalid_token");
  const [bytes, signature] = parts.map((part) => Buffer.from(part, "base64url"));
  if (parts[0] !== bytes.toString("base64url") || parts[1] !== signature.toString("base64url") || signature.length !== 64) fail("invalid_token");
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return fail("invalid_json"); }
  validate(payload);
  if (!bytes.equals(Buffer.from(canonicalize(payload)))) fail("non_canonical_payload");
  const configured = Object.hasOwn(publicKeys, payload.kid) ? publicKeys[payload.kid] : undefined;
  if (!configured) fail("unknown_kid");
  let valid = false;
  try {
    const key = typeof configured === "string" ? createPublicKey(configured) : configured;
    valid = key.type === "public" && key.asymmetricKeyType === "ed25519" && verify(null, bytes, key, signature);
  } catch { return fail("invalid_public_key"); }
  if (!valid) fail("invalid_signature");
  if (!Number.isSafeInteger(now) || payload.issued_at > now || payload.expires_at <= now) fail("expired_or_future");
  for (const key of ["tenant", "product_key", "feature_key", "actor", "on_behalf_of"] as const) {
    if (!text(expected[key]) || payload[key] !== expected[key]) fail("binding_mismatch");
  }
  return payload;
}
