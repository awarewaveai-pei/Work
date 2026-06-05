import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

// /login is exempt from the auth gate (see middleware.ts). It renders a full-viewport
// overlay (position:fixed) so the root-layout sidebar shell is covered — the operator
// sees a clean login screen, not the admin chrome they aren't authenticated for yet.
export const dynamic = "force-dynamic";

export default function LoginPage() {
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
