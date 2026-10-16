import { SetPasswordForm } from "./SetPasswordForm";

// The page a mailed account link opens (lib/accounts/client-invite.ts). Under /login, so the middleware matcher skips
// it on every door: the person has no session yet. Same full-viewport frame as /login.
export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
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
      <SetPasswordForm />
    </div>
  );
}
