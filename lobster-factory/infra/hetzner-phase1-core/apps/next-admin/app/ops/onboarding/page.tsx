"use client";

import { useState } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";

const STEPS = [
  { num: 1, label: "公司 & 品牌", duration: "2 min" },
  { num: 2, label: "客群 & 目標", duration: "1 min" },
  { num: 3, label: "功能需求", duration: "2 min" },
  { num: 4, label: "視覺 & 參考", duration: "2 min" },
  { num: 5, label: "素材 & 時程", duration: "1 min" },
];

const PRIMARY_GOALS = [
  { value: "brand", label: "品牌展示" },
  { value: "sell", label: "線上販售" },
  { value: "booking", label: "預約服務" },
  { value: "blog", label: "內容部落格" },
  { value: "card_site", label: "名片站" },
];

const PAGES = [
  { value: "home", label: "首頁" },
  { value: "about", label: "關於" },
  { value: "products", label: "產品/服務" },
  { value: "blog", label: "部落格" },
  { value: "contact", label: "聯絡" },
  { value: "cart", label: "購物車" },
  { value: "booking", label: "預約" },
];

const PRODUCT_TYPES = [
  { value: "physical", label: "實體商品" },
  { value: "digital", label: "數位商品" },
  { value: "pod", label: "客製商品 (POD)" },
  { value: "booking", label: "服務預約" },
];

const VISUAL_STYLES = [
  { value: "minimal", label: "極簡" },
  { value: "warm", label: "溫暖" },
  { value: "professional", label: "專業" },
  { value: "playful", label: "活潑" },
  { value: "luxury", label: "奢華" },
];

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

export default function OnboardingPage() {
  const [flow, setFlow] = useState<"form" | "submitting" | "generating" | "done" | "triggering" | "triggered" | "error">("form");
  const [formStep, setFormStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [websiteSpecId, setWebsiteSpecId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<IntakeForm>>({
    industry: "service",
    primary_goal: ["brand"],
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

  const set = (k: keyof IntakeForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  function validateStep(s: number): string | null {
    if (s === 1 && !form.company_name?.trim()) return "請填寫公司/品牌名稱";
    if (s === 2 && !form.primary_goal?.length) return "請至少選一個主要目標";
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
    if (!form.company_name?.trim() || !form.primary_goal?.length || !form.pages_needed?.length) {
      setError("請確認必填欄位已填寫（公司名稱、目標、頁面）");
      return;
    }
    setError(null);
    setFlow("submitting");

    const submitRes = await fetch("/api/onboarding/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form }),
    });
    const submitData = await submitRes.json();
    if (!submitData.ok) {
      setError(`Submit failed: ${submitData.error}`);
      setFlow("error");
      return;
    }
    setIntakeId(submitData.intake_form_id);
    setFlow("generating");

    const genRes = await fetch("/api/onboarding/generate-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake_form_id: submitData.intake_form_id }),
    });
    const genData = await genRes.json();
    if (!genData.ok) {
      setError(`Spec generation failed: ${genData.error}`);
      setFlow("error");
      return;
    }
    setSpec(genData.spec);
    setWebsiteSpecId(genData.website_spec_id ?? null);
    setFlow("done");
  }

  async function handleTriggerBuild() {
    if (!websiteSpecId || !intakeId) return;
    setError(null);
    setFlow("triggering");
    const res = await fetch("/api/onboarding/trigger-build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website_spec_id: websiteSpecId, intake_form_id: intakeId }),
    });
    const data = await res.json();
    if (!data.ok) {
      setError(`觸發建站失敗：${data.error}${data.details ? ` — ${data.details}` : ""}`);
      setFlow("done");
      return;
    }
    setRunId(data.run_id);
    setFlow("triggered");
  }

  // ── Spec result view ──────────────────────────────────────────
  if ((flow === "done" || flow === "triggering" || flow === "triggered") && spec) {
    return (
      <div style={{ padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>✅ 規格生成完成</h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>
          Intake Form ID: <code>{intakeId}</code>
        </p>
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{spec.site_name}</h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>{spec.tagline}</p>
          <p><strong>Package:</strong> {spec.package_slug} | <strong>Packs:</strong> {spec.packs.join(", ")}</p>
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>設計方向</h3>
          <p>{spec.design.style_direction}</p>
          <p style={{ marginTop: "0.5rem" }}>
            <strong>主色：</strong>
            <span style={{ background: spec.design.primary_color, padding: "2px 10px", borderRadius: 4, color: "#fff", marginLeft: 6, fontSize: "0.85rem" }}>{spec.design.primary_color}</span>
          </p>
          <p><strong>字體：</strong>{spec.design.font_suggestion}</p>
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>網站地圖（{spec.sitemap.length} 頁）</h3>
          <ul style={{ paddingLeft: "1.5rem", columns: 2 }}>
            {spec.sitemap.map((p) => (
              <li key={p.slug}>{p.title} <span style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>/{p.slug}</span></li>
            ))}
          </ul>
        </div>
        <div style={cardStyle}>
          <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>首頁 Hero</h3>
          <p><strong>標題：</strong>{spec.homepage.hero.headline}</p>
          <p><strong>副標：</strong>{spec.homepage.hero.subheadline}</p>
          <p><strong>CTA：</strong>{spec.homepage.hero.cta_text}</p>
        </div>
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0" }}>完整 JSON 規格</summary>
          <pre style={{ background: "#1a1a2e", color: "#e8e8e8", padding: "1rem", borderRadius: 8, overflow: "auto", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
        </details>

        {flow === "triggered" && runId ? (
          <div style={{ marginTop: "1.5rem", padding: "1rem 1.5rem", background: "#e8f5e9", border: "1px solid #4caf50", borderRadius: 8 }}>
            <strong>✅ 已排入建站佇列</strong>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#333" }}>Run ID：<code>{runId}</code></p>
            <a href="/build" style={{ display: "inline-block", marginTop: "0.75rem", color: "var(--color-accent)", fontWeight: 600 }}>
              前往 /build 查看進度 →
            </a>
          </div>
        ) : (
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {error && <p style={{ width: "100%", color: "#c62828", background: "#fee", padding: "0.75rem", borderRadius: 6, margin: 0 }}>{error}</p>}
            <button onClick={handleTriggerBuild} disabled={flow === "triggering"}
              style={{ ...btnStyle, background: "#2e7d32" }}>
              {flow === "triggering" ? "排入中..." : "觸發建站 →"}
            </button>
            <button onClick={() => { setFlow("form"); setFormStep(1); setSpec(null); setIntakeId(null); setWebsiteSpecId(null); setRunId(null); setError(null); }}
              style={{ ...btnStyle, background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}>
              建立另一個
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Processing state ──────────────────────────────────────────
  if (flow === "submitting" || flow === "generating") {
    return (
      <div style={{ padding: "4rem 2rem", maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{flow === "submitting" ? "⏳" : "🤖"}</div>
        <h2 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
          {flow === "submitting" ? "儲存表單中..." : "Claude 正在生成規格"}
        </h2>
        <p style={{ color: "var(--color-text-secondary)" }}>
          {flow === "generating" ? "分析需求、設計網站藍圖，約 30 秒..." : ""}
        </p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (flow === "error") {
    return (
      <div style={{ padding: "2rem", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ padding: "1rem", background: "#fee", border: "1px solid #f88", borderRadius: 8, marginBottom: "1rem" }}>
          <strong>錯誤：</strong> {error}
        </div>
        <button onClick={() => { setFlow("form"); setError(null); }} style={{ ...btnStyle, background: "var(--color-accent)" }}>
          重試
        </button>
      </div>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────
  return (
    <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>新客戶建站</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "1.5rem" }}>填完表單後 Claude 自動生成完整網站規格</p>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: "2rem" }}>
        {STEPS.map((s) => (
          <div key={s.num} style={{ flex: 1 }}>
            <div style={{
              height: 4, borderRadius: 2,
              background: formStep >= s.num ? "var(--color-accent)" : "var(--color-border)",
              transition: "background 0.3s",
            }} />
            <p style={{ fontSize: "0.7rem", marginTop: 4, color: formStep === s.num ? "var(--color-accent)" : "var(--color-text-secondary)", fontWeight: formStep === s.num ? 600 : 400 }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        步驟 {formStep} / 5 · 預估 {STEPS[formStep - 1].duration}
      </div>

      {error && (
        <p style={{ color: "#c62828", background: "#fee", padding: "0.75rem", borderRadius: 6, marginBottom: "1rem" }}>{error}</p>
      )}

      {/* ── Step 1: 公司 & 品牌 ── */}
      {formStep === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="公司/品牌名稱 *">
            <input required value={form.company_name ?? ""} onChange={e => set("company_name", e.target.value)}
              placeholder="例：AwareWave" style={inputStyle} autoFocus />
          </Field>
          <Field label="品牌標語（選填）">
            <input value={form.brand_tagline ?? ""} onChange={e => set("brand_tagline", e.target.value)}
              placeholder="一句話定位，例：讓 AI 幫你省時間" style={inputStyle} />
          </Field>
          <Field label="產業類別 *">
            <select value={form.industry} onChange={e => set("industry", e.target.value)} style={inputStyle}>
              <option value="service">服務業</option>
              <option value="ecommerce">電商</option>
              <option value="tourism">觀光旅遊</option>
              <option value="arts">藝術創作</option>
              <option value="education">教育</option>
              <option value="other">其他</option>
            </select>
          </Field>
          <Field label="品牌主色（選填）">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="color" value={form.primary_color?.startsWith("#") ? form.primary_color : "#1a73e8"}
                onChange={e => set("primary_color", e.target.value)}
                style={{ width: 44, height: 36, padding: 2, borderRadius: 6, border: "1px solid var(--color-border)", cursor: "pointer" }} />
              <input value={form.primary_color ?? ""} onChange={e => set("primary_color", e.target.value)}
                placeholder="#1a73e8 或「深藍色」" style={{ ...inputStyle, flex: 1 }} />
            </div>
          </Field>
          <Field label="LOGO 狀態">
            <select value={form.logo_status ?? "will_provide"} onChange={e => set("logo_status", e.target.value as IntakeForm["logo_status"])} style={inputStyle}>
              <option value="has_logo">已有 LOGO</option>
              <option value="will_provide">之後提供</option>
              <option value="need_placeholder">需要生成佔位圖</option>
            </select>
          </Field>
        </div>
      )}

      {/* ── Step 2: 客群 & 目標 ── */}
      {formStep === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="主要客群（選填）">
            <textarea value={form.target_audience ?? ""} onChange={e => set("target_audience", e.target.value)}
              placeholder="描述你的目標客戶，例：25-45 歲台灣女性，對健康生活有興趣" rows={4}
              style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <Field label="建站主要目的 *（可多選）">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {PRIMARY_GOALS.map(g => (
                <label key={g.value} style={checkboxLabelStyle((form.primary_goal ?? []).includes(g.value as IntakeForm["primary_goal"][0]))}>
                  <input type="checkbox"
                    checked={(form.primary_goal ?? []).includes(g.value as IntakeForm["primary_goal"][0])}
                    onChange={() => set("primary_goal", toggleArr(form.primary_goal ?? [], g.value as IntakeForm["primary_goal"][0]))}
                    style={{ marginRight: 8 }} />
                  {g.label}
                </label>
              ))}
            </div>
          </Field>
        </div>
      )}

      {/* ── Step 3: 功能需求 ── */}
      {formStep === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="需要哪些頁面 *（可多選）">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {PAGES.map(p => (
                <label key={p.value} style={checkboxLabelStyle((form.pages_needed ?? []).includes(p.value as IntakeForm["pages_needed"][0]))}>
                  <input type="checkbox"
                    checked={(form.pages_needed ?? []).includes(p.value as IntakeForm["pages_needed"][0])}
                    onChange={() => set("pages_needed", toggleArr(form.pages_needed ?? [], p.value as IntakeForm["pages_needed"][0]))}
                    style={{ marginRight: 8 }} />
                  {p.label}
                </label>
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={checkboxLabelStyle(!!form.has_ecommerce)}>
              <input type="checkbox" checked={!!form.has_ecommerce} onChange={e => set("has_ecommerce", e.target.checked)} style={{ marginRight: 8 }} />
              需要線上販售（WooCommerce）
            </label>
            <label style={checkboxLabelStyle(!!form.needs_crm)}>
              <input type="checkbox" checked={!!form.needs_crm} onChange={e => set("needs_crm", e.target.checked)} style={{ marginRight: 8 }} />
              需要 CRM / 客戶名單管理（FluentCRM）
            </label>
            <label style={checkboxLabelStyle(!!form.needs_booking)}>
              <input type="checkbox" checked={!!form.needs_booking} onChange={e => set("needs_booking", e.target.checked)} style={{ marginRight: 8 }} />
              需要預約系統（FluentBooking）
            </label>
          </div>
          {form.has_ecommerce && (
            <Field label="商品類型（可多選）">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {PRODUCT_TYPES.map(p => (
                  <label key={p.value} style={checkboxLabelStyle((form.product_type ?? []).includes(p.value as IntakeForm["product_type"][0]))}>
                    <input type="checkbox"
                      checked={(form.product_type ?? []).includes(p.value as IntakeForm["product_type"][0])}
                      onChange={() => set("product_type", toggleArr(form.product_type ?? [], p.value as IntakeForm["product_type"][0]))}
                      style={{ marginRight: 8 }} />
                    {p.label}
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>
      )}

      {/* ── Step 4: 視覺偏好 + 參考 ── */}
      {formStep === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="視覺風格偏好（可多選）">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {VISUAL_STYLES.map(s => {
                const active = (form.visual_style ?? []).includes(s.value as IntakeForm["visual_style"][0]);
                return (
                  <button key={s.value} type="button"
                    onClick={() => set("visual_style", toggleArr(form.visual_style ?? [], s.value as IntakeForm["visual_style"][0]))}
                    style={{
                      padding: "0.5rem 1rem", borderRadius: 20, border: "1px solid",
                      borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                      background: active ? "var(--color-accent)" : "transparent",
                      color: active ? "#fff" : "var(--color-text-primary)",
                      cursor: "pointer", fontSize: "0.9rem", transition: "all 0.15s",
                    }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="參考網站（最多 3 個，選填）">
            <input value={(form.reference_sites ?? []).join(", ")}
              onChange={e => set("reference_sites", e.target.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3))}
              placeholder="https://example.com, https://another.com" style={inputStyle} />
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: 4 }}>Claude 會參考這些網站的視覺風格</p>
          </Field>
          <Field label="主要語言">
            <select value={form.language ?? "zh-TW"} onChange={e => set("language", e.target.value)} style={inputStyle}>
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="other">其他</option>
            </select>
          </Field>
        </div>
      )}

      {/* ── Step 5: 素材 & 時程 ── */}
      {formStep === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field label="已有文案素材？">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { value: "yes", label: "是，素材齊全" },
                { value: "partial", label: "部分有，需補充" },
                { value: "no", label: "無，需 AI 全部生成" },
              ].map(o => (
                <label key={o.value} style={{ ...checkboxLabelStyle(form.existing_content === o.value), justifyContent: "flex-start" }}>
                  <input type="radio" name="existing_content" value={o.value}
                    checked={form.existing_content === o.value}
                    onChange={() => set("existing_content", o.value)}
                    style={{ marginRight: 8 }} />
                  {o.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="聯絡 Email（選填）">
            <input type="email" value={form.contact_email ?? ""} onChange={e => set("contact_email", e.target.value)}
              placeholder="hello@company.com（用於設定 FluentSMTP）" style={inputStyle} />
          </Field>
          <Field label="現有網域（選填）">
            <input value={form.domain ?? ""} onChange={e => set("domain", e.target.value)}
              placeholder="company.com（無則留空，系統建 staging）" style={inputStyle} />
          </Field>
          <Field label="預算級別 *">
            <select value={form.budget_tier} onChange={e => set("budget_tier", e.target.value as IntakeForm["budget_tier"])} style={inputStyle}>
              <option value="starter">Starter — 基本品牌展示站</option>
              <option value="business">Business — 品牌 + CRM + 行銷功能</option>
              <option value="enterprise">Enterprise — 全功能電商/預約平台</option>
            </select>
          </Field>
          <Field label="上線時程">
            <select value={form.launch_urgency ?? "no_rush"} onChange={e => set("launch_urgency", e.target.value as IntakeForm["launch_urgency"])} style={inputStyle}>
              <option value="within_month">1 個月內</option>
              <option value="one_to_three_months">1-3 個月</option>
              <option value="no_rush">無特定時程</option>
            </select>
          </Field>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", gap: 12 }}>
        <button type="button" onClick={prevStep} disabled={formStep === 1}
          style={{ ...btnStyle, background: "transparent", color: "var(--color-text-primary)", border: "1px solid var(--color-border)", opacity: formStep === 1 ? 0.4 : 1 }}>
          ← 上一步
        </button>
        {formStep < 5 ? (
          <button type="button" onClick={nextStep} style={{ ...btnStyle, background: "var(--color-accent)" }}>
            下一步 →
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} style={{ ...btnStyle, background: "var(--color-accent)" }}>
            生成網站規格 →
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  fontSize: "0.9rem",
  background: "var(--color-bg-secondary)",
  color: "var(--color-text-primary)",
  width: "100%",
};

const btnStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: "0.95rem",
  cursor: "pointer",
  color: "#fff",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-bg-secondary)",
  borderRadius: 8,
  padding: "1.25rem",
  marginBottom: "1rem",
};

function checkboxLabelStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    padding: "0.6rem 0.75rem",
    borderRadius: 6,
    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
    background: active ? "rgba(var(--color-accent-rgb, 99, 102, 241), 0.08)" : "transparent",
    cursor: "pointer",
    fontSize: "0.9rem",
    userSelect: "none",
    transition: "border-color 0.15s",
  };
}
