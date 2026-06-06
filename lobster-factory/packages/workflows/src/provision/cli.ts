/**
 * `provision-client` CLI — the Phase-1 trigger (Decision 0). A thin wrapper that reads
 * args + env, builds the real deps, and calls the `provisionClient` orchestrator.
 * The web-app button (Phase 5) calls the same `provisionClient` — this CLI has no logic
 * of its own beyond arg parsing.
 *
 * Usage:
 *   tsx src/provision/cli.ts --site-id <uuid> --site-name "Acme" --org-id <uuid> \
 *     --tier business [--region sin] [--domain acme.aware-wave.com]
 *
 * Safety: defaults to dry-run. A real billable create requires BOTH
 * LOBSTER_SERVER_ADAPTER=hetzner_cloud AND LOBSTER_SERVER_PROVISION_ENABLED=true.
 */

import { provisionClient } from "./provisionClient";
import { buildServerAdapterFromEnv, serverTypeForTier } from "./serverAdapterFactory";

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

export async function runCli(argv: string[]): Promise<{ code: number; output: unknown }> {
  const args = parseArgs(argv);
  const siteId = args["site-id"];
  const siteName = args["site-name"];
  const organizationId = args["org-id"];
  const tier = args["tier"] ?? "business";
  const region = args["region"] ?? "sin";
  const domain = args["domain"];

  if (!siteId || !siteName || !organizationId) {
    return {
      code: 2,
      output: { error: "missing required args: --site-id, --site-name, --org-id" },
    };
  }

  const serverType = serverTypeForTier(tier);
  const serverAdapter = buildServerAdapterFromEnv({ region });

  // DNS deps only when both a domain and Cloudflare creds are present.
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfZone = process.env.CLOUDFLARE_ZONE_ID;
  const dns =
    domain && cfToken && cfZone
      ? { config: { apiToken: cfToken, zoneId: cfZone } }
      : undefined;

  const result = await provisionClient(
    { siteId, siteName, organizationId, region, serverType, domain },
    { serverAdapter, dns }
  );

  const code = result.status === "blocked" || result.status === "rolled_back" ? 1 : 0;
  return { code, output: { tier, serverType, region, ...result } };
}

// Direct-run entry (tsx). Guarded so importing this module for tests has no side effects.
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /cli\.(ts|js)$/.test(process.argv[1] ?? "");

if (isMain) {
  runCli(process.argv.slice(2))
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(r.output, null, 2));
      process.exit(r.code);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    });
}
