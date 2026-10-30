import { Suspense } from "react";
import { PortalLoginForm } from "./PortalLoginForm";
import { baseDomain } from "@/lib/portal/hosts";

// Reached as portal.aware-wave.com/login, rewritten by nginx to /portal/login (idempotent
// rewrite — see PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §7). Session-gate-exempt via
// middleware.ts's PORTAL_PUBLIC_PATHS — checked inside the middleware function body, NOT a
// matcher exclusion (a matcher exclusion would skip isWrongHostForPortal() too; see the
// comment on isWrongHostForPortal in middleware.ts for why that distinction matters).
export const dynamic = "force-dynamic";

export default function PortalLoginPage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "var(--body-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Suspense fallback={null}>
        <PortalLoginForm signupUrl={`https://${baseDomain()}/my-account/`} />
      </Suspense>
    </div>
  );
}
