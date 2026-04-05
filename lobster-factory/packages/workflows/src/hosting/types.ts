/**
 * Hosting adapter contracts (Phase 1). Real providers implement the same shape later.
 */
export type MockStagingSiteRef = {
  adapter: "mock";
  environmentId: string;
  wpRootPath: string;
  stagingSiteUrl: string;
  wpAdminUrl: string;
  provisioningNotes: string[];
};

/** Same shape as mock ref; `adapter` names the mode (e.g. http_json). */
export type VendorStagingSiteRef = {
  adapter: string;
  environmentId: string;
  wpRootPath: string;
  stagingSiteUrl: string;
  wpAdminUrl: string;
  provisioningNotes: string[];
};

/**
 * Result of `resolveStagingProvisioning` (single entry for create-wp-site).
 */
export type StagingHostingProvisionResult =
  | { outcome: "idle" }
  | { outcome: "mock"; ref: MockStagingSiteRef }
  | { outcome: "provisioned"; ref: VendorStagingSiteRef }
  | {
      outcome: "blocked";
      adapter: string;
      message: string;
      missingEnv: string[];
    };
