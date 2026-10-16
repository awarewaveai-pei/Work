"use client";

// verifyOtp is what sets auth.users.email_confirmed_at (the proof 0103 social_add_member requires), so it runs only
// when the person presses the button -- a mail scanner that merely opens the link cannot use it up.
// If the password save fails after the link was used, the session from verifyOtp stays: a retry, or a reload (the
// fragment is gone by then), sets the password on that session without the link.
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";
import { ACCOUNT_COPY as C } from "@/lib/accounts/invite-copy";

// every mailed link is GoTrue type "recovery" (lib/accounts/client-invite.ts header)
type Link = { tokenHash: string } | "session";
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores the rest

function readLink(): { tokenHash: string } | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const tokenHash = params.get("token_hash") ?? "";
  return tokenHash && params.get("type") === "recovery" ? { tokenHash } : null;
}

export function SetPasswordForm() {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [verified, setVerified] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const fromMailTaken = useRef(false);

  useEffect(() => {
    // a link opened while this page is already open only changes the fragment: no reload, so listen for it too
    const take = (): boolean => {
      const fromMail = readLink();
      if (!fromMail) return false;
      // keep the one-time token out of history, screenshots and anything that reads the address bar later
      // (PostHog and Sentry also strip URL fragments: providers.tsx, sentry.client.config.ts)
      window.history.replaceState(null, "", window.location.pathname);
      fromMailTaken.current = true;
      setLink(fromMail);
      setVerified(false);
      setError(null);
      return true;
    };
    window.addEventListener("hashchange", take);
    // once: a second run (React StrictMode in dev) would find the fragment already cleared
    if (!started.current) {
      started.current = true;
      if (!take()) {
        createSupabaseBrowserClient()
          .auth.getUser()
          .then(({ data }) => {
            if (fromMailTaken.current) return; // a mailed link arrived meanwhile: it wins over the old session
            setLink(data.user ? "session" : null);
            if (data.user) setVerified(true);
          })
          .catch(() => {
            if (!fromMailTaken.current) setLink(null);
          });
      }
    }
    return () => window.removeEventListener("hashchange", take);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!link) return;
    if (pw.length < 8) return setError(C.err_pw_short);
    if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) return setError(C.err_pw_too_long);
    if (pw !== pw2) return setError(C.err_pw_mismatch);
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    if (!verified && link !== "session") {
      const { error: vErr } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: link.tokenHash });
      if (vErr) {
        setBusy(false);
        return setError(C.err_link_invalid);
      }
      setVerified(true);
    }
    const { error: uErr } = await supabase.auth.updateUser({ password: pw });
    if (uErr) {
      setBusy(false);
      return setError(
        uErr.code === "weak_password" ? C.err_pw_weak : uErr.code === "same_password" ? C.err_pw_same : C.err_save_failed,
      );
    }
    setDone(true);
    // full navigation so the middleware reads the new session cookie on this door
    window.setTimeout(() => window.location.assign("/"), 1200);
  }

  return (
    <form className="form-block" style={{ maxWidth: 380, width: "100%" }} onSubmit={onSubmit}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>{C.page_title}</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{C.page_intro}</p>
      </div>

      {link === null && !done && (
        <div style={{ fontSize: 12.5, color: "var(--badge-red-text)", margin: "4px 0 12px" }}>{C.err_no_token}</div>
      )}

      {link && !done && (
        <>
          <div className="form-row">
            <label className="form-label" htmlFor="new-password">{C.pw_label}</label>
            <input
              id="new-password"
              className="form-input"
              type="password"
              autoComplete="new-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
            />
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>{C.pw_hint}</div>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="new-password-2">{C.pw2_label}</label>
            <input
              id="new-password-2"
              className="form-input"
              type="password"
              autoComplete="new-password"
              required
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && <div style={{ fontSize: 12.5, color: "var(--badge-red-text)", margin: "4px 0 12px" }}>{error}</div>}
          <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={busy}>
            {busy ? C.submitting : C.submit}
          </button>
        </>
      )}

      {done && <div style={{ fontSize: 13, color: "var(--green)" }}>{C.done}</div>}
    </form>
  );
}
