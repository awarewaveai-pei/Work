import { redirect } from "next/navigation";

// /ops-console retired 2026-06-05 (Onboarding/Provisioning IA consolidation — Phase 1).
// It duplicated /ops/clients (tenants snapshot), /build (workflow runs) and /onboard's
// department selector, plus an unfinished AI-image-job form. Redirect to the canonical page.
// The components (DepartmentSelector / AiJobForm / TenantConfigForm / OpsConsoleTelemetry)
// remain in this folder for /onboard + future use — only this ROUTE is retired.
// Plan: agency-os/docs/operations/APP_AWARE_WAVE_ONBOARDING_IA_PLAN.md
// Rollback: git checkout HEAD~1 -- app/ops-console/page.tsx
export const dynamic = "force-dynamic";

export default function OpsConsolePage() {
  redirect("/ops/clients");
}
