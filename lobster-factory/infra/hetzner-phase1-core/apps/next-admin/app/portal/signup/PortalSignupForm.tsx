"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SIGNUP_PRODUCT, SELF_SIGNUP_PRODUCTS, type ProductKey } from "@/lib/portal/products";

// Browser-visible paths here are unprefixed ("/api/signup", not "/portal/api/signup") --
// nginx's idempotent rewrite (PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §7) adds the /portal/
// prefix transparently on every request originating from the browser.
const SIGNUP_ENDPOINT = "/api/signup";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => void;
    };
  }
}

/** Loads the Cloudflare Turnstile widget only when a site key is configured; no-op otherwise. */
function useTurnstile(onToken: (token: string) => void) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!siteKey || !containerEl) return;
    const scriptId = "cf-turnstile-script";
    function renderWidget() {
      window.turnstile?.render(containerEl!, { sitekey: siteKey!, callback: onToken });
    }
    if (window.turnstile) {
      renderWidget();
      return;
    }
    if (document.getElementById(scriptId)) return;
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, [siteKey, containerEl, onToken]);

  return { siteKey, setContainerEl };
}

export function PortalSignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [productKey, setProductKey] = useState<ProductKey>(DEFAULT_SIGNUP_PRODUCT);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { siteKey, setContainerEl } = useTurnstile(setTurnstileToken);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(SIGNUP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          org_name: orgName.trim(),
          product_key: productKey,
          turnstile_token: turnstileToken ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(signupErrorMessage(data.error, res.status));
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("建立帳號時發生未預期的錯誤，請稍後再試。");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>帳號建立完成</h1>
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 16 }}>
          請用剛剛設定的 email 跟密碼登入。
        </p>
        <a href="/login" className="btn-primary">前往登入</a>
      </div>
    );
  }

  return (
    <form className="form-block" style={{ maxWidth: 380, width: "100%" }} onSubmit={onSubmit}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
          建立帳號
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>AwareWave 客戶入口</p>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="signup-org-name">組織名稱</label>
        <input
          id="signup-org-name"
          className="form-input"
          type="text"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
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
        <label className="form-label" htmlFor="signup-password">密碼（至少 8 碼）</label>
        <input
          id="signup-password"
          className="form-input"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="signup-product">想使用的產品</label>
        <select
          id="signup-product"
          className="form-input"
          value={productKey}
          onChange={(e) => setProductKey(e.target.value as ProductKey)}
          disabled={busy}
        >
          {SELF_SIGNUP_PRODUCTS.map((p) => (
            <option key={p.key} value={p.key}>{p.name}</option>
          ))}
        </select>
      </div>

      {siteKey && <div ref={setContainerEl} style={{ margin: "8px 0" }} />}

      {error && (
        <div style={{ fontSize: 12.5, color: "var(--badge-red-text)", margin: "4px 0 12px" }}>{error}</div>
      )}

      <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={busy}>
        {busy ? "建立中…" : "建立帳號"}
      </button>

      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 16, textAlign: "center" }}>
        已經有帳號？<a href="/login">登入</a>
      </p>
    </form>
  );
}

function signupErrorMessage(error: string | undefined, status: number): string {
  switch (error) {
    case "coming_soon":
      return "註冊尚未開放。";
    // No "email_already_registered" case: the route deliberately never returns this distinct
    // error (critic finding M5, 2026-08-29) -- a duplicate email gets the same ok:true response
    // as a fresh signup, so an anonymous caller can't use this form to enumerate registered
    // emails (the Supabase Auth project behind it also holds staff admin-console accounts).
    case "rate_limited":
      return "嘗試次數過多，請稍後再試。";
    case "captcha_required":
    case "captcha_failed":
      return "驗證失敗，請重新整理頁面再試一次。";
    case "invalid_input":
      return "請確認組織名稱、email、密碼（至少 8 碼）都已正確填寫。";
    default:
      return status === 503 ? "服務暫時無法使用，請稍後再試。" : "建立帳號失敗，請稍後再試。";
  }
}
