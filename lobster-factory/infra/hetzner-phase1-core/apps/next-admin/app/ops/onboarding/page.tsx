"use client";

import { useState } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";

export default function OnboardingPage() {
  const [step, setStep] = useState<"form" | "submitting" | "generating" | "done" | "error">("form");
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<IntakeForm>>({
    industry: "service",
    primary_goal: ["brand"],
    pages_needed: ["home", "about", "contact"],
    has_ecommerce: false,
    budget_tier: "business",
    language: "zh-TW",
    visual_style: ["professional"],
    existing_content: "partial",
    launch_urgency: "no_rush",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("submitting");

    // Step 1: submit intake form
    const submitRes = await fetch("/api/onboarding/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form }),
    });
    const submitData = await submitRes.json();
    if (!submitData.ok) {
      setError(`Submit failed: ${submitData.error}`);
      setStep("error");
      return;
    }
    setIntakeId(submitData.intake_form_id);
    setStep("generating");

    // Step 2: generate spec via Claude
    const genRes = await fetch("/api/onboarding/generate-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake_form_id: submitData.intake_form_id }),
    });
    const genData = await genRes.json();
    if (!genData.ok) {
      setError(`Spec generation failed: ${genData.error}`);
      setStep("error");
      return;
    }
    setSpec(genData.spec);
    setStep("done");
  }

  const set = (k: keyof IntakeForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (step === "done" && spec) {
    return (
      <div style={{ padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          ✅ 規格生成完成
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
          Intake Form ID: <code>{intakeId}</code>
        </p>

        <div style={{ background: "var(--color-bg-secondary)", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" }}>
          <h2 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>{spec.site_name}</h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>{spec.tagline}</p>
          <p><strong>Package:</strong> {spec.package_slug} | <strong>Packs:</strong> {spec.packs.join(", ")}</p>
        </div>

        <div style={{ background: "var(--color-bg-secondary)", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" }}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>設計方向</h3>
          <p>{spec.design.style_direction}</p>
          <p><strong>主色：</strong><span style={{ background: spec.design.primary_color, padding: "2px 12px", borderRadius: 4, color: "#fff", marginLeft: 8 }}>{spec.design.primary_color}</span></p>
          <p><strong>字體：</strong>{spec.design.font_suggestion}</p>
        </div>

        <div style={{ background: "var(--color-bg-secondary)", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" }}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>網站地圖（{spec.sitemap.length} 頁）</h3>
          <ul style={{ paddingLeft: "1.5rem" }}>
            {spec.sitemap.map((p) => (
              <li key={p.slug}>{p.title} <span style={{ color: "var(--color-text-secondary)" }}>/{p.slug}</span></li>
            ))}
          </ul>
        </div>

        <div style={{ background: "var(--color-bg-secondary)", borderRadius: 8, padding: "1.5rem", marginBottom: "1rem" }}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>首頁 Hero</h3>
          <p><strong>標題：</strong>{spec.homepage.hero.headline}</p>
          <p><strong>副標：</strong>{spec.homepage.hero.subheadline}</p>
          <p><strong>CTA：</strong>{spec.homepage.hero.cta_text}</p>
        </div>

        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>完整 JSON 規格</summary>
          <pre style={{ background: "#1a1a2e", color: "#e8e8e8", padding: "1rem", borderRadius: 8, overflow: "auto", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
        </details>

        <button
          onClick={() => { setStep("form"); setSpec(null); setIntakeId(null); }}
          style={{ marginTop: "1.5rem", padding: "0.5rem 1.5rem", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          建立另一個
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>新客戶建站</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "2rem" }}>填完表單後 Claude 自動生成完整網站規格</p>

      {(step === "submitting" || step === "generating") && (
        <div style={{ padding: "2rem", textAlign: "center", background: "var(--color-bg-secondary)", borderRadius: 8, marginBottom: "1rem" }}>
          <p style={{ fontSize: "1.1rem" }}>
            {step === "submitting" ? "⏳ 儲存表單中..." : "🤖 Claude 正在生成規格（約 30 秒）..."}
          </p>
        </div>
      )}

      {step === "error" && (
        <div style={{ padding: "1rem", background: "#fee", border: "1px solid #f88", borderRadius: 8, marginBottom: "1rem" }}>
          <strong>錯誤：</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>公司/品牌名稱 *</span>
          <input required value={form.company_name ?? ""} onChange={e => set("company_name", e.target.value)}
            placeholder="例：AwareWave" style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>品牌標語（選填）</span>
          <input value={form.brand_tagline ?? ""} onChange={e => set("brand_tagline", e.target.value)}
            placeholder="一句話定位" style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>產業類別 *</span>
          <select value={form.industry} onChange={e => set("industry", e.target.value)} style={inputStyle}>
            <option value="service">服務業</option>
            <option value="ecommerce">電商</option>
            <option value="tourism">觀光旅遊</option>
            <option value="arts">藝術創作</option>
            <option value="education">教育</option>
            <option value="other">其他</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>主要客群（選填）</span>
          <textarea value={form.target_audience ?? ""} onChange={e => set("target_audience", e.target.value)}
            placeholder="描述你的目標客戶" style={{ ...inputStyle, height: 80, resize: "vertical" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>預算級別 *</span>
          <select value={form.budget_tier} onChange={e => set("budget_tier", e.target.value as IntakeForm["budget_tier"])} style={inputStyle}>
            <option value="starter">Starter（基本品牌站）</option>
            <option value="business">Business（品牌 + CRM）</option>
            <option value="enterprise">Enterprise（全功能）</option>
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>需要電商功能？</span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={form.has_ecommerce} onChange={e => set("has_ecommerce", e.target.checked)} />
            是，需要線上販售
          </label>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>需要 CRM / 客戶名單管理？</span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={form.needs_crm} onChange={e => set("needs_crm", e.target.checked)} />
            是，需要 FluentCRM
          </label>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>聯絡 Email（選填）</span>
          <input type="email" value={form.contact_email ?? ""} onChange={e => set("contact_email", e.target.value)}
            placeholder="hello@company.com" style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>現有網域（選填）</span>
          <input value={form.domain ?? ""} onChange={e => set("domain", e.target.value)}
            placeholder="company.com（無則留空）" style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>參考網站（選填，最多 3 個）</span>
          <input value={(form.reference_sites ?? []).join(", ")}
            onChange={e => set("reference_sites", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="https://example.com, https://another.com" style={inputStyle} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>主色（選填）</span>
          <input value={form.primary_color ?? ""} onChange={e => set("primary_color", e.target.value)}
            placeholder="#1a1a2e 或「深藍色」" style={inputStyle} />
        </label>

        <button
          type="submit"
          disabled={step === "submitting" || step === "generating"}
          style={{ padding: "0.75rem", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: "1rem", cursor: "pointer" }}
        >
          {step === "submitting" || step === "generating" ? "處理中..." : "生成網站規格 →"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: "0.9rem",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
};
