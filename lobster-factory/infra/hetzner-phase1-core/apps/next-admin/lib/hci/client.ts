// Thin HTTP client for HCI-30's collector-pipeline seed endpoint
// (Projects/internal/hci30/app/server.mjs POST /api/hci/v1/seeds).
//
// No default base URL, by design (unlike a "localhost:PORT convenience default"): this app runs in a
// container on ks-aw-01, where "localhost" means the container itself, not the operator's laptop.
// HCI-30 is deployed at https://hci.aware-wave.com (public /health answered 200 on 2026-09-23), but
// that is a browser-facing edge, not an address to bake into server-to-server calls, and a localhost
// fallback here could connect to an unrelated process instead of failing loudly. HCI_API_BASE_URL
// must therefore be set explicitly; isHciConfigured() reports false when it is absent, exactly like
// lib/cognitive-os/client.ts's own isCognitiveOsConfigured(). Since 2026-09-23 the import bridge that
// uses this client is frozen by default anyway (lib/research-bridges.ts, plan P0).
//
// Auth: none. HCI-30's resolveTenant() (app/server.mjs) reads a `tenant` field off the request body
// alone -- there is no real authentication system on the other end yet (its own docs call this out:
// "Not an auth system", HCI_C1_C10_DECISIONS.md). HCI_IMPORT_TENANT selects which of HCI-30's two
// hardcoded synthetic tenants ('a' | 'b') this bridge writes into -- a fixed, operator-chosen value,
// not a per-organization mapping (that mapping does not exist yet: this bridge is for the operator's
// own self-use, not a multi-tenant customer product).
//
// Env (server-only):
//   HCI_API_BASE_URL    required, no default (e.g. http://localhost:4030 for local dev)
//   HCI_IMPORT_TENANT    default 'a' -- low-risk default: both of HCI-30's tenants are the
//                         operator's own synthetic dev data today, never a real customer's.

type HciOk<T> = { ok: true; value: T };
type HciErr = { ok: false; error: string; status?: number };
export type HciResult<T> = HciOk<T> | HciErr;

const DEFAULT_TENANT = "a";

interface HciConfig {
  baseUrl: string;
  tenant: string;
}

function config(): HciConfig | null {
  const raw = process.env.HCI_API_BASE_URL?.trim();
  if (!raw) return null;
  const tenant = process.env.HCI_IMPORT_TENANT?.trim() || DEFAULT_TENANT;
  return { baseUrl: raw.replace(/\/+$/, ""), tenant };
}

export function isHciConfigured(): boolean {
  return config() !== null;
}

export interface HciSeedWritten {
  outcome: "written";
  retryable: false;
  jobId: string;
  sourceId: string;
  snapshotId: string;
  candidateRelatedSources: Array<{ sourceId: string; sourceRef: string }>;
}

export interface HciSeedNotWritten {
  outcome: "flagged_for_review" | "failed" | "timed_out";
  retryable: boolean;
  jobId: string;
  error?: string | null;
  errorCode?: string | null;
  scanReasons?: unknown;
  truncated?: boolean;
}

export type HciSeedOutcome = HciSeedWritten | HciSeedNotWritten;

/**
 * POST one candidate URL to HCI-30's DISCOVERED-source intake. `subject_kind` is always
 * 'ORGANIZATION' -- the only value hci30's own pipeline accepts (ADR-011 決策10) -- and `dryRun` is
 * always false: a dry run's whole point is that nothing lands in hci.sources, which would defeat the
 * reason this bridge exists. A 200 response can still carry a non-'written' outcome (flagged/failed/
 * timed_out are legitimate terminal states HCI-30's own orchestrator returns, not HTTP errors) --
 * callers must check `.outcome`, not just `.ok`.
 */
export async function createHciSeed(targetUrl: string): Promise<HciResult<HciSeedOutcome>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "hci_not_configured" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/api/hci/v1/seeds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl, subject_kind: "ORGANIZATION", tenant: cfg.tenant, dryRun: false }),
    });
  } catch {
    return { ok: false, error: "hci_network_error" };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body to parse; only matters below if !res.ok, where a missing detail just falls back.
  }
  if (!res.ok) {
    const detail = typeof json === "object" && json !== null && "detail" in json ? (json as { detail: unknown }).detail : json;
    return { ok: false, error: typeof detail === "string" ? detail : `hci_error_${res.status}`, status: res.status };
  }
  return { ok: true, value: json as HciSeedOutcome };
}
