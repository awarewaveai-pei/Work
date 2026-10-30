"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

// Same open-redirect guard as the admin console's LoginForm.tsx, default target is the
// portal launcher (not "/", which would be the admin console's home).
//
// Browser-visible paths here are always UNPREFIXED ("/launcher", not "/portal/launcher") --
// nginx's idempotent rewrite (§7) adds the /portal/ prefix transparently on every request from
// the browser. middleware.ts's own redirect (?next=) will sometimes hand back the *internal*
// prefixed form since that's what it sees post-rewrite -- safeNext() accepts either shape
// because the idempotent rewrite makes both resolve correctly, but literals we control here
// stay unprefixed for a clean address bar.
function safeNext(raw: string | null): string {
  if (raw && /^\/[^/\\]/.test(raw)) return raw;
  return "/launcher";
}

/** signupUrl: where an account is made -- aware-wave.com's member page (WordPress), the only registration door. */
export function PortalLoginForm({ signupUrl }: { signupUrl: string }) {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        setError("登入失敗：帳號或密碼不正確。");
        setBusy(false);
        return;
      }
      // Full-page navigation, not router.replace — same reason as the admin console's
      // LoginForm: the just-set session cookie must ride a real request for middleware
      // to see it. The idempotent nginx rewrite (§7) means this is safe to land on
      // "/portal/launcher" even though this page's own URL is already rewritten.
      window.location.assign(next);
    } catch {
      setError("登入時發生未預期的錯誤，請稍後再試。");
      setBusy(false);
    }
  }

  return (
    <form className="form-block" style={{ maxWidth: 380, width: "100%" }} onSubmit={onSubmit}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
          AwareWave
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>客戶登入</p>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="portal-login-email">Email</label>
        <input
          id="portal-login-email"
          className="form-input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="portal-login-password">密碼</label>
        <input
          id="portal-login-password"
          className="form-input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: "var(--badge-red-text)", margin: "4px 0 12px" }}>{error}</div>
      )}

      <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "登入中…" : "登入"}
      </button>

      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 16, textAlign: "center" }}>
        還沒有帳號？<a href={signupUrl}>到 aware-wave.com 註冊</a>
      </p>
    </form>
  );
}
