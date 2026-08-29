import { Suspense } from "react";
import { PortalSignupForm } from "./PortalSignupForm";

// Reached as portal.aware-wave.com/signup, rewritten by nginx to /portal/signup.
// Session-gate-exempt via middleware.ts's PORTAL_PUBLIC_PATHS (checked in the function body,
// not a matcher exclusion -- see middleware.ts), same as /portal/login -- nobody has a session
// yet.
export const dynamic = "force-dynamic";

export default function PortalSignupPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Suspense fallback={null}>
        <PortalSignupForm />
      </Suspense>
    </div>
  );
}
