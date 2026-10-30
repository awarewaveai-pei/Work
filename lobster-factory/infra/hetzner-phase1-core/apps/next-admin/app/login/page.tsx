import { Suspense } from "react";
import { headers } from "next/headers";
import { loginDoor } from "@/lib/portal/login-door";
import { LoginForm } from "./LoginForm";

// /login is a top-level route outside the (shell) route group, so it renders with no
// sidebar at all. The full-viewport overlay is kept for visual clarity (fills the body-bg).
// See middleware.ts matcher — /login is excluded from the session gate.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const h = await headers();
  const door = loginDoor(h.get("x-forwarded-host") ?? h.get("host") ?? "");
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
        <LoginForm door={door} />
      </Suspense>
    </div>
  );
}
