/**
 * Hetzner Cloud server-provisioning adapter (machine layer). Implements
 * `ServerProvisionAdapter`. All side-effecting dependencies are injected so the whole
 * flow is unit-testable with a mock fetch — real-account verification is Phase 4.
 *
 * Honours every hard rule from PLAN appendix A + the hardening SOP:
 *  - runtime `GET /v1/server_types?location=<region>` (cx-series deprecated 2026-01-01).
 *  - idempotency (C2): label_selector `lobster-site-id` → reuse, never double-create.
 *  - secret hygiene (M7 / crypto-miner): pure fetch (no spawn/env inheritance); per-tenant
 *    key generated + stored via injected `secretStore`; only the PUBLIC key enters user_data.
 *  - rollback (M9): a failure after create destroys the server AND its Primary IP
 *    (Primary IPv4 is NOT auto-deleted with the server → orphan billing).
 *  - dry-run gate: when billable provisioning is disabled, returns `dry_run` with a
 *    non-secret request summary and makes NO POST.
 */

import type {
  ServerProvisionAdapter,
  ServerProvisionInput,
} from "../serverProvisionContract";
import type {
  ProvisionedServerRef,
  ServerProvisionResult,
  ServerProvisionPlan,
} from "../../serverTypes";
import { renderDay1CloudInit } from "./cloudInit";

/** Generates + persists a per-tenant SSH key, returning the PUBLIC key + a vault pointer. */
export type ServerSecretStore = {
  generateAndStore(siteId: string): Promise<{ sshPublicKey: string; sshCredentialsRef: string }>;
};

export type HetznerAdapterDeps = {
  apiToken: string;
  region: string;
  baseUrl?: string;
  /** Both gates on → real billable create; off → dry_run. */
  billable: boolean;
  secretStore: ServerSecretStore;
  /** Hetzner Cloud Firewall ids to attach at create time (managed by OpenTofu). */
  firewallIds?: number[];
  image?: string;
  extraLabels?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

const DEFAULT_BASE = "https://api.hetzner.cloud/v1";
const SITE_LABEL = "lobster-site-id";
// ed25519 public key, fixed-ish length — used to estimate cloud-init size in dry-run.
const PLACEHOLDER_PUBKEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPlaceholderForDryRunSizeEstimateOnly0000 dry-run";

function hostnameFor(input: ServerProvisionInput): string {
  const slug = input.siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  return `lf-stg-${input.region}-${slug}`.slice(0, 63);
}

function labelsFor(input: ServerProvisionInput, extra?: Record<string, string>): Record<string, string> {
  return {
    [SITE_LABEL]: input.siteId,
    "organization-id": input.organizationId,
    environment: "staging",
    region: input.region,
    managed_by: "lobster_factory",
    provisioned_by: "hetzner_adapter",
    ...extra,
  };
}

export function createHetznerAdapter(deps: HetznerAdapterDeps): ServerProvisionAdapter {
  const base = (deps.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const f = deps.fetchImpl ?? ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch);
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const image = deps.image ?? "ubuntu-24.04";
  const pollIntervalMs = deps.pollIntervalMs ?? 3000;
  const pollTimeoutMs = deps.pollTimeoutMs ?? 180_000;

  if (!f) throw new Error("global fetch is not available in this runtime");

  async function api(path: string, init?: RequestInit): Promise<any> {
    const res = await f(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${deps.apiToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text().catch(() => "");
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON 200 (proxy / nginx HTML error page) — surface cleanly, don't leak a raw SyntaxError.
      if (!res.ok) throw new Error(`hetzner ${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}`);
      throw new Error(`hetzner ${init?.method ?? "GET"} ${path}: non-JSON response (${res.status})`);
    }
    if (!res.ok) {
      const err = body?.error ? JSON.stringify(body.error) : `${res.status} ${res.statusText}`;
      throw new Error(`hetzner ${init?.method ?? "GET"} ${path} failed: ${err}`);
    }
    return body;
  }

  const REUSABLE_STATES = new Set(["running", "initializing", "starting"]);

  /** All servers carrying this site's label (idempotency key). */
  async function findServersBySite(siteId: string): Promise<any[]> {
    const body = await api(`/servers?label_selector=${encodeURIComponent(`${SITE_LABEL}=${siteId}`)}`);
    return Array.isArray(body?.servers) ? body.servers : [];
  }

  function refFromServer(server: any, input: ServerProvisionInput, sshCredentialsRef: string): ProvisionedServerRef {
    const ipv4 = server?.public_net?.ipv4?.ip ?? "";
    return {
      adapter: "hetzner_cloud",
      serverId: String(server.id),
      ipv4,
      ipv6: server?.public_net?.ipv6?.ip,
      sshHost: ipv4,
      sshCredentialsRef,
      region: input.region,
      serverType: input.serverType,
      wpRootPath: `/var/www/html/${input.siteId}`,
      provisioningNotes: [`hetzner server ${server.id} in ${input.region}`],
    };
  }

  async function teardown(serverId: string, primaryIpId?: number): Promise<void> {
    // M9 compensating rollback. Best-effort; swallow secondary failures but never throw
    // out of the rollback (the caller already has the primary error).
    // Resolve the Primary IP id BEFORE deleting the server — Hetzner does NOT auto-delete
    // the Primary IPv4 with the server, so a missed id = €0.50/mo orphan billing (M9).
    let ipId = primaryIpId;
    if (ipId === undefined) {
      try {
        const s = await api(`/servers/${serverId}`);
        ipId = s?.server?.public_net?.ipv4?.id;
      } catch {
        /* server may already be gone; nothing more we can resolve */
      }
    }
    try {
      await api(`/servers/${serverId}`, { method: "DELETE" });
    } catch {
      /* server may already be gone */
    }
    if (ipId !== undefined) {
      try {
        await api(`/primary_ips/${ipId}`, { method: "DELETE" });
      } catch {
        /* primary ip cleanup is best-effort */
      }
    }
  }

  async function provisionServer(input: ServerProvisionInput): Promise<ServerProvisionResult> {
    // 1. Idempotency (C2) — runs even in dry-run so a re-submit never appears to "create".
    const matches = await findServersBySite(input.siteId);
    if (matches.length) {
      // Reuse only a healthy match WITH an IP. A stuck/dead match must be surfaced, not
      // silently "reused" with an empty IP (which would skip DNS and look successful).
      const usable = matches.find(
        (s) => REUSABLE_STATES.has(String(s.status)) && s?.public_net?.ipv4?.ip
      );
      if (usable) {
        return {
          outcome: "reused",
          ref: refFromServer(usable, input, `vault://LOBSTER_SSH_KEY_${input.siteId}`),
        };
      }
      const states = matches.map((s) => `${s.id}:${s.status}`).join(", ");
      return {
        outcome: "blocked",
        adapter: "hetzner_cloud",
        message: `existing server(s) for site found but none healthy/reachable [${states}] — operator cleanup needed`,
        missingEnv: [],
      };
    }

    // 2. Runtime server-type availability IN THE TARGET LOCATION (cx deprecated; SIN = AMD
    //    cpx only). A type can exist globally yet not be offered in `region` — checking the
    //    per-location price entry avoids a guaranteed-to-fail billable create.
    const typesBody = await api(`/server_types?per_page=50`);
    const types: any[] = Array.isArray(typesBody?.server_types) ? typesBody.server_types : [];
    const match = types.find((t) => String(t.name) === input.serverType);
    const availableHere = types
      .filter((t) => Array.isArray(t.prices) && t.prices.some((p: any) => p.location === input.region))
      .map((t) => String(t.name));
    const offeredHere = match && availableHere.includes(input.serverType);
    if (types.length && !offeredHere) {
      return {
        outcome: "blocked",
        adapter: "hetzner_cloud",
        message: `serverType "${input.serverType}" not offered in ${input.region}. Available there: ${availableHere.join(", ") || "(none resolved)"}`,
        missingEnv: [],
      };
    }

    const labels = labelsFor(input, deps.extraLabels);

    // 3. Dry-run gate — validate + render, but NO billable POST.
    if (!deps.billable) {
      const { bytes } = renderDay1CloudInit({ sshPublicKey: PLACEHOLDER_PUBKEY, hostname: hostnameFor(input) });
      const plan: ServerProvisionPlan = {
        adapter: "hetzner_cloud",
        serverType: input.serverType,
        region: input.region,
        image,
        labels,
        cloudInitBytes: bytes,
        notes: [
          "DRY-RUN: LOBSTER_SERVER_PROVISION_ENABLED is off — no Hetzner server was created.",
          "cloudInitBytes is estimated with a placeholder public key.",
        ],
      };
      return { outcome: "dry_run", plan };
    }

    // 4. Real provision — generate the per-tenant key (public key only goes to user_data).
    const { sshPublicKey, sshCredentialsRef } = await deps.secretStore.generateAndStore(input.siteId);
    const { userData } = renderDay1CloudInit({ sshPublicKey, hostname: hostnameFor(input) });

    let serverId: string | undefined;
    let primaryIpId: number | undefined;
    try {
      const created = await api(`/servers`, {
        method: "POST",
        body: JSON.stringify({
          name: hostnameFor(input),
          server_type: input.serverType,
          image,
          location: input.region,
          user_data: userData,
          labels,
          ...(deps.firewallIds?.length
            ? { firewalls: deps.firewallIds.map((id) => ({ firewall: id })) }
            : {}),
          start_after_create: true,
        }),
      });
      const server = created.server;
      serverId = String(server.id);
      primaryIpId = server?.public_net?.ipv4?.id;

      // 5. Poll until running. A transient API blip (429/503) during boot must NOT tear
      //    down a server that's about to be healthy — swallow poll errors, honour only the
      //    wall-clock deadline.
      const deadline = Date.now() + pollTimeoutMs;
      let current = server;
      while (current.status !== "running") {
        if (Date.now() > deadline) {
          throw new Error(`server ${serverId} did not reach running within ${pollTimeoutMs}ms`);
        }
        await sleep(pollIntervalMs);
        let polled: any;
        try {
          polled = await api(`/servers/${serverId}`);
        } catch {
          continue; // transient error — retry until the deadline, don't abort+teardown
        }
        current = polled.server;
      }

      return { outcome: "provisioned", ref: refFromServer(current, input, sshCredentialsRef) };
    } catch (err) {
      // 6. Rollback (M9): never leave a half-built server or its Primary IP billing.
      const message = err instanceof Error ? err.message : String(err);
      if (serverId) await teardown(serverId, primaryIpId);
      return {
        outcome: "rolled_back",
        serverId,
        message: `provision failed, rolled back: ${message}`,
      };
    }
  }

  return { id: "hetzner_cloud", provisionServer };
}
