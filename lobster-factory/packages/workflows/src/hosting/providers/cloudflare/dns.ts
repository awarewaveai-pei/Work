/**
 * Cloudflare DNS A-record automation (friction #1 — a host with no A-record is unreachable).
 * Idempotent upsert: GET by exact name+type → POST if absent, PUT if present. Safe to re-run.
 *
 * Creds are NON-secret here only as far as the zoneId; the API token is a secret and must
 * come from vault (`CLOUDFLARE_API_TOKEN`) — never logged, only in the Authorization header.
 *
 * `fetchImpl` is injectable so the whole flow is unit-testable without network.
 */

export type CloudflareDnsConfig = {
  apiToken: string;
  zoneId: string;
  /** Defaults to the public Cloudflare v4 API. */
  baseUrl?: string;
};

export type UpsertARecordInput = {
  /** Fully-qualified record name, e.g. "acme-shop.aware-wave.com". */
  name: string;
  ipv4: string;
  /** Route through Cloudflare proxy (orange-cloud). Default true. */
  proxied?: boolean;
  /** TTL; 1 = automatic (required when proxied). Default 1. */
  ttl?: number;
};

export type UpsertARecordResult = {
  recordId: string;
  name: string;
  created: boolean;
};

type FetchImpl = typeof fetch;

function getFetch(fetchImpl?: FetchImpl): FetchImpl {
  const f = fetchImpl ?? ((globalThis as { fetch?: FetchImpl }).fetch as FetchImpl);
  if (!f) throw new Error("global fetch is not available in this runtime");
  return f;
}

function headers(cfg: CloudflareDnsConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiToken}`,
    "Content-Type": "application/json",
  };
}

function base(cfg: CloudflareDnsConfig): string {
  return (cfg.baseUrl ?? "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
}

async function cfJson(res: Response, op: string): Promise<any> {
  const text = await res.text().catch(() => "");
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok || (body && body.success === false)) {
    const errs = body?.errors ? JSON.stringify(body.errors) : `${res.status} ${res.statusText}`;
    throw new Error(`cloudflare ${op} failed: ${errs}`);
  }
  return body;
}

/**
 * Idempotent: create the A-record if it doesn't exist, else update it to the new IP.
 * Re-running with the same input is a no-op-equivalent (PUT to same value).
 */
export async function upsertDnsARecord(
  cfg: CloudflareDnsConfig,
  input: UpsertARecordInput,
  fetchImpl?: FetchImpl
): Promise<UpsertARecordResult> {
  const f = getFetch(fetchImpl);
  const proxied = input.proxied ?? true;
  const ttl = input.ttl ?? 1;

  // 1. Look up an existing A-record by exact name.
  const listUrl =
    `${base(cfg)}/zones/${cfg.zoneId}/dns_records` +
    `?type=A&name=${encodeURIComponent(input.name)}`;
  const listRes = await f(listUrl, { method: "GET", headers: headers(cfg) });
  const listBody = await cfJson(listRes, "list dns_records");
  const existing = Array.isArray(listBody?.result) ? listBody.result[0] : undefined;

  const payload = JSON.stringify({
    type: "A",
    name: input.name,
    content: input.ipv4,
    proxied,
    ttl,
  });

  // 2. PUT if it exists, POST if not.
  if (existing?.id) {
    const putRes = await f(`${base(cfg)}/zones/${cfg.zoneId}/dns_records/${existing.id}`, {
      method: "PUT",
      headers: headers(cfg),
      body: payload,
    });
    const putBody = await cfJson(putRes, "update dns_record");
    return { recordId: putBody.result.id, name: input.name, created: false };
  }

  const postRes = await f(`${base(cfg)}/zones/${cfg.zoneId}/dns_records`, {
    method: "POST",
    headers: headers(cfg),
    body: payload,
  });
  const postBody = await cfJson(postRes, "create dns_record");
  return { recordId: postBody.result.id, name: input.name, created: true };
}

/** Teardown: delete the A-record by name (idempotent — absent name is a no-op). */
export async function deleteDnsARecord(
  cfg: CloudflareDnsConfig,
  name: string,
  fetchImpl?: FetchImpl
): Promise<{ deleted: boolean }> {
  const f = getFetch(fetchImpl);
  const listUrl =
    `${base(cfg)}/zones/${cfg.zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`;
  const listRes = await f(listUrl, { method: "GET", headers: headers(cfg) });
  const listBody = await cfJson(listRes, "list dns_records");
  const existing = Array.isArray(listBody?.result) ? listBody.result[0] : undefined;
  if (!existing?.id) return { deleted: false };

  const delRes = await f(`${base(cfg)}/zones/${cfg.zoneId}/dns_records/${existing.id}`, {
    method: "DELETE",
    headers: headers(cfg),
  });
  await cfJson(delRes, "delete dns_record");
  return { deleted: true };
}
