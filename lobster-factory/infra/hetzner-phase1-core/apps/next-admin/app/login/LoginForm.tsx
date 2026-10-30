"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

// Sanitise the post-login redirect target: only same-origin absolute paths, never an
// off-site URL (open-redirect guard). Must be "/" followed by a non-slash, non-backslash
// char — rejects "//evil.com", "/\evil.com", "https://…", "" → "/".
function safeNext(raw: string | null): string {
  if (raw && /^\/[^/\\]/.test(raw)) return raw;
  return "/";
}

/** Staff host: the admin console heading. A product door: the product's own name and, first, the way its customers come
 *  in -- from aware-wave.com, with no app password (lib/auth/door-link.ts); the form stays for accounts staff invited. */
import type { LoginDoor } from "@/lib/portal/login-door";

export function LoginForm({ door = null }: { door?: LoginDoor } = {}) {
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
      // Full-page navigation: the session cookie the browser client just set is sent on this
      // real request so the middleware authenticates it. A soft router.replace() against the
      // auth-gated target can hang or loop because the new cookie isn't picked up.
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
          {door ? door.product : "Lobster Factory"}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{door ? "登入" : "Admin Console 登入"}</p>
      </div>
      {door ? (
        <div style={{ marginBottom: 20 }}>
          <a href={door.memberHref} className="btn-primary" style={{ display: "block", textAlign: "center" }}>從 aware-wave.com 進入</a>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
            在 aware-wave.com 註冊或登入後，到「我的帳號」按這個產品的「進入」，不需要另外的密碼。下面的表單只給收到邀請信、設過密碼的帳號使用。
          </p>
        </div>
      ) : null}

      <div className="form-row">
        <label className="form-label" htmlFor="login-email">Email</label>
        <input
          id="login-email"
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
        <label className="form-label" htmlFor="login-password">密碼</label>
        <input
          id="login-password"
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
    </form>
  );
}
