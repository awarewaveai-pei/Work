/**
 * Successful provision must be safe to pass into `apply-manifest` input
 * (`environmentId`, `wpRootPath`, URLs for operators).
 */
export type SuccessfulStagingProvision = {
  adapter: string;
  environmentId: string;
  wpRootPath: string;
  stagingSiteUrl: string;
  wpAdminUrl: string;
  provisioningNotes: string[];
};

export type StagingProvisionBlocked = {
  blocked: true;
  adapter: string;
  message: string;
  missingEnv: string[];
};

/**
 * Contract for a real hosting vendor module (`providers/<vendor>.ts`).
 * Wire into `resolveStagingProvisioning` when the adapter mode is enabled.
 * Generic HTTP: see `httpJsonStagingAdapter.ts` (`LOBSTER_HOSTING_ADAPTER=http_json`).
 */
export type StagingProvisionAdapter = {
  readonly id: string;
  provisionStaging(input: {
    organizationId: string;
    siteId: string;
    siteName: string;
  }): Promise<SuccessfulStagingProvision | StagingProvisionBlocked>;
};
