"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

// Sanitise the post-login redirect target: only same-origin absolute paths, never an
// off-site URL (open-redirect guard). "//evil.com" and "https://…" are rejected → "/".
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export function LoginForm() {
  const router = useRouter();
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
      // Cookies are now set by the browser client; navigate and re-render server components.
      router.replace(next);
      router.refresh();
    } catch {
      setError("登入時發生未預期的錯誤，請稍後再試。");
      setBusy(false);
    }
  }

  return (
    <form className="form-block" style={{ maxWidth: 380, width: "100%" }} onSubmit={onSubmit}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
          Lobster Factory
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Admin Console 登入</p>
      </div>

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
        <div style={{ fontSize: 12.5, color: "#991b1b", margin: "4px 0 12px" }}>{error}</div>
      )}

      <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
