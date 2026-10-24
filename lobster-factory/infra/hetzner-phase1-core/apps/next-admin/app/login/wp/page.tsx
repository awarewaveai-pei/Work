import { WpSignIn } from "./WpSignIn";

// Where aware-wave.com sends a member who pressed 「進入」 (lib/auth/sources/awarewave-wp.ts). Under /login, so the
// middleware matcher skips it on every door: the person has no session on this door yet. Same frame as /login.
export const dynamic = "force-dynamic";

export default function WpSignInPage() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--body-bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <WpSignIn />
    </div>
  );
}
