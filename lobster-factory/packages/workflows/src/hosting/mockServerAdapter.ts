import { createHash } from "node:crypto";
import type { MockServerRef, ServerProvisionResult } from "./serverTypes";
import type {
  ServerProvisionAdapter,
  ServerProvisionInput,
} from "./providers/serverProvisionContract";

/**
 * Deterministic, non-routable mock IPv4 from siteId (TEST-NET-3 / 203.0.113.0/24,
 * RFC 5737 — reserved for documentation, never reachable). Stable across reruns.
 */
export function deterministicMockIpv4(siteId: string): string {
  const h = createHash("sha256").update(`lobster:mock-server-ip:${siteId}`).digest();
  // 203.0.113.X — last octet 1..254 derived from the hash.
  const last = (h[0] % 254) + 1;
  return `203.0.113.${last}`;
}

/** Deterministic mock server id (digits only, Hetzner ids are numeric). */
export function deterministicMockServerId(siteId: string): string {
  const h = createHash("sha256").update(`lobster:mock-server-id:${siteId}`).digest("hex");
  // 8 hex chars → decimal, zero-padded feel of a real id.
  return String(parseInt(h.slice(0, 8), 16));
}

function slugifySiteName(siteName: string): string {
  const s = siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "site";
}

/**
 * Pure mock server ref (no env, no API). Use via `resolveServerProvisioning` when
 * adapter=mock — for CI / dry-running the whole provisioning chain without spending money.
 */
export function buildMockServerRef(input: ServerProvisionInput): MockServerRef {
  const serverId = deterministicMockServerId(input.siteId);
  const ipv4 = deterministicMockIpv4(input.siteId);
  const slug = slugifySiteName(input.siteName);

  return {
    adapter: "mock",
    serverId,
    ipv4,
    sshHost: ipv4,
    sshCredentialsRef: `vault://LOBSTER_SSH_KEY_MOCK_${input.siteId.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`,
    region: input.region,
    serverType: input.serverType,
    wpRootPath: `/var/www/html/mock-server/${input.siteId}/${slug}`,
    provisioningNotes: [
      "LOBSTER_SERVER_ADAPTER=mock: no real Hetzner server, IP, or billing was created.",
      `Mock IPv4 ${ipv4} is RFC 5737 documentation space (never routable).`,
    ],
  };
}

/** Mock implementation of the adapter interface — lets the orchestrator exercise the
 *  full chain (including the `mock` outcome) without any real API. */
export function createMockServerAdapter(): ServerProvisionAdapter {
  return {
    id: "mock",
    async provisionServer(input: ServerProvisionInput): Promise<ServerProvisionResult> {
      return { outcome: "mock", ref: buildMockServerRef(input) };
    },
  };
}
