/**
 * provisionClient — the SSOT orchestrator for "rent a host + make it reachable".
 *
 * Decision 0 (PLAN): the PROCEDURE lives here in deterministic code, idempotent +
 * rollback-aware. The TRIGGER is swappable — a Slash Command (`cli.ts`) now, a web-app
 * API route later — both call this same function. NOT a Trigger.dev task.
 *
 * This increment orchestrates the machine layer + DNS:
 *   serverAdapter.provisionServer → (on a host ref) upsert Cloudflare A-record.
 * The site layer (WordPress install via the existing create-wp-site path) consumes the
 * returned `ref.sshHost` / `wpRootPath` — wired in a follow-up.
 *
 * Every external effect is injected → the whole flow is unit-testable with no network.
 */

import type { ServerProvisionAdapter } from "../hosting/providers/serverProvisionContract";
import type { ProvisionedServerRef, MockServerRef, ServerProvisionPlan } from "../hosting/serverTypes";
import type { CloudflareDnsConfig, UpsertARecordResult } from "../hosting/providers/cloudflare/dns";
import { upsertDnsARecord } from "../hosting/providers/cloudflare/dns";

export type ProvisionClientInput = {
  siteId: string;
  siteName: string;
  organizationId: string;
  region: string;
  serverType: string;
  image?: string;
  /** FQDN to point at the new host, e.g. "acme.aware-wave.com". Omit to skip DNS. */
  domain?: string;
};

export type ProvisionClientDeps = {
  serverAdapter: ServerProvisionAdapter;
  /** When present (and a host ref is produced + a domain is given), the A-record is upserted. */
  dns?: { config: CloudflareDnsConfig; upsert?: typeof upsertDnsARecord };
};

export type ProvisionClientResult =
  | { status: "idle" }
  | { status: "dry_run"; plan: ServerProvisionPlan }
  | {
      status: "provisioned" | "reused" | "mock";
      ref: ProvisionedServerRef | MockServerRef;
      dns?: UpsertARecordResult;
    }
  | { status: "blocked"; message: string }
  | { status: "rolled_back"; message: string };

export async function provisionClient(
  input: ProvisionClientInput,
  deps: ProvisionClientDeps
): Promise<ProvisionClientResult> {
  const result = await deps.serverAdapter.provisionServer({
    siteId: input.siteId,
    siteName: input.siteName,
    organizationId: input.organizationId,
    region: input.region,
    serverType: input.serverType,
    image: input.image ?? "ubuntu-24.04",
  });

  switch (result.outcome) {
    case "idle":
      return { status: "idle" };
    case "dry_run":
      return { status: "dry_run", plan: result.plan };
    case "blocked":
      return { status: "blocked", message: result.message };
    case "rolled_back":
      return { status: "rolled_back", message: result.message };
    case "mock":
    case "provisioned":
    case "reused": {
      const ref = result.ref;
      let dns: UpsertARecordResult | undefined;
      // friction #1: a host with no A-record is unreachable. Only attempt when both a
      // domain and Cloudflare config are present, and the host has a real IPv4.
      if (input.domain && deps.dns && ref.ipv4) {
        const upsert = deps.dns.upsert ?? upsertDnsARecord;
        dns = await upsert(deps.dns.config, { name: input.domain, ipv4: ref.ipv4 });
      }
      return { status: result.outcome, ref, dns };
    }
  }
}
