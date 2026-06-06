/**
 * Server-provisioning (machine layer) contracts. Sits BELOW the staging/site layer
 * (`types.ts`): the machine layer rents + hardens a host, then hands `sshHost`/`ipv4`
 * to the site layer (`resolveStagingProvisioning`) and `wp-install-plugins`.
 *
 * Discriminated by `outcome` — same convention as `StagingHostingProvisionResult`
 * in `types.ts`, so a single switch covers both layers.
 *
 * Secrets rule: a ref NEVER carries a credential value. `sshCredentialsRef` is a
 * vault pointer (e.g. `vault://LOBSTER_SSH_KEY_<REF>`), resolved at use-time only.
 */

/** A provisioned host's stable, non-secret identity. */
export type ProvisionedServerRef = {
  /** Adapter that produced this ref ("mock" | "hetzner_cloud" | future vendors). */
  adapter: string;
  /** Vendor server id (Hetzner numeric id as string), used for idempotency + teardown. */
  serverId: string;
  ipv4: string;
  ipv6?: string;
  /** Host to SSH into (usually === ipv4 until DNS is attached). */
  sshHost: string;
  /** Vault pointer to the per-tenant SSH key — never the key itself. */
  sshCredentialsRef: string;
  region: string;
  serverType: string;
  /** Filesystem root the site layer installs WordPress into. */
  wpRootPath: string;
  provisioningNotes: string[];
};

export type MockServerRef = ProvisionedServerRef & { adapter: "mock" };

/**
 * What a dry-run would have sent to the vendor — non-secret request summary.
 * Lets operators preview a billable create without spending money.
 */
export type ServerProvisionPlan = {
  adapter: string;
  serverType: string;
  region: string;
  image: string;
  labels: Record<string, string>;
  /** cloud-init size in bytes (must stay <= 32768 for Hetzner). */
  cloudInitBytes: number;
  notes: string[];
};

/**
 * Single result of `resolveServerProvisioning`. The FULL union is defined upfront so
 * downstream consumers code against a stable contract even before every adapter exists.
 */
export type ServerProvisionResult =
  | { outcome: "idle" }
  | { outcome: "mock"; ref: MockServerRef }
  | { outcome: "provisioned"; ref: ProvisionedServerRef }
  /** Idempotency (C2): an existing server matched the site label — reused, not re-created. */
  | { outcome: "reused"; ref: ProvisionedServerRef }
  /** Env-gate dry-run: validated + rendered, but no billable API call was made. */
  | { outcome: "dry_run"; plan: ServerProvisionPlan }
  /** M9: a mid-provision failure was compensated (server destroyed / marked orphan). */
  | { outcome: "rolled_back"; serverId?: string; message: string }
  | { outcome: "blocked"; adapter: string; message: string; missingEnv: string[] };
