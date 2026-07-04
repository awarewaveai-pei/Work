"use client";

import { useState, useRef, useEffect } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";
import { IntakeFormSteps } from "@/lib/onboarding/intake-form-steps";

type TurnstileAPI = {
  render: (container: HTMLElement, opts: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};

function getTurnstile(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}

export default function PublicIntakePage() {
  const [flow, setFlow] = useState<"form" | "submitting" | "done" | "error">("form");
  const [formStep, setFormStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  // Load Turnstile script once on mount (no-op if not configured or already loaded).
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) return;
    if (document.getElementById("cf-turnstile-api")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-api";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Render / tear-down the Turnstile widget when entering / leaving step 5.
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || flow !== "form" || formStep !== 5) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const doRender = () => {
      const ts = getTurnstile();
      if (!ts || !turnstileContainerRef.current) return false;
      if (turnstileWidgetId.current != null) {
        try { ts.remove(turnstileWidgetId.current); } catch { /* already gone */ }
      }
      turnstileWidgetId.current = ts.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => {
          setTurnstileToken(null);
          const cur = turnstileWidgetId.current;
          if (cur != null) try { getTurnstile()?.reset(cur); } catch { /* ignore */ }
        },
        "error-callback": () => setTurnstileToken(null),
      });
      return true;
    };

    if (!doRender()) {
      interval = setInterval(() => {
        if (doRender()) { clearInterval(interval!); interval = null; }
      }, 300);
    }

    return () => {
      if (interval != null) clearInterval(interval);
      const ts = getTurnstile();
      if (ts && turnstileWidgetId.current != null) {
        try { ts.remove(turnstileWidgetId.current); } catch { /* already gone */ }
        turnstileWidgetId.current = null;
      }
      setTurnstileToken(null);
    };
  }, [flow, formStep]);

  const [form, setForm] = useState<Partial<IntakeForm>>({
    industry: "service",
    pages_needed: ["home", "about", "contact"],
    has_ecommerce: false,
    needs_crm: false,
    needs_booking: false,
    budget_tier: "business",
    language: "zh-TW",
    visual_style: ["professional"],
    logo_status: "will_provide",
    existing_content: "partial",
    launch_urgency: "no_rush",
  });

  const handleChange = (k: keyof IntakeForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  function validateStep(s: number): string | null {
    if (s === 1 && !form.company_name?.trim()) return "請填寫公司/品牌名稱";
    if (s === 3 && !form.pages_needed?.length) return "請至少選一個頁面";
    return null;
  }

  function nextStep() {
    const err = validateStep(formStep);
    if (err) { setError(err); return; }
    setError(null);
    setFormStep((s) => Math.min(s + 1, 5));
  }

  function prevStep() {
    setError(null);
    setFormStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    const err = validateStep(5);
    if (err) { setError(err); return; }
    if (!form.company_name?.trim() || !form.pages_needed?.length) {
      setError("請確認必填欄位已填寫（公司名稱、頁面）");
      return;
    }
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("請完成人機驗證");
      return;
    }
    setError(null);
    setFlow("submitting");

    try {
      const res = await fetch("/api/onboarding/intake-browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, turnstile_token: turnstileToken ?? undefined }),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: string; spec?: WebsiteSpec; retry_after_seconds?: number };
      try {
        data = JSON.parse(text);
      } catch {
        setError(`提交失敗：伺服器回應非預期（HTTP ${res.status}）`);
        setFlow("error");
        return;
      }
      if (res.status === 503 && data.error === "coming_soon") {
        setError("線上表單即將開放，請透過 Email 聯絡我們：hello@aware-wave.com");
        setFlow("error");
        return;
      }
      if (res.status === 429) {
        const wait = data.retry_after_seconds ? `請 ${Math.ceil(data.retry_after_seconds / 60)} 分鐘後再試。` : "";
        setError(`目前提交次數較多，${wait}`);
        setFlow("error");
        return;
      }
      if (data.error === "captcha_required" || data.error === "captcha_failed") {
        setError("人機驗證未通過，請重新完成驗證後提交");
        setFlow("error");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(`提交失敗：${data.error ?? `HTTP ${res.status}`}`);
        setFlow("error");
        return;
      }
      setSpec(data.spec ?? null);
      setFlow("done");
    } catch (e) {
      setError(`提交失敗：${e instanceof Error ? e.message : String(e)}`);
      setFlow("error");
    }
  }

  // ── Processing ────────────────────────────────────────────────
  if (flow === "submitting") {
    return (
      <div className="intake-page-wrap" style={{ minHeight: "100vh" }}>
        <div className="intake-card intake-processing">
          <div className="intake-processing-icon">🤖</div>
          <h2 className="intake-processing-title">Claude 正在分析您的需求</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            設計網站藍圖中，約 30 秒...
          </p>
          <div className="intake-processing-bar">
            <div className="intake-processing-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (flow === "error") {
    return (
      <div className="intake-page-wrap" style={{ minHeight: "100vh" }}>
        <div className="intake-card">
          <div className="intake-error-block">
            <strong>發生問題</strong>
            <p style={{ marginTop: "0.5rem" }}>{error}</p>
          </div>
          <button onClick={() => { setFlow("form"); setError(null); }} className="btn-primary" style={{ marginTop: "1rem" }}>
            重試
          </button>
        </div>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────
  if (flow === "done") {
    return (
      <div className="intake-page-wrap" style={{ minHeight: "100vh" }}>
        <div className="intake-card">
          <div className="intake-result-header">
            <span className="intake-result-icon">✓</span>
            <div>
              <h1 className="intake-result-title">感謝您的提交！</h1>
              <p className="intake-result-sub">我們的團隊將在 24 小時內與您聯絡</p>
            </div>
          </div>

          {spec && (
            <>
              <div className="intake-spec-block">
                <h2 style={{ fontWeight: 700, marginBottom: "0.25rem", fontSize: "1.1rem" }}>{spec.site_name}</h2>
                <p style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{spec.tagline}</p>
              </div>

              <div className="intake-spec-block">
                <h3 className="intake-spec-block-title">初步設計方向</h3>
                <p>{spec.design.style_direction}</p>
                <p style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>主色：</strong>
                  <span style={{ background: spec.design.primary_color, padding: "2px 10px", borderRadius: 4, color: "#fff", fontSize: "0.85rem" }}>{spec.design.primary_color}</span>
                  {spec.design.secondary_color && (
                    <>
                      <strong style={{ marginLeft: 6 }}>輔色：</strong>
                      <span style={{ background: spec.design.secondary_color, padding: "2px 10px", borderRadius: 4, color: "#fff", fontSize: "0.85rem" }}>{spec.design.secondary_color}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="intake-spec-block">
                <h3 className="intake-spec-block-title">建議頁面（{spec.sitemap.length} 頁）</h3>
                <ul style={{ paddingLeft: "1.5rem", columns: 2 }}>
                  {spec.sitemap.map((p) => (
                    <li key={p.slug}>{p.title}</li>
                  ))}
                </ul>
              </div>

              <div className="intake-spec-block">
                <h3 className="intake-spec-block-title">首頁標題方向</h3>
                <p><strong>{spec.homepage.hero.headline}</strong></p>
                <p style={{ color: "var(--text-secondary)" }}>{spec.homepage.hero.subheadline}</p>
              </div>
            </>
          )}

          <div className="intake-success-banner" style={{ marginTop: "1.5rem" }}>
            <strong>下一步</strong>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
              我們會依照您的需求準備詳細報價與時程，歡迎提前透過 Email 聯繫：
              <a href="mailto:hello@aware-wave.com" style={{ color: "var(--btn-primary-bg)", marginLeft: 4 }}>hello@aware-wave.com</a>
            </p>
          </div>

          <button
            onClick={() => { setFlow("form"); setFormStep(1); setSpec(null); setError(null); }}
            className="btn-secondary"
            style={{ marginTop: "1rem" }}>
            重新填寫
          </button>
        </div>
      </div>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────
  return (
    <div className="intake-page-wrap" style={{ minHeight: "100vh" }}>
      <div className="intake-page-head">
        <h1 className="intake-page-title">開始建立您的網站</h1>
        <p className="intake-page-sub">填完表單，AI 立即生成您的專屬網站藍圖</p>
      </div>

      <div className="intake-card">
        <IntakeFormSteps
          form={form}
          formStep={formStep}
          error={error}
          onChange={handleChange}
          onNext={nextStep}
          onPrev={prevStep}
          onSubmit={handleSubmit}
          submitLabel="提交需求 →"
          disabled={!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken}
          turnstileSlot={<div ref={turnstileContainerRef} />}
        />
      </div>
    </div>
  );
}
