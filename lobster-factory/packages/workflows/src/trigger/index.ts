// v20260521 — hook auto-deploy test v2
export { recordTenantIntegration } from "./record-tenant-integration";
export { orchestrateTenantProvisioning } from "./orchestrate-tenant-provisioning";
export { createWpSite } from "./create-wp-site";
export { applyManifest } from "./apply-manifest";
export { dispatchActionRun, dispatchActionRunSchedule } from "./dispatch-action-run";
export { aoInfrastructureCheck, aoInfrastructureCheckSchedule } from "./ao-infrastructure-check";
export { adoptClientOs } from "./adopt-client-os";
export { wpInstallPlugins } from "../tasks/wp-install-plugins";
