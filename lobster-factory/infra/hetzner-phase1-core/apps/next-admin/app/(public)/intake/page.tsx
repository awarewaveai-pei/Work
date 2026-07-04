"use client";

import { useState } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";
import { IntakeFormSteps } from "@/lib/onboarding/intake-form-steps";

export default function PublicIntakePage() {
  const [flow, setFlow] = useState<"form" | "submitting" | "done" | "error">("form");
  const [formStep, setFormStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);

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
    setError(null);
    setFlow("submitting");

    try {
      const res = await fetch("/api/onboarding/intake-browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form }),
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
      if (res.status === 429) {
        const wait = data.retry_after_seconds ? `請 ${Math.ceil(data.retry_after_seconds / 60)} 分鐘後再試。` : "";
        setError(`目前提交次數較多，${wait}`);
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
        />
      </div>
    </div>
  );
}
